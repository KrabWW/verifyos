/* G1 验收脚本：门禁模式（gateMode）+ 分档计划（plan / fullTriggers）配置
 * 用法：node vxos-g1check.js（在仓库根目录执行；要求 apps/server 与 agent-core 已构建）
 * 断言项（对照工单 G1）：
 *   1. 默认 merge 产物 gateMode=blocking / plan=smoke / fullTriggers.branches 含 release/*
 *   2. yaml 写 gateMode: reporting → loadPrConfig 读出 reporting（测完恢复 blocking）
 *   3. resolvePlan：release/1.2→full；feature/x+full-regression→full；无命中→smoke
 *   4. buildMrComment 传 {gateMode:'reporting'} → 评论含「非阻塞」
 */
const fs = require('fs');
const YAML_PATH = 'apps/server/verifyos.config.yaml';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const prcfg = require('./apps/server/dist/pr/pr-config.js');
  // agent-core 是 ESM（"type":"module"）：优先包名，降级直连 dist 文件
  let core;
  try { core = await import('@verifyos/agent-core'); }
  catch { core = await import('./packages/agent-core/dist/review.js'); }
  const { defaultPrConfig, mergePrConfig, loadPrConfig, resolvePlan } = prcfg;
  const { buildMrComment } = core;

  // ---------- [1] 默认 merge 产物 ----------
  console.log('[1] 默认 merge 产物（defaultPrConfig → mergePrConfig 及 yaml 提交态）');
  const merged = mergePrConfig(defaultPrConfig());
  check('gateMode === "blocking"', merged.gateMode === 'blocking', 'got ' + JSON.stringify(merged.gateMode));
  check('plan === "smoke"', merged.plan === 'smoke', 'got ' + JSON.stringify(merged.plan));
  check("fullTriggers.branches 含 'release/*'", Array.isArray(merged.fullTriggers && merged.fullTriggers.branches) && merged.fullTriggers.branches.includes('release/*'), JSON.stringify(merged.fullTriggers));
  const yamlLoaded = loadPrConfig('apps/server');
  const fy = yamlLoaded.pr;
  check('loadPrConfig(yaml 提交态) 三键一致', fy.gateMode === 'blocking' && fy.plan === 'smoke' && fy.fullTriggers.branches.includes('release/*'),
    'source=' + yamlLoaded.source + ' gateMode=' + fy.gateMode + ' plan=' + fy.plan + ' fullTriggers=' + JSON.stringify(fy.fullTriggers));

  // ---------- [2] yaml gateMode: reporting 热切换 + 恢复 ----------
  console.log('[2] yaml 写 gateMode: reporting → loadPrConfig 读出 reporting → 恢复 blocking');
  const orig = fs.readFileSync(YAML_PATH, 'utf8');
  try {
    if (!orig.includes('gateMode: blocking')) throw new Error('yaml 基线中找不到 gateMode: blocking');
    fs.writeFileSync(YAML_PATH, orig.replace('gateMode: blocking', 'gateMode: reporting'));
    const rep = loadPrConfig('apps/server').pr;
    check('yaml 改 reporting 后 loadPrConfig 读出 reporting', rep.gateMode === 'reporting', 'got ' + JSON.stringify(rep.gateMode));
  } finally {
    fs.writeFileSync(YAML_PATH, orig);
  }
  const back = loadPrConfig('apps/server').pr;
  const restored = fs.readFileSync(YAML_PATH, 'utf8') === orig;
  check('yaml 恢复后读回 blocking 且文件逐字节还原', back.gateMode === 'blocking' && restored, 'restored=' + restored);

  // ---------- [3] resolvePlan 分档判定 ----------
  console.log('[3] resolvePlan 纯函数');
  check("分支 'release/1.2' → full", resolvePlan(merged, 'release/1.2', []) === 'full',
    "fullTriggers=" + JSON.stringify(merged.fullTriggers));
  const prLabel = mergePrConfig(defaultPrConfig(), { fullTriggers: { branches: [], labels: ['full-regression'] } });
  check("分支 'feature/x' + labels ['full-regression']（已配置）→ full", resolvePlan(prLabel, 'feature/x', ['full-regression']) === 'full');
  check("分支 'feature/x' 无命中 label → smoke", resolvePlan(prLabel, 'feature/x', []) === 'smoke');
  check("附加：'feature/x' + 未配置 label 'bug' → smoke", resolvePlan(merged, 'feature/x', ['bug']) === 'smoke');
  check("附加：通配 '*' 命中任意分支 → full", resolvePlan(mergePrConfig(defaultPrConfig(), { fullTriggers: { branches: ['*'], labels: [] } }), 'anything/here', []) === 'full');

  // ---------- [4] buildMrComment 非阻塞标注 ----------
  console.log('[4] buildMrComment opts（reporting 标注）');
  const outcome = { verdict: 'fail', events: [], llmCalls: 2, cache: { entries: 0, totalHits: 0 }, stepResults: [], durationMs: 71000, evidenceKeys: [], visitedUrls: ['/articles'], reachability: [] };
  const report = { summary: 'G1 验收测试摘要', areas: [] };
  const gate = { decision: 'block', reason: '存在断言失败，阻止合并' };
  const repComment = buildMrComment({ prTitle: 'G1 验收 MR', report, outcome, testRuns: [], gate, opts: { gateMode: 'reporting', plan: 'full' } });
  check("reporting 评论含「非阻塞」", repComment.includes('非阻塞'));
  check('reporting 标题含「ℹ️ [非阻塞]」前缀', repComment.includes('## ℹ️ [非阻塞]'));
  check('reporting 评论展示 Full 全量回归档', repComment.includes('Full 全量回归档'));
  const blkComment = buildMrComment({ prTitle: 'G1 验收 MR', report, outcome, testRuns: [], gate });
  check('blocking（缺省，不传 opts）评论不含「非阻塞」', !blkComment.includes('非阻塞'));

  console.log('\n===== G1 验收结果：' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('G1check 异常终止：', e && e.message ? e.message : e); process.exit(1); });
