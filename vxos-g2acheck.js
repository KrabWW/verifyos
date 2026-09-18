// vxos-g2acheck.js — 工单 G2a「证据深链·前端 hash 路由」真实浏览器验收
// 运行: node C:\Users\admin\verifyos\vxos-g2acheck.js   （依赖仓库根 node_modules/playwright）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:8082';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' — ' + extra : ''));
  return ok;
}
const hashOf = (page) => page.evaluate(() => location.hash);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });

(async () => {
  // ---- 前置：从后端取真实数据（工单要求：iid 7 不存在时用真实 iid 替代） ----
  const mrs = await (await fetch(API + '/api/mrs')).json();
  const items = mrs.items || [];
  const withReview = items.find((m) => m.review) || items[0];
  const IID = withReview ? withReview.iid : null;
  const runs = await (await fetch(API + '/api/runs?page=1&pageSize=1')).json();
  const RUN_ID = runs.rows && runs.rows[0] && runs.rows[0].runId;
  console.log('[data] MR iids=' + items.map((m) => m.iid).join(',') + '（无 iid 7 → 用真实 iid ' + IID + '，含 review=' + !!(withReview && withReview.review) + '）');
  console.log('[data] 最新 runId=' + RUN_ID);
  if (!IID || !RUN_ID) { console.log('FAIL | 前置数据缺失，无法继续'); process.exit(1); }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const gotoFresh = async (url) => { await page.goto('about:blank'); await page.goto(url, { waitUntil: 'domcontentloaded' }); };

  // ================= A. PR 深链 #/pr/<iid> =================
  console.log('\n===== A. PR 深链 #/pr/' + IID + ' =====');
  await gotoFresh(BASE + '/#/pr/' + IID);
  await page.waitForLoadState('networkidle').catch(() => {});
  // A1: 详情标题出现（PrView 详情态 .big 含 !iid）
  const detailBig = page.locator('.pageview .runhead .big', { hasText: '!' + IID });
  const a1 = await detailBig.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  check('A1 PR 详情自动选中 iid ' + IID + '（详情标题含 !' + IID + '）', a1);
  // A2: 全局页头 = PR 验证
  const gBig = (await page.locator('.main > .runhead .big').textContent().catch(() => '')) || '';
  check('A2 处于 PR 验证视图（全局页头=「PR 验证」）', gBig.trim() === 'PR 验证', 'got="' + gBig.trim() + '"');
  // A3: 侧栏高亮 PR 验证
  const nav = (await page.locator('.navitem.active .navlabel').textContent().catch(() => '')) || '';
  check('A3 侧栏高亮「PR 验证」', nav.trim() === 'PR 验证', 'got="' + nav.trim() + '"');
  // A4: 详情 Review tabs 出现
  const tabs = await page.locator('.prdtabs').count();
  check('A4 详情态 Review tabs 出现', tabs > 0);
  // A5: 入口 hash 未被覆盖
  const h5 = await hashOf(page);
  check('A5 入口 hash 保持 #/pr/' + IID + '（未被初始化覆盖）', h5 === '#/pr/' + IID, 'got="' + h5 + '"');
  await shot(page, 'g2a-a-pr-deeplink.png');

  // ================= B. Run 深链 #/runs/<runId> =================
  console.log('\n===== B. Run 深链 #/runs/' + RUN_ID + ' =====');
  await gotoFresh(BASE + '/#/runs/' + RUN_ID);
  await page.waitForLoadState('networkidle').catch(() => {});
  // B1: 回放标识 chip（route==='run' && replayRunId → 「回放中：run_xxx…」）
  const replayChip = page.locator('.main > .runhead .chip', { hasText: '回放中' });
  const b1 = await replayChip.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const chipText = b1 ? ((await replayChip.textContent()) || '').trim() : '';
  check('B1 进入回放态（页头出现「回放中」chip）', b1, 'chip="' + chipText.slice(0, 40) + '"');
  check('B1b chip 内容包含该 runId', chipText.includes(RUN_ID.slice(0, 10)), 'runId=' + RUN_ID);
  // B2: Action Log 事件流已载入（回放数据路径生效）
  const cards = await page.locator('.log .alogcard').count();
  check('B2 回放事件流已载入（Action Log 步骤卡 > 0）', cards > 0, 'cards=' + cards);
  // B3: Run 摘要状态非「待运行」
  const kv = (await page.locator('.sumcard .kv', { hasText: '状态' }).first().textContent().catch(() => '')) || '';
  check('B3 Run 摘要状态已变为回放结果', kv.length > 0 && !kv.includes('待运行'), 'kv="' + kv.trim().slice(0, 30) + '"');
  // B4: 侧栏高亮 验证 · 执行
  const navB = (await page.locator('.navitem.active .navlabel').textContent().catch(() => '')) || '';
  check('B4 侧栏高亮「验证 · 执行」', navB.trim() === '验证 · 执行', 'got="' + navB.trim() + '"');
  // B5: hash 保持入口值
  const hB = await hashOf(page);
  check('B5 入口 hash 保持 #/runs/' + RUN_ID, hB === '#/runs/' + RUN_ID, 'got="' + hB + '"');
  // B6: replaceState 不产生历史记录 → 后退应离开应用（回到 about:blank）
  await page.goBack().catch(() => {});
  await page.waitForTimeout(500);
  check('B6 回退直接离开应用（写 hash 用 replaceState，无历史记录）', page.url() === 'about:blank', 'url=' + page.url());
  await shot(page, 'g2a-b-run-deeplink.png');

  // ================= C. 回归：无 hash 默认视图 + 交互回写 =================
  console.log('\n===== C. 回归（无 hash 默认视图 + 导航/回放/选中 hash 回写） =====');
  await gotoFresh(BASE + '/');
  await page.waitForLoadState('networkidle').catch(() => {});
  const c1big = (await page.locator('.main > .runhead .big').textContent().catch(() => '')) || '';
  const c1h = await hashOf(page);
  check('C1 默认视图=验证 · 执行 且 hash 为空', c1big.trim() === '验证 · 执行' && (c1h === '' || c1h === '#/'), 'big="' + c1big.trim() + '" hash="' + c1h + '"');
  await shot(page, 'g2a-c1-default.png');

  // C2: 侧栏点击 → 执行历史
  await page.locator('.navitem', { hasText: '执行历史' }).click();
  await page.locator('.main > .runhead .big', { hasText: '执行历史' }).waitFor({ timeout: 5000 }).catch(() => {});
  const c2big = (await page.locator('.main > .runhead .big').textContent().catch(() => '')) || '';
  check('C2 侧栏切到执行历史正常', c2big.trim() === '执行历史', 'big="' + c2big.trim() + '"');

  // C3: 历史行点击回放 → hash 回写 #/runs/<id>
  await page.locator('tr.clickrow').first().click();
  const replayChip2 = page.locator('.main > .runhead .chip', { hasText: '回放中' });
  const c3 = await replayChip2.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  const c3h = await hashOf(page);
  check('C3 历史行点击进入回放', c3);
  check('C3b 行点击回放后 hash 回写 #/runs/…', c3h.startsWith('#/runs/'), 'hash="' + c3h + '"');

  // C4: 「返回实时」退出回放 → hash 清空
  await page.locator('.main > .runhead a', { hasText: '返回实时' }).click();
  await page.waitForTimeout(400);
  const c4h = await hashOf(page);
  const c4chip = await page.locator('.main > .runhead .chip', { hasText: '回放中' }).count();
  check('C4 退出回放后 hash 清空且回放 chip 消失', (c4h === '' || c4h === '#/') && c4chip === 0, 'hash="' + c4h + '" chips=' + c4chip);
  await shot(page, 'g2a-c4-after-replay.png');

  // C5: PR 列表行点击 → hash 回写 #/pr/<iid>，返回列表 → 清空
  await page.locator('.navitem', { hasText: 'PR 验证' }).click();
  await page.locator('tr.click').first().waitFor({ timeout: 10000 }).catch(() => {});
  const firstIidText = (await page.locator('tr.click').first().textContent().catch(() => '')) || '';
  const mIid = firstIidText.match(/!(\d+)/);
  const firstIid = mIid ? mIid[1] : '';
  await page.locator('tr.click').first().click();
  const prBig = page.locator('.pageview .runhead .big', { hasText: '!' + firstIid });
  const c5 = await prBig.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  const c5h = await hashOf(page);
  check('C5 PR 行点击进详情', c5, 'iid=' + firstIid);
  check('C5b 选中 MR 后 hash 回写 #/pr/' + firstIid, c5h === '#/pr/' + firstIid, 'hash="' + c5h + '"');
  await shot(page, 'g2a-c5-pr-select.png');
  await page.locator('.pageview .runhead button', { hasText: '← Pull Requests' }).click();
  await page.waitForTimeout(400);
  const c6h = await hashOf(page);
  check('C6 返回 PR 列表后 hash 清空', c6h === '' || c6h === '#/', 'hash="' + c6h + '"');

  // ---- 汇总 ----
  console.log('\n===== 汇总 =====');
  console.log('PASS=' + pass + ' FAIL=' + fail);
  console.log('截图目录: ' + SHOTS);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
