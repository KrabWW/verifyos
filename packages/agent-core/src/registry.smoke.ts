/**
 * E1 冒烟：ToolRegistry 权限三档 + 审计
 *   [1] db.query（auto）：SELECT 直执行 + 强制 LIMIT + 非 SELECT 拒绝
 *   [2] db.exec（ask）：批准后执行 / 拒绝路径
 *   [3] forbidden 拒绝
 *   [4] 审计全量（via: auto/approval/denied）
 *   [5] 清单 = 8 内置工具
 *
 * 运行：npx tsx src/registry.smoke.ts（纯 pg-mem）
 */
import { newDb } from 'pg-mem';
import { ToolRegistry, registerBuiltinTools, makeDbQueryTool, makeDbExecTool } from './registry.js';
import { ApprovalManager } from './approval.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
    failures++;
  }
}

async function main() {
  console.log('[E1] ToolRegistry 权限三档 + 审计');
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  const raw = `
    CREATE TABLE IF NOT EXISTS qa_point (id bigserial PRIMARY KEY, title text, risk text);
    INSERT INTO qa_point(title, risk) VALUES ('退款幂等拦截', 'high'), ('登录越权', 'high');
  `;
  await pool.query(raw);

  const approvals = new ApprovalManager();
  const registry = new ToolRegistry(approvals);
  registerBuiltinTools(registry);

  // [5] 清单
  const list = registry.list();
  check('8 内置工具注册', list.length === 8, `实际 ${list.length}`);
  check('db.exec 是 ask 档', list.find((t) => t.name === 'db.exec')?.permission === 'ask');
  check('vision 是 ask 档', list.find((t) => t.name === 'vision')?.permission === 'ask');

  // [1] db.query auto
  const q1 = await registry.invoke('db.query', { sql: 'SELECT * FROM qa_point' }, { pool });
  const d1 = q1.data as { rows: unknown[]; sql: string };
  check('query auto 执行返回 2 行', q1.ok && d1.rows.length === 2);
  check('自动补 LIMIT', d1.sql.toUpperCase().includes('LIMIT 100'));
  const q2 = await registry.invoke('db.query', { sql: 'INSERT INTO qa_point(title) VALUES (1)' }, { pool });
  check('非 SELECT 被拒', !q2.ok && (q2.error ?? '').includes('仅允许 SELECT'));

  // [2] db.exec ask：批准
  const execDone = (async () => {
    const p = registry.invoke('db.exec', { sql: "INSERT INTO qa_point(title, risk) VALUES ('退款金额>0校验', 'high')" }, { pool });
    // 模拟用户 300ms 后批准
    setTimeout(() => {
      const pending = approvals.listPending()[0];
      if (pending) approvals.submit(pending.id, { approved: true, values: {} });
    }, 300);
    return await p;
  })();
  const r1 = await execDone;
  check('exec 批准后执行成功', r1.ok, r1.error);
  const after = await pool.query(`SELECT count(*)::int AS n FROM qa_point`);
  check('写操作真实落库（count=3）', after.rows[0].n === 3);

  // [2b] db.exec ask：拒绝
  const execDenied = (async () => {
    const p = registry.invoke('db.exec', { sql: 'DELETE FROM qa_point' }, { pool });
    setTimeout(() => {
      const pending = approvals.listPending()[0];
      if (pending) approvals.submit(pending.id, { approved: false, reason: 'rejected' });
    }, 300);
    return await p;
  })();
  const r2 = await execDenied;
  check('exec 人工拒绝 → 拒绝执行', !r2.ok && (r2.error ?? '').includes('拒绝'));
  const after2 = await pool.query(`SELECT count(*)::int AS n FROM qa_point`);
  check('DELETE 未执行（count 仍 3）', after2.rows[0].n === 3);

  // [3] forbidden：直接注册一个 forbidden 工具验证门控
  registry.register({ name: 'prod.write', description: '生产库写入', permission: 'forbidden', run: async () => ({ ok: true }) });
  const r3 = await registry.invoke('prod.write', {});
  check('forbidden 直接拒绝', !r3.ok && (r3.error ?? '').includes('禁止'));

  // [4] 审计
  const audit = registry.audit();
  const vias = audit.map((a) => a.via);
  check('审计条数 = 调用数（5）', audit.length === 5, `实际 ${audit.length}`);
  check('审计含 auto/approval/denied 三种 via', vias.includes('auto') && vias.includes('approval') && vias.includes('denied'));
  check('审计记录 args（可追责）', audit.every((a) => typeof a.args === 'object'));

  console.log(failures === 0 ? '\n✅ E1 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
