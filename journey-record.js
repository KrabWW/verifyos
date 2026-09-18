// 用户旅程录屏：改代码 → VerifyOS 自动回归 → GitLab/禅道自动评论
// 运行：cd C:\Users\admin\verifyos && node D:\code\verifyoa\journey-record.js
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const GITLAB = 'http://192.168.85.85:18083';
const ZT = 'http://192.168.85.85:18084';
const log = m => console.log('[journey]', new Date().toISOString().slice(11, 19), m);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: 'out/journey', size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();

  // ---- 场景 0：开场，VerifyOS 控制台 ----
  log('开场：VerifyOS 项目页');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5000);

  // ---- 场景 1：开发者视角，看 GitLab MR（修复代码 diff + 已有审查评论）----
  log('GitLab 登录');
  await page.goto(GITLAB + '/users/sign_in', { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'root');
  await page.fill('#user_password', 'Weidehua@678678');
  await page.click('button[type=submit], input[name=btn-submit]');
  await page.waitForTimeout(4000);

  log('打开 MR !1 diff —— 看"改了什么代码"');
  await page.goto(GITLAB + '/root/conduit-api/-/merge_requests/1/diffs', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  log('切到 Conversation —— 看上一轮 VerifyOS 的审查评论');
  await page.goto(GITLAB + '/root/conduit-api/-/merge_requests/1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.keyboard.press('End');
  await page.waitForTimeout(3000);

  // ---- 场景 2：开发者再改一版代码，push ----
  log('开发者推新 commit（触发 webhook）');
  execSync("ssh -o BatchMode=yes root@192.168.85.85 \"cd /opt/demo-conduit/be && git commit --allow-empty -q -m 'docs: tweak README (journey demo)' && git push -q origin HEAD\"", { stdio: 'inherit' });
  log('已 push，等待 VerifyOS 自动审查（约 90 秒）');
  await page.waitForTimeout(15000);

  // 等待期间切到 VerifyOS 的 Run 历史，让观众看到新 Run 在跑
  log('切到 VerifyOS 看 Run 执行');
  await page.goto('http://127.0.0.1:8082/api/health', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.waitForTimeout(130000); // 等审查完成

  // ---- 场景 3：回到 GitLab，新评论出现 ----
  log('回到 MR 页刷新 —— VerifyOS 新评论出现');
  await page.goto(GITLAB + '/root/conduit-api/-/merge_requests/1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.keyboard.press('End');
  await page.waitForTimeout(4000);

  // ---- 场景 4：禅道，bug#5 历史里出现自动评论 ----
  log('禅道登录');
  await page.goto(ZT + '/user-login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const acc = await page.$('#account') || await page.$('input[name=account]');
  await acc.fill('Crab');
  await page.fill('input[type=password]', 'Weidehua@678678');
  await page.click('#submit, button[type=submit], input[type=submit]').catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(5000);

  log('打开 bug#5 详情页看历史评论');
  await page.goto(ZT + '/bug-view-5.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(6000);
  // 展开历史/动作
  const hisTab = await page.$('a[href*="history"], #historyButton, .nav-tabs a');
  if (hisTab) { await hisTab.click().catch(() => {}); }
  await page.waitForTimeout(5000);
  await page.keyboard.press('End');
  await page.waitForTimeout(4000);

  log('结束');
  await ctx.close(); // 落盘视频
  await browser.close();
  console.log('JOURNEY_DONE');
})().catch(e => { console.error('JOURNEY_FAIL', e.message); process.exit(1); });
