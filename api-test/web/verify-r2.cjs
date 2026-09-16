// 第 2 轮自查：AI 抽屉开/关 + 方法论 chips + 生成卡片勾选→同步→打标 + 诊断模式 + 录制面板 + checkbox 切换 + 模型切换
const path = require('path');
const APP = '/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/node_modules/playwright-core';
let pw;
try { pw = require(APP); } catch(e) { pw = require('/Users/xielaoban/Documents/temp/verifyos/node_modules/playwright-core'); }
const PWT = process.env.PW_PATH ? require(process.env.PW_PATH) : pw;

const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'file://' + path.resolve('/Users/xielaoban/Documents/temp/verifyos/api-test/web/prototype.html');
const SHOT = p => '/Users/xielaoban/Documents/temp/verifyos/shots/proto-final/' + p + '.png';

let passed = 0, failed = 0;
function ok(name, cond){
  if(cond){ passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

(async () => {
  const browser = await PWT.chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  await page.goto(URL);
  await page.waitForTimeout(400);
  // 空态引导：先选「直接调试」进入主界面（产品流）——否则 .app 内按钮被 onboard 遮罩拦截
  await page.click('#obDebug');
  await page.waitForTimeout(250);

  console.log('── R2.1 AI 抽屉开/关');
  await page.click('[data-testid="fab"]');
  await page.waitForTimeout(350);
  ok('FAB 点击后抽屉打开', await page.$eval('#aiPanel', el => el.classList.contains('show')));
  ok('生成卡片 >= 3 张', (await page.$$('[data-testid="gcard"]')).length >= 3);
  ok('默认勾选 2 张', (await page.$$('[data-testid="gcard"].picked')).length === 2);
  await page.screenshot({ path: SHOT('03-ai-drawer') });
  await page.click('[data-testid="ai-close"]');
  await page.waitForTimeout(300);
  ok('✕ 关闭抽屉', !(await page.$eval('#aiPanel', el => el.classList.contains('show'))));
  await page.click('[data-testid="fab"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('Esc 关闭抽屉', !(await page.$eval('#aiPanel', el => el.classList.contains('show'))));

  console.log('── R2.2 方法论 chips 勾选/取消（四法：等价类/边界值/判定表/场景法）');
  await page.click('[data-testid="fab"]');
  await page.waitForTimeout(300);
  const chipsBefore = (await page.$$('[data-testid="ms-chip"].on')).length;
  await page.click('[data-testid="ms-chip"]:has-text("场景法")');
  await page.waitForTimeout(150);
  const chipsAfter = (await page.$$('[data-testid="ms-chip"].on')).length;
  ok('点击 chip 勾选（'+chipsBefore+'→'+chipsAfter+'）', chipsAfter === chipsBefore + 1);
  await page.click('[data-testid="ms-chip"]:has-text("场景法")');
  await page.waitForTimeout(150);
  ok('再点取消勾选', (await page.$$('[data-testid="ms-chip"].on')).length === chipsBefore);

  console.log('── R2.3 卡片勾选→同步→打标');
  // 勾选未选中且未同步的第三张卡片
  await page.click('[data-testid="gcard"]:not(.picked):not(.synced)');
  await page.waitForTimeout(150);
  const picked = (await page.$$('[data-testid="gcard"].picked')).length;
  ok('勾选第三张卡片（'+picked+' picked）', picked === 3);
  const casesBefore = await page.$$eval('#caseGrid .case-card', els => els.length).catch(()=>0);
  await page.click('[data-testid="sync-btn"]');
  await page.waitForTimeout(250);
  ok('toast「已同步 3 条用例」', (await page.textContent('[data-testid="toast-wrap"]')).includes('已同步 3 条'));
  const syncedCount = (await page.$$('[data-testid="gcard"].synced')).length;
  ok('同步卡片打 ✓ 已同步（'+syncedCount+' 张）', syncedCount === 3);
  const btnText = await page.textContent('[data-testid="sync-btn"]');
  ok('同步按钮复位为 0', btnText.includes('同步 0 条'));

  console.log('── R2.4 诊断模式');
  await page.click('[data-testid="ai-mode-diag"]');
  await page.waitForTimeout(200);
  ok('诊断模式显示根因分类', (await page.textContent('#aiBody')).includes('数据漂移'));
  ok('根因含修复建议', (await page.textContent('#aiBody')).includes('建议'));
  const rcCards = (await page.$$('.rc-card')).length;
  ok('根因卡片 4 张', rcCards === 4);

  console.log('── R2.5 生成模式恢复 + 采纳建议');
  await page.click('[data-testid="ai-mode-gen"]');
  await page.waitForTimeout(150);
  ok('切回生成模式', (await page.$$('[data-testid="gcard"]')).length >= 3);

  console.log('── R2.6 AI 输入框发送');
  await page.fill('[data-testid="ai-input"]', '帮我生成并发场景用例');
  await page.click('[data-testid="ai-send"]');
  await page.waitForTimeout(300);
  ok('用户消息出现', (await page.textContent('#aiBody')).includes('帮我生成并发场景用例'));
  await page.waitForTimeout(900);
  ok('1s 后 AI 回复出现', (await page.textContent('#aiBody')).includes('已理解意图'));

  console.log('── R2.7 录制面板');
  await page.keyboard.press('Escape'); // 关 AI
  await page.waitForTimeout(250);
  await page.click('[data-testid="rec-toggle"]');
  await page.waitForTimeout(350);
  ok('顶栏录制按钮打开面板', await page.$eval('#recPanel', el => el.classList.contains('show')));
  ok('录制徽章变红 LIVE', await page.$eval('#recToggle', el => el.classList.contains('live')));
  const hint1 = await page.textContent('#recHint');
  ok('初始 hint 显示 1 域名', hint1.includes('已勾选 1 个域名'));
  await page.click('.rec-dom[data-domain="pay.example.cn"] .h');
  await page.waitForTimeout(150);
  const hint2 = await page.textContent('#recHint');
  ok('勾选域名后 hint 更新（'+hint2+'）', hint2.includes('已勾选 2 个'));
  await page.click('.rec-dom[data-domain="api.example.com"] .h');
  await page.waitForTimeout(150);
  ok('取消勾选切换', (await page.textContent('#recHint')).includes('已勾选 1 个'));
  await page.click('.rec-dom[data-domain="api.example.com"] .h'); // 恢复
  await page.screenshot({ path: SHOT('07-rec-panel') });

  console.log('── R2.8 从流量生成用例');
  await page.click('[data-testid="rec-gen"]');
  await page.waitForTimeout(400);
  ok('点击后录制面板关闭', !(await page.$eval('#recPanel', el => el.classList.contains('show'))));
  ok('AI 抽屉打开且上下文含流量', (await page.textContent('[data-testid="ai-ctx"]')).includes('录制流量'));
  await page.keyboard.press('Escape');

  console.log('── R2.9 模型下拉切换');
  await page.selectOption('[data-testid="model-sel-top"]', 'deepseek-v3');
  await page.waitForTimeout(200);
  ok('顶栏切模型 toast', (await page.textContent('[data-testid="toast-wrap"]')).includes('deepseek-v3'));
  await page.click('[data-testid="fab"]');
  await page.waitForTimeout(250);
  const dv = await page.$eval('[data-testid="model-sel-drawer"]', el => el.value);
  ok('抽屉模型下拉联动（='+dv+'）', dv === 'deepseek-v3');
  await page.keyboard.press('Escape');

  console.log('R2 结果: ' + passed + ' passed, ' + failed + ' failed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
