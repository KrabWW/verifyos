/**
 * C3 冒烟：UNKNOWN 触达校验（防假绿）
 *   [1] 纯函数单测：触达→pass / 未触达→unknown（graph 有节点/无节点两种解释）/ 失败透传
 *   [2] 真实浏览器假绿用例：断言全绿但 targetRef 指向从未触达的 refund 分支 → Run verdict=unknown
 *   [3] 对照组：targetRef 真实触达 → pass
 *
 * 运行：npx tsx src/reachability.smoke.ts（[2][3] 需 .env 含 LLM_API_KEY——st_01 用确定性登录，无需 LLM 也可）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { verifyReachability, aggregateVerdicts } from './reachability.js';
import { RunRunner, type StepDef } from './runner.js';
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

// ---------- [1] 纯函数单测 ----------
function unitTests() {
  console.log('[1] verifyReachability 纯函数');
  const graph = {
    nodes: [{ ref: 'http://x/list.html' }, { ref: 'http://x/detail.html' }],
    edges: [{ fromRef: 'http://x/list.html', toRef: 'http://x/detail.html' }],
  };

  const hit = verifyReachability({
    stepId: 's1', stepTitle: 't', targetRef: 'detail.html', stepVerdict: 'pass',
    visitedUrls: ['http://x/list.html', 'http://x/detail.html'], graph,
  });
  check('已触达 → pass', hit.verdict === 'pass' && hit.matchedUrl === 'http://x/detail.html');

  const missNoNode = verifyReachability({
    stepId: 's2', stepTitle: 't', targetRef: 'refund.html', stepVerdict: 'pass',
    visitedUrls: ['http://x/list.html'], graph,
  });
  check('未触达且 graph 无节点 → unknown', missNoNode.verdict === 'unknown');
  check('解释含「不存在」与「不允许假绿」', missNoNode.explanation.includes('不存在') && missNoNode.explanation.includes('不允许假绿'));

  const missWithNode = verifyReachability({
    stepId: 's3', stepTitle: 't', targetRef: 'detail.html', stepVerdict: 'pass',
    visitedUrls: ['http://x/list.html'], graph,
  });
  check('未触达但 graph 有节点 → unknown（路径未经过）', missWithNode.verdict === 'unknown' && missWithNode.graphHasNode && missWithNode.explanation.includes('未经过'));

  const failed = verifyReachability({
    stepId: 's4', stepTitle: 't', targetRef: 'x.html', stepVerdict: 'fail',
    visitedUrls: [], graph,
  });
  check('步骤失败 → 透传 fail（不做触达改判）', failed.verdict === 'fail');

  check('聚合：fail 优先', aggregateVerdicts([], ['pass', 'fail']) === 'fail');
  check('聚合：unknown 次之', aggregateVerdicts([{ stepId: 'a', verdict: 'unknown', explanation: '', graphHasNode: false }], ['pass', 'pass']) === 'unknown');
  check('聚合：全 pass → pass', aggregateVerdicts([], ['pass']) === 'pass');
}

// ---------- [2][3] 真实浏览器 ----------
async function browserTests() {
  const srv = await serveStatic(path.resolve(__dirname, '../fixtures/site'));
  const runner = new RunRunner({
    apiKey: process.env.LLM_API_KEY ?? '',
    baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.LLM_MODEL ?? 'glm-4.5v',
  });

  console.log('\n[2] 假绿用例（断言全绿但 targetRef=refund.html 从未触达 → 应判 UNKNOWN）');
  const fakeGreen: StepDef[] = [
    {
      id: 'st_01', title: '管理员登录', kind: 'module',
      actions: [
        { type: 'fill', selector: '#username', value: 'admin' },
        { type: 'fill', selector: '#password', value: 'test123' },
        { type: 'click', selector: 'button[type="submit"]' },
      ],
    },
    // 假绿：断言只检查 list 页（必然过），但声称要验证退款分支（fixture 里不存在）
    { id: 'st_02', title: '验证退款幂等拦截', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'refund.html' },
  ];
  const r1 = await runner.run({ runId: 'run_c3_fake', startUrl: `${srv.url}/login.html`, steps: fakeGreen });
  console.log(`  verdict=${r1.verdict} · failureSummary=${r1.failureSummary?.slice(0, 60)}…`);
  check('R1 步骤执行全绿（st_02 原始断言过）', r1.stepResults.every((s) => s.verdict !== 'fail'));
  check('R1 st_02 触达校验改判 unknown', r1.reachability.find((c) => c.stepId === 'st_02')?.verdict === 'unknown');
  check('R1 Run verdict=unknown（UNKNOWN ≠ PASS）', r1.verdict === 'unknown');
  check('R1 事件流 run.completed verdict=unknown', r1.events.find((e) => e.type === 'run.completed')?.verdict === 'unknown');
  check('R1 解释含「未触达」', (r1.failureSummary ?? '').includes('未触达'));

  console.log('\n[3] 对照组（targetRef=list.html 真实触达 → pass）');
  const control: StepDef[] = [
    {
      id: 'st_01', title: '管理员登录', kind: 'module',
      actions: [
        { type: 'fill', selector: '#username', value: 'admin' },
        { type: 'fill', selector: '#password', value: 'test123' },
        { type: 'click', selector: 'button[type="submit"]' },
      ],
    },
    { id: 'st_02', title: '到达员工列表', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html' },
  ];
  const r2 = await runner.run({ runId: 'run_c3_ctrl', startUrl: `${srv.url}/login.html`, steps: control });
  console.log(`  verdict=${r2.verdict}`);
  check('R2 Run verdict=pass（真触达不受影响）', r2.verdict === 'pass', r2.failureSummary);
  check('R2 st_02 触达校验 pass 且有 matchedUrl', r2.reachability.find((c) => c.stepId === 'st_02')?.verdict === 'pass');
  check('R2 visitedUrls 采样 ≥ 2', r2.visitedUrls.length >= 2, JSON.stringify(r2.visitedUrls));

  srv.close();
}

async function main() {
  unitTests();
  await browserTests();
  console.log(failures === 0 ? '\n✅ C3 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
