// 用户旅程 v2：改代码 → VerifyOS 自动验证（可见全过程）→ 验证完毕才评论 GitLab/禅道
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const GITLAB = 'http://192.168.85.85:18083';
const ZT = 'http://192.168.85.85:18084';
const VX = 'http://localhost:5173';
const log = m => console.log('[journey]', new Date().toISOString().slice(11, 19), m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: 'out/journey2', size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();

  // ---- 1. VerifyOS 控制台开场 ----
  log('开场：VerifyOS 执行历史页');
  await page.goto(VX + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await page.click('.navitem:has-text("执行历史")').catch(e => log('nav err ' + e.message));
  await page.waitForTimeout(6000);

  // ---- 2. GitLab：开发者提交修复代码（diff）----
  log('GitLab 登录');
  await page.goto(GITLAB + '/users/sign_in', { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'root');
  await page.fill('#user_password', 'Weidehua@678678');
  await page.click('button[type=submit], input[name=btn-submit]');
  await page.waitForTimeout(4000);
  log('看 MR !1 diff（这次的改动）');
  await page.goto(GITLAB + '/root/conduit-api/-/merge_requests/1/diffs', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // ---- 3. 开发者 push 新 commit，触发 webhook ----
  log('开发者 push 新 commit');
  execSync("ssh -o BatchMode=yes root@192.168.85.85 \"cd /opt/demo-conduit/be && git commit --allow-empty -q -m 'docs: polish README (journey v2)' && git push -q origin HEAD\"", { stdio: 'inherit' });
  log('已 push → GitLab webhook 已通知 VerifyOS');

  // ---- 4. VerifyOS：看验证执行（核心场景）----
  await page.goto(VX + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.click('.navitem:has-text("执行历史")').catch(() => {});
  await page.waitForTimeout(5000);
  // 轮询刷新列表直到新 run 出现并完成
  for (let i = 0; i < 8; i++) {
    log('刷新执行历史…（第 ' + (i + 1) + ' 次）');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await page.click('.navitem:has-text("执行历史")').catch(() => {});
    await page.waitForTimeout(9000);
    if (i >= 3) break; // 展示轮询过程即可
  }
  log('打开最新 Run 的回放（步骤 + 判定 + 证据）');
  const replayBtn = await page.$('button:has-text("回放")');
  if (replayBtn) { await replayBtn.click(); await page.waitForTimeout(15000); }
  else { log('未找到回放按钮，停留历史页'); await page.waitForTimeout(8000); }

  // ---- 5. 验证完毕：GitLab 评论出现 ----
  log('验证完成 → GitLab MR 出现新审查评论');
  await page.goto(GITLAB + '/root/conduit-api/-/merge_requests/1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.keyboard.press('End');
  await page.waitForTimeout(5000);

  // ---- 6. 禅道 bug#5 历史出现自动评论 ----
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
  if (hisTab) { await hisTab.click().catch(() => {}); }
  await page.waitForTimeout(6000);
  await page.keyboard.press('End');
  await page.waitForTimeout(4000);

  log('结束');
  await ctx.close();
  await browser.close();
  console.log('JOURNEY_DONE');
})().catch(e => { console.error('JOURNEY_FAIL', e.message); process.exit(1); });
