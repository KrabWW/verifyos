/**
 * C1 冒烟：RunRunner 混合步骤引擎（真实浏览器 + GLM）
 *   [1] 首跑：module 确定性登录（llmCalls=0）→ assertion → ai 步骤（LLM）→ assertion
 *   [2] 二跑：同 Runner 实例复用缓存 —— ai 步骤若 selector 提取成功则零 LLM 重放
 *   断言：事件序列完整 / verdict=pass / llmCalls 可观测 / 缓存统计
 *
 * 运行：npx tsx src/runner.smoke.ts（需根目录 .env 含 LLM_API_KEY）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
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

const STEPS: StepDef[] = [
  {
    id: 'st_01', title: '管理员登录', kind: 'module',
    actions: [
      { type: 'fill', selector: '#username', value: 'admin' },
      { type: 'fill', selector: '#password', value: 'test123' },
      { type: 'click', selector: 'button[type="submit"]' },
    ],
  },
  { id: 'st_02', title: '进入员工列表', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' } },
  { id: 'st_03', title: '打开关于页', kind: 'ai', instruction: '点击页面上的「关于我们」链接' },
  { id: 'st_04', title: '关于页可达', kind: 'assertion', assert: { kind: 'url_contains', value: 'about.html' } },
];

async function main() {
  const srv = await serveStatic(path.resolve(__dirname, '../fixtures/site'));
  const llm = {
    apiKey: process.env.LLM_API_KEY ?? '',
    baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.LLM_MODEL ?? 'glm-4.5v',
  };
  const runner = new RunRunner(llm);

  // ---------- [1] 首跑 ----------
  console.log('[1] 首跑（4 步：module/assertion/ai/assertion）');
  const r1 = await runner.run({
    runId: 'run_c1_first',
    startUrl: `${srv.url}/login.html`,
    steps: STEPS,
    onEvent: (e) => {
      if (e.type === 'step.action') {
        const args = (e as { args?: Record<string, unknown> }).args ?? {};
        console.log(`  ▶ ${e.type} [${(e as { stepId?: string }).stepId}] ${(args as { instruction?: string; selector?: string }).instruction ?? (args as { selector?: string }).selector ?? ''} llm=${(args as { llmCalls?: number }).llmCalls ?? '-'}${(args as { cache?: string }).cache ? ' cache=hit' : ''}`);
      } else if (e.type === 'step.completed') {
        console.log(`  ✓ ${(e as { stepId?: string }).stepId} ${(e as { verdict?: string }).verdict}`);
      }
    },
  });
  console.log(`  结果：verdict=${r1.verdict} · ${r1.durationMs}ms · llmCalls=${r1.llmCalls} · 缓存=${JSON.stringify(r1.cache)}`);
  const types1 = r1.events.map((e) => e.type);
  check('R1 verdict=pass', r1.verdict === 'pass', r1.failureSummary);
  check('R1 事件首尾完整', types1[0] === 'run.started' && types1[types1.length - 1] === 'run.completed');
  check('R1 4 组 step.started/completed', types1.filter((t) => t === 'step.started').length === 4 && types1.filter((t) => t === 'step.completed').length === 4);
  const st1 = r1.stepResults.find((s) => s.id === 'st_01');
  check('R1 st_01 确定性步骤 llmCalls=0（可观测）', st1?.llmCalls === 0);
  check('R1 st_03 ai 步骤消耗 1 次 LLM', r1.stepResults.find((s) => s.id === 'st_03')?.llmCalls === 1);
  check('R1 总 llmCalls ≤ 2', r1.llmCalls <= 2, `实际 ${r1.llmCalls}`);

  // ---------- [2] 二跑（缓存复用） ----------
  console.log('\n[2] 二跑（同 Runner 实例，验证缓存）');
  const r2 = await runner.run({ runId: 'run_c1_second', startUrl: `${srv.url}/login.html`, steps: STEPS });
  const st3b = r2.stepResults.find((s) => s.id === 'st_03');
  console.log(`  结果：verdict=${r2.verdict} · ${r2.durationMs}ms · llmCalls=${r2.llmCalls} · 缓存=${JSON.stringify(r2.cache)} · st_03 cacheHit=${st3b?.cacheHit}`);
  check('R2 verdict=pass', r2.verdict === 'pass', r2.failureSummary);
  if (r2.cache.entries > 0) {
    check('R2 缓存命中：st_03 cacheHit=true', st3b?.cacheHit === true);
    check('R2 st_03 零 LLM 重放', st3b?.llmCalls === 0);
    check('R2 totalHits ≥ 1', r2.cache.totalHits >= 1);
  } else {
    console.log('  ℹ act 结果未暴露 selector —— 缓存保持 miss（正确性不受影响），记录为已知限制');
    check('R2 未命中时正确走 LLM', st3b?.llmCalls === 1);
  }
  check('R2 事件流同样完整', r2.events[0].type === 'run.started' && r2.events[r2.events.length - 1].type === 'run.completed');

  srv.close();
  console.log(failures === 0 ? '\n✅ C1 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
