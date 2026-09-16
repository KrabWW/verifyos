/**
 * B3 冒烟：凭据动态表单全链路
 *   [1] crypto：AES-256-GCM 往返 / 密文随机性 / 错 key 拒绝
 *   [2] ApprovalManager：request→submit / timeout 拒绝 / listPending
 *   [3] 全链路：crawler 无凭据遇墙 → 挂起发请求 → 模拟用户 1.5s 后提交 → 自动续登爬通内页
 *
 * 运行：npx tsx src/approval.smoke.ts（需根目录 .env 含 LLM_API_KEY / CREDENTIAL_ENCRYPTION_KEY）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { CredentialCrypto } from './crypto.js';
import { ApprovalManager, type ApprovalRequest } from './approval.js';
import { Crawler } from './crawler.js';
import { serveStatic } from './static-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
    failures++;
  }
}

async function main() {
  // ---------- [1] crypto ----------
  console.log('[1] CredentialCrypto（AES-256-GCM）');
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY ?? CredentialCrypto.generateKey();
  const c = new CredentialCrypto(keyHex);
  const plain = JSON.stringify({ username: 'admin', password: 'test123' });
  const enc1 = c.encrypt(plain);
  const enc2 = c.encrypt(plain);
  check('往返一致', c.decrypt(enc1) === plain);
  check('密文 ≠ 明文', !enc1.includes('admin'));
  check('同明文不同密文（随机 iv）', enc1 !== enc2);
  let wrongKeyFails = false;
  try {
    new CredentialCrypto(CredentialCrypto.generateKey()).decrypt(enc1);
  } catch {
    wrongKeyFails = true;
  }
  check('错 key 解密失败（GCM 完整性）', wrongKeyFails);

  // ---------- [2] ApprovalManager ----------
  console.log('\n[2] ApprovalManager 门控');
  const am = new ApprovalManager();
  const events: string[] = [];
  am.on('requested', (r: ApprovalRequest) => events.push(`requested:${r.kind}`));
  am.on('resolved', (_id: string, r: { approved: boolean }) => events.push(`resolved:${r.approved}`));

  const p1 = am.request({
    kind: 'credential', title: 't', reason: 'r',
    fields: [{ key: 'username', label: '用户名', type: 'text', required: true }],
    context: {}, timeoutMs: 5000,
  });
  check('request 后 pending 可见', am.listPending().length === 1);
  const id1 = am.listPending()[0].id;
  check('submit 成功返回 true', am.submit(id1, { approved: true, values: { username: 'u' } }));
  const r1 = await p1;
  check('resolve 携带 values', r1.approved && (r1 as { values: Record<string, string> }).values.username === 'u');
  check('事件序列 requested→resolved', events.join(',') === 'requested:credential,resolved:true', events.join(','));
  check('重复 submit 返回 false', !am.submit(id1, { approved: false }));

  const p2 = am.request({
    kind: 'credential', title: 't', reason: 'r', fields: [], context: {}, timeoutMs: 200,
  });
  const r2 = await p2;
  check('timeout 自动拒绝', !r2.approved && (r2 as { reason?: string }).reason === 'timeout');

  // ---------- [3] 全链路：遇墙弹卡续爬 ----------
  console.log('\n[3] 全链路：crawler 遇登录墙 → approval 弹卡 → 1.5s 后用户提交 → 自动续登');
  const srv = await serveStatic(path.resolve(__dirname, '../fixtures/site'));
  const approvals = new ApprovalManager();
  const seen: string[] = [];
  approvals.on('requested', (req: ApprovalRequest) => {
    seen.push(`requested:${req.fields.map((f) => f.key).join('+')}`);
    // 模拟前端弹卡 + 用户 1.5s 后填写提交
    setTimeout(() => {
      approvals.submit(req.id, { approved: true, values: { username: 'admin', password: 'test123' } });
    }, 1500);
  });

  const t0 = Date.now();
  const result = await new Crawler().crawl({
    startUrl: `${srv.url}/login.html`,
    maxDepth: 3,
    maxPages: 20,
    approval: approvals,
    credentialRole: '管理员',
    llm: {
      apiKey: process.env.LLM_API_KEY ?? '',
      baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
    },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const urls = result.pages.map((p) => p.url);
  console.log(`  爬取页面：${urls.map((u) => u.replace(srv.url, '')).join(', ')}（${elapsed}s）`);

  check('门控请求发出（含 username+password 表单）', seen.length === 1 && seen[0] === 'requested:username+password', seen.join(','));
  check('确实等待过用户输入（≥1.5s）', Date.now() - t0 >= 1500, `${elapsed}s`);
  check('补充凭据后登录成功', result.authenticated);
  check('爬进内页 list.html', urls.some((u) => u.includes('list.html')));
  check('产出 Output State', !!result.outputStateJson?.includes('session'));
  check('产出凭据可加密存储（模拟落库往返）', (() => {
    const stored = c.encrypt(JSON.stringify({ username: 'admin', password: 'test123' }));
    const back = JSON.parse(c.decrypt(stored));
    return back.username === 'admin' && back.password === 'test123';
  })());

  srv.close();
  console.log(failures === 0 ? '\n✅ B3 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
