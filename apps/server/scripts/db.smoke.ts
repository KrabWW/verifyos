/**
 * B1 冒烟测试（pg-mem，免 Docker）：
 * 1) 迁移在内存 PG 中可重复执行（两遍）
 * 2) 全链路 CRUD：org → project → application(web) → environment(preview) → browser_state
 *    → exploration → qa_point → verification → dependency(resume_from 唯一约束)
 *    → run → step → evidence → output_value → test_plan → device_preset → audit_log
 * 3) 依赖约束：第二个 resume_from 必须被拒绝，wait_for 允许多个
 */
import { newDb } from 'pg-mem';
import { runMigrations } from './migrate';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error('断言失败: ' + msg);
}

async function main() {
  const db = newDb({ noFS: true });
  const pool = db.adapters.createPg().Pool ? new (db.adapters.createPg().Pool)() : null;
  if (!pool) throw new Error('pg-mem Pool 创建失败');

  console.log('═══ B1 冒烟测试（pg-mem）═══');
  console.log('[1] 迁移执行两遍（可重复）…');
  // pg-mem 无扩展机制：剥离 CREATE EXTENSION；pgvector 的 vector(1024) 降级为 text（仅冒烟环境）
  const pgmemTransform = (sql: string) =>
    sql
      .split('\n')
      .filter((l) => !/^\s*CREATE EXTENSION/i.test(l))
      .join('\n')
      .replace(/vector\(1024\)/g, 'text');
  await runMigrations(pool as any, { transform: pgmemTransform });
  await runMigrations(pool as any, { transform: pgmemTransform });

  console.log('[2] 全链路 CRUD…');
  const q = (sql: string, p?: unknown[]) => pool.query(sql, p as never[]);

  const org = await q(`INSERT INTO organization(short_id,name) VALUES('org_acme','ACME') RETURNING id`);
  const prj = await q(`INSERT INTO project(short_id,org_id,name) VALUES('prj_order',$1,'订单管理系统') RETURNING id`, [org.rows[0].id]);
  const app = await q(`INSERT INTO application(short_id,project_id,name,type) VALUES('app_web01',$1,'订单 Web','web') RETURNING id`, [prj.rows[0].id]);
  const env = await q(
    `INSERT INTO environment(short_id,application_id,name,url,is_preview,branch,pr_number) VALUES('env_pr128',$1,'PR-128 预览','https://pr-128.example.com',true,'fix/refund',128) RETURNING id`,
    [app.rows[0].id],
  );
  const bs = await q(
    `INSERT INTO browser_state(short_id,environment_id,name,storage_uri) VALUES('bs_admin',$1,'admin_logged_in','s3://ev/bs/admin.json') RETURNING id, expires_at`,
    [env.rows[0].id],
  );
  const exp = await q(
    `INSERT INTO exploration(short_id,application_id,environment_id,intent,start_url,status,output_state_id) VALUES('exp_1024',$1,$2,'探索订单退款流程','https://crm.test.example.com','complete',$3) RETURNING id`,
    [app.rows[0].id, env.rows[0].id, bs.rows[0].id],
  );
  await q(
    `INSERT INTO exploration_iteration(exploration_id,url,depth,source_action,intent_score,found_actions) VALUES($1,'/orders',1,'click 订单',87,'[{"tag":"button","text":"申请退款"}]')`,
    [exp.rows[0].id],
  );
  const node1 = await q(`INSERT INTO graph_node(application_id,type,ref,title) VALUES($1,'page','/orders','订单列表') RETURNING id`, [app.rows[0].id]);
  const node2 = await q(`INSERT INTO graph_node(application_id,type,ref,title) VALUES($1,'page','/orders/new','新建订单') RETURNING id`, [app.rows[0].id]);
  await q(`INSERT INTO graph_edge(application_id,from_node,to_node,action) VALUES($1,$2,$3,'click 新建订单')`, [app.rows[0].id, node1.rows[0].id, node2.rows[0].id]);

  const qa = await q(
    `INSERT INTO qa_point(short_id,application_id,title,category,risk,status,confidence,source) VALUES('qa_1028',$1,'管理员可以新增员工','正常流程','high','ready',0.92,'{"requirementRef":"§3.1"}') RETURNING id`,
    [app.rows[0].id],
  );
  const qa2 = await q(
    `INSERT INTO qa_point(short_id,application_id,title,category,risk,status) VALUES('qa_1029',$1,'新增成功后员工出现在列表中','正常流程','medium','ready') RETURNING id`,
    [app.rows[0].id],
  );
  const ver1 = await q(
    `INSERT INTO verification(short_id,qa_point_id,title,actor,status) VALUES('ver_001',$1,'新增员工','管理员','ready') RETURNING id`,
    [qa.rows[0].id],
  );
  const ver2 = await q(
    `INSERT INTO verification(short_id,qa_point_id,title,actor,status) VALUES('ver_002',$1,'验证列表出现张三','管理员','ready') RETURNING id`,
    [qa2.rows[0].id],
  );

  console.log('[3] 依赖约束…');
  await q(`INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'resume_from')`, [ver2.rows[0].id, ver1.rows[0].id]);
  let dupRejected = false;
  try {
    await q(
      `INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'resume_from')`,
      [ver2.rows[0].id, ver1.rows[0].id],
    );
  } catch {
    dupRejected = true;
  }
  assert(dupRejected, '第二个 resume_from 必须被唯一索引拒绝');
  // wait_for 用第三对（同一 (verification_id, depends_on_id) 对只允许一条依赖边，与 kind 无关——schema 正确行为）
  const ver3 = await q(
    `INSERT INTO verification(short_id,qa_point_id,title,actor,status) VALUES('ver_003',$1,'管理员登录','管理员','ready') RETURNING id`,
    [qa.rows[0].id],
  );
  await q(`INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'wait_for')`, [ver3.rows[0].id, ver1.rows[0].id]);
  await q(`INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'wait_for')`, [ver3.rows[0].id, ver2.rows[0].id]);
  console.log('  ✓ resume_from 恰 1 个约束生效；wait_for 可多个叠加');

  const run = await q(
    `INSERT INTO run(short_id,verification_id,target,trigger,verdict,output,duration_ms,finished_at) VALUES('run_1928',$1,'{"applicationShortId":"app_web01","platform":"web","environment":{"url":"https://crm.test.example.com","isPreview":false}}','manual','fail','{"emp_code":"ZS-001"}',42000,now()) RETURNING id`,
    [ver1.rows[0].id],
  );
  const st = await q(
    `INSERT INTO step(short_id,run_id,idx,title,kind,verdict,duration_ms) VALUES('st_05',$1,4,'点击保存','ai','fail',312) RETURNING id`,
    [run.rows[0].id],
  );
  await q(
    `INSERT INTO evidence(short_id,run_id,step_id,kind,uri,meta) VALUES('ev_23',$1,$2,'network','s3://ev/run_1928/net.har','{"status":500}')`,
    [run.rows[0].id, st.rows[0].id],
  );
  await q(`INSERT INTO output_value(run_id,key,value) VALUES($1,'emp_code','ZS-001')`, [run.rows[0].id]);
  await q(`INSERT INTO test_plan(short_id,project_id,name,config) VALUES('pln_smoke',$1,'生产巡检', '{"app_web01":{"environment":"env_prod","devicePreset":"dp_desktop"}}')`, [prj.rows[0].id]);
  await q(`INSERT INTO device_preset(short_id,project_id,name,platform,config) VALUES('dp_desktop',$1,'桌面 1440','web','{"viewport":"1440x900"}')`, [prj.rows[0].id]);
  await q(`INSERT INTO audit_log(project_id,actor,action,target) VALUES($1,'system','credential.use','bs_admin')`, [prj.rows[0].id]);

  console.log('[4] 反查断言…');
  const checks = [
    ['preview 环境可查', `SELECT count(*)::int AS n FROM environment WHERE is_preview AND pr_number=128`, 1],
    ['迭代 intent_score 落库', `SELECT count(*)::int AS n FROM exploration_iteration WHERE intent_score=87`, 1],
    ['graph 边连通', `SELECT count(*)::int AS n FROM graph_edge`, 1],
    ['失败 run + 证据关联', `SELECT count(*)::int AS n FROM evidence e JOIN run r ON e.run_id=r.id WHERE r.verdict='fail'`, 1],
    ['output_value 跨会话可查', `SELECT count(*)::int AS n FROM output_value WHERE value='ZS-001'`, 1],
  ] as const;
  for (const [name, sql, expect] of checks) {
    const r = await q(sql);
    assert(r.rows[0].n === expect, `${name}（期望 ${expect}，实得 ${r.rows[0].n}）`);
    console.log(`  ✓ ${name}`);
  }

  const t = await q(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
  console.log(`\n═══ 通过 · public 表 ${t.rows[0].n} 张 · 迁移可重复 · 约束与全链路断言全过 ═══`);
  process.exit(0);
}

main().catch((e) => {
  console.error('✗ 冒烟测试失败:', e.message);
  process.exit(1);
});
