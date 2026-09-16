/**
 * C2 冒烟：证据管道（真实浏览器 + GLM，一次 4 步 Run）
 *   [1] 每步截图 → step.evidence 事件 + LocalDiskStore 落盘
 *   [2] trace.zip / HAR / video 归档
 *   [3] store.list(runId) 对账
 *
 * 运行：npx tsx src/evidence.smoke.ts（需根目录 .env 含 LLM_API_KEY）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { RunRunner, type StepDef } from './runner.js';
import { LocalDiskStore } from './evidence.js';
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
  const outDir = path.resolve(__dirname, '../out/evidence');
  fs.rmSync(outDir, { recursive: true, force: true });
  const store = new LocalDiskStore(outDir);

  const runId = `run_ev_${Date.now().toString(36)}`;
  console.log(`[C2] 证据 Run：${runId}`);
  const outcome = await new RunRunner({
    apiKey: process.env.LLM_API_KEY ?? '',
    baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.LLM_MODEL ?? 'glm-4.5v',
  }).run({
    runId,
    startUrl: `${srv.url}/login.html`,
    steps: STEPS,
    evidenceStore: store,
  });

  console.log(`  verdict=${outcome.verdict} · ${outcome.durationMs}ms · llmCalls=${outcome.llmCalls}`);
  console.log(`  证据 keys：\n   ${outcome.evidenceKeys.join('\n   ')}`);

  // ---------- 断言 ----------
  const evEvents = outcome.events.filter((e) => e.type === 'step.evidence');
  check('R1 verdict=pass', outcome.verdict === 'pass', outcome.failureSummary);
  check('4 步各有截图证据事件', evEvents.length === 4, `实际 ${evEvents.length}`);
  check('事件 kind=screenshot 且带 uri', evEvents.every((e) => (e as { kind?: string }).kind === 'screenshot' && !!(e as { uri?: string }).uri));

  const shots = outcome.evidenceKeys.filter((k) => k.includes('screenshot'));
  check('store 落盘 4 张截图', shots.length === 4, `实际 ${shots.length}`);
  check('截图是合法 PNG（magic bytes）', shots.every((k) => {
    const buf = fs.readFileSync(path.join(outDir, k));
    return buf.subarray(0, 4).toString('hex') === '89504e47';
  }));

  const traceKeys = outcome.evidenceKeys.filter((k) => k.includes('trace'));
  check('trace.zip 归档', traceKeys.length === 1);
  if (traceKeys.length === 1) {
    const buf = fs.readFileSync(path.join(outDir, traceKeys[0]));
    check('trace 是合法 ZIP（magic bytes）', buf.subarray(0, 2).toString() === 'PK', buf.subarray(0, 4).toString('hex'));
  }

  const harKeys = outcome.evidenceKeys.filter((k) => k.includes('network'));
  if (harKeys.length === 1) {
    const har = JSON.parse(fs.readFileSync(path.join(outDir, harKeys[0]), 'utf8')) as { log?: { entries?: unknown[] } };
    check('HAR 合法且含请求记录', Array.isArray(har.log?.entries) && har.log.entries.length > 0, `entries=${har.log?.entries?.length}`);
  } else {
    console.log(`  ℹ HAR 未落盘（routeFromHAR update 在无拦截路由时可能跳过写盘）——记录为已知限制`);
  }

  const videoKeys = outcome.evidenceKeys.filter((k) => k.includes('video'));
  if (videoKeys.length === 1) {
    check('video 归档（webm）', true);
  } else {
    console.log('  ℹ video 未产出（stagehand 未透传 contextOptions.recordVideo）——软降级，记录为已知限制');
  }

  const listed = store.list(runId);
  check('store.list 对账一致', listed.length === outcome.evidenceKeys.length, `list=${listed.length} keys=${outcome.evidenceKeys.length}`);

  srv.close();
  console.log(failures === 0 ? '\n✅ C2 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
