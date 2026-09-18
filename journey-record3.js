// 旅程 v3：改代码 → VerifyOS 执行验证（可见）→ 验证完毕（评论已落）→ 才看 GitLab 评论 → 禅道
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const GITLAB = 'http://192.168.85.85:18083';
const ZT = 'http://192.168.85.85:18084';
const VX = 'http://localhost:5173';
const TOKEN = 'c7582a2967cf882f6d006323fd1897999e03e1d1';
const log = m => console.log('[journey]', new Date().toISOString().slice(11, 19), m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function latestNoteTime() {
  try {
    const out = execSync('curl -s -H "PRIVATE-TOKEN: ' + TOKEN + '" "http://192.168.85.85:18083/api/v4/projects/2/merge_requests/1/notes?per_page=1&sort=desc&order_by=created_at"').toString();
    const arr = JSON.parse(out);
    return arr.length ? Date.parse(arr[0].created_at) : 0;
  } catch (e) { return 0; }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: 'out/journey3', size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();

  // ---- 1. VerifyOS 控制台开场 ----
  log('开场：VerifyOS');
  await page.goto(VX + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await page.click('.navitem:has-text("执行历史")').catch(() => {});
  await page.waitForTimeout(6000);

  // ---- 2. GitLab：看本次改动 diff ----
  log('GitLab 登录 + 看 MR !1 diff');
  await page.goto(GITLAB + '/users/sign_in', { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'root');
  await page.fill('#user_password', 'Weidehua@678678');
  await page.click('button[type=submit], input[name=btn-submit]');
  await page.waitForTimeout(4000);
  await page.goto(GITLAB + '/root/conduit-api/-/merge_requests/1/diffs', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // ---- 3. push 触发 webhook，记录时间基准 ----
  const before = latestNoteTime();
  log('push 新 commit（基线评论时间 ' + new Date(before).toISOString() + '）');
  execSync("ssh -o BatchMode=yes root@192.168.85.85 \"cd /opt/demo-conduit/be && git commit --allow-empty -q -m 'docs: journey v3 demo' && git push -q origin HEAD\"", { stdio: 'inherit' });

  // ---- 4. VerifyOS：看验证执行，直到评论真正出现（验证完毕）----
  await page.goto(VX + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.click('.navitem:has-text("执行历史")').catch(() => {});
  await page.waitForTimeout(5000);
  let done = false;
  for (let i = 0; i < 14; i++) {
    log('等待 VerifyOS 验证完成…（第 ' + (i + 1) + ' 次刷新）');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await page.click('.navitem:has-text("执行历史")').catch(() => {});
    await page.waitForTimeout(9000);
    if (latestNoteTime() > before) { done = true; log('✅ 验证完毕，评论已落'); break; }
  }
  if (!done) log('⚠ 超时未等到评论，继续');

  // ---- 5. 回放：点击最新一行（clickrow）----
  log('点击最新 Run 行回放');
  const row = await page.$('tr.clickrow');
  if (row) { await row.click(); await page.waitForTimeout(15000); }
  else log('⚠ 未找到 tr.clickrow');

  // ---- 6. 验证完毕 → 才看 GitLab 评论 ----
  log('验证完成 → GitLab MR 看审查评论');
  await page.goto(GITLAB + '/root/conduit-api/-/merge_requests/1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.keyboard.press('End');
  await page.waitForTimeout(5000);

  // ---- 7. 禅道 bug#5 历史 ----
  log('禅道登录');
  await page.goto(ZT + '/user-login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const acc = await page.$('#account') || await page.$('input[name=account]');
  await acc.fill('Crab');
  await page.fill('input[type=password]', 'Weidehua@678678');
  await page.click('#submit, button[type=submit], input[type=submit]').catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(5000);
  log('bug#5 详情页看自动评论');
  await page.goto(ZT + '/bug-view-5.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(6000);
  const hisTab = await page.$('a[href*="history"], .nav-tabs a');
  if (hisTab) await hisTab.click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.keyboard.press('End');
  await page.waitForTimeout(4000);

  log('结束');
  await ctx.close();
  await browser.close();
  console.log('JOURNEY_DONE');
})().catch(e => { console.error('JOURNEY_FAIL', e.message); process.exit(1); });
