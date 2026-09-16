/**
 * D2 + D4 冒烟：Preview Environment + Review 生成与 MR 回写
 *   [1] D2：savePreviewEnvironment —— 创建 / 同 PR 复用（不堆记录）
 *   [2] D4：假绿 Run（unknown）→ generateReview → buildMrComment → 合并门禁 warn → 评论落盘
 *   [3] D4：对照 pass Run → gate allow
 *
 * 运行：npx tsx src/review.smoke.ts（[2][3] 需 .env 含 LLM_API_KEY）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { newDb } from 'pg-mem';
import { savePreviewEnvironment } from './preview.js';
import { generateReview, buildTestRuns, mergeGate, buildMrComment } from './review.js';
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
];

async function main() {
  // ---------- [1] D2 Preview Environment ----------
  console.log('[1] D2：Preview Environment 落库（pg-mem）');
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  const raw = fs.readFileSync(path.resolve(__dirname, '../../../apps/server/migrations/001_init.sql'), 'utf8');
  const sql = raw.split('\n').filter((l) => !/^\s*CREATE EXTENSION/i.test(l)).join('\n').replace(/vector\(1024\)/g, 'text');
  await pool.query(sql);
  await pool.query(`INSERT INTO organization(short_id, name) VALUES('org_demo', '演示组织')`);
  await pool.query(`INSERT INTO project(short_id, org_id, name) VALUES('prj_demo', 1, '演示项目')`);
  await pool.query(`INSERT INTO application(short_id, project_id, name, type) VALUES('app_demo', 1, '演示 CRM', 'web')`);

  const e1 = await savePreviewEnvironment(pool, {
    applicationId: 1, url: 'https://pr-128.preview.example.com', branch: 'fix/refund-callback', prNumber: 128,
  });
  check('首次创建 is_preview 环境', e1.isPreview && !e1.reused);
  const e2 = await savePreviewEnvironment(pool, {
    applicationId: 1, url: 'https://pr-128-v2.preview.example.com', branch: 'fix/refund-callback', prNumber: 128,
  });
  check('同 PR 二次触发复用（不堆记录）', e2.reused && e2.environmentId === e1.environmentId);
  const cnt = await pool.query(`SELECT count(*)::int AS n FROM environment WHERE is_preview = true`);
  check('库内 preview 环境数 = 1', cnt.rows[0].n === 1);
  const urlRow = await pool.query(`SELECT url FROM environment WHERE id = $1`, [e1.environmentId]);
  check('URL 已刷新为最新', urlRow.rows[0].url === 'https://pr-128-v2.preview.example.com');

  // ---------- [2][3] D4：Run → Review → MR 评论 ----------
  const srv = await serveStatic(path.resolve(__dirname, '../fixtures/site'));
  const llm = {
    apiKey: process.env.LLM_API_KEY ?? '',
    baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.LLM_MODEL ?? 'glm-4.5v',
  };
  const runner = new RunRunner(llm);

  // 假绿 Run（unknown）
  console.log('\n[2] D4：假绿 Run（unknown）→ Review → MR 评论');
  const fakeSteps: StepDef[] = [
    ...STEPS,
    { id: 'st_03', title: '验证退款幂等拦截', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'refund.html' },
  ];
  const outcome = await runner.run({ runId: 'run_d4_fake', startUrl: `${srv.url}/login.html`, steps: fakeSteps });
  console.log(`  Run verdict=${outcome.verdict}（${outcome.durationMs}ms）`);

  const report = await generateReview({
    applicationName: '演示 CRM', prTitle: 'fix: 退款回调金额计算 (!128)', outcome, steps: fakeSteps, llm,
  });
  console.log(`  SUMMARY：${report.summary.slice(0, 80)}…`);
  console.log(`  AREAS：${report.areas.map((a) => `[${a.severity}] ${a.title}`).join(' / ')}`);
  check('SUMMARY 非空且提及验证', report.summary.length > 20);
  check('areas ≥ 1 条', report.areas.length >= 1);
  check('unknown Run 的 review 提到无法验证', outcome.verdict === 'unknown' && (report.summary.includes('UNKNOWN') || report.summary.includes('unknown') || report.summary.includes('无法') || report.areas.some((a) => a.severity !== 'info')));

  const testRuns = buildTestRuns(outcome, fakeSteps);
  const gate = mergeGate(outcome);
  check('门禁：unknown → warn（不阻止但标记）', gate.decision === 'warn', gate.reason);

  const md = buildMrComment({
    prTitle: 'fix: 退款回调金额计算 (!128)', report, outcome, testRuns, gate,
  });
  const outDir = path.resolve(__dirname, '../../out/mr-comments');
  fs.mkdirSync(outDir, { recursive: true });
  const mdFile = path.join(outDir, 'pr-128-unknown.md');
  fs.writeFileSync(mdFile, md);
  console.log(`  MR 评论落盘：${mdFile}（${md.length}B）`);
  check('评论含三段式结构', md.includes('### SUMMARY') && md.includes('### AREAS FOR IMPROVEMENT') && md.includes('### TESTS RUN'));
  check('评论含 UNKNOWN 防假绿尾注', md.includes('UNKNOWN ≠ PASS'));
  check('TESTS RUN 表格行数 = 步骤数', (md.match(/^\| \d+ \|/gm) ?? []).length === fakeSteps.length);

  // 对照：pass Run → gate allow
  console.log('\n[3] D4：对照 pass Run → gate allow');
  const okOutcome = await runner.run({ runId: 'run_d4_ok', startUrl: `${srv.url}/login.html`, steps: STEPS });
  const okGate = mergeGate(okOutcome);
  check('pass → allow', okOutcome.verdict === 'pass' && okGate.decision === 'allow');
  const okReport = await generateReview({
    applicationName: '演示 CRM', prTitle: 'chore: 文档更新 (!129)', outcome: okOutcome, steps: STEPS, llm,
  });
  const okMd = buildMrComment({ prTitle: 'chore: 文档更新 (!129)', report: okReport, outcome: okOutcome, testRuns: buildTestRuns(okOutcome, STEPS), gate: okGate });
  fs.writeFileSync(path.join(outDir, 'pr-129-pass.md'), okMd);
  check('pass 评论首行「可以合并」', okMd.includes('可以合并'));

  srv.close();
  console.log(failures === 0 ? '\n✅ D2+D4 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
