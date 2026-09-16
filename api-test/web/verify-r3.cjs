// 第 3 轮自查：场景树 switch 禁用→变灰 + 运行动画→汇总 + 添加步骤 + fail 节点 diff + 覆盖率补测 + 报告展开 + 设置 + 快捷键
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

  console.log('── R3.1 场景视图 + 步骤树');
  await page.click('[data-testid="nav-scenario"]');
  await page.waitForTimeout(200);
  ok('场景列表 3 个', (await page.$$('[data-testid="scn-item"]')).length === 3);
  const rows0 = (await page.$$('#stepTree .strow')).length;
  ok('步骤树渲染（'+rows0+' 行）', rows0 >= 10);
  await page.screenshot({ path: SHOT('04-scenario-tree') });

  console.log('── R3.2 switch 禁用→变灰');
  const firstSw = await page.$('[data-testid="step-sw"]');
  const firstRow = await page.$eval('#stepTree .strow', el => el.textContent);
  await page.click('#stepTree .strow >> nth=0 >> .stsw');
  await page.waitForTimeout(150);
  const isDisabled = await page.$eval('#stepTree .strow', el => el.classList.contains('disabled'));
  ok('第一个 switch 关闭后行变灰', isDisabled);
  await page.click('#stepTree .strow >> nth=0 >> .stsw');
  await page.waitForTimeout(150);
  ok('再点恢复启用', !(await page.$eval('#stepTree .strow', el => el.classList.contains('disabled'))));

  console.log('── R3.3 运行动画→汇总');
  await page.click('[data-testid="scn-run"]');
  await page.waitForTimeout(600);
  const runningDots = (await page.$$('#stepTree .sdot.run')).length;
  ok('运行中有黄色 run 节点', runningDots >= 1);
  // 等运行完成（按钮文案恢复 ▶ 运行）
  await page.waitForFunction(() => document.querySelector('#scnRun').textContent.includes('▶ 运行'), { timeout: 15000 });
  const passDots = (await page.$$('#stepTree .sdot.pass')).length;
  const failDots = (await page.$$('#stepTree .sdot.fail')).length;
  ok('跑完出现绿/红（'+passDots+' pass / '+failDots+' fail）', passDots >= 6 && failDots >= 2);
  const sumText = await page.textContent('[data-testid="scn-summary"]');
  ok('汇总出现', sumText.includes('通过') && sumText.includes('失败'));

  console.log('── R3.4 fail 节点点击展开 diff');
  const failRow = await page.$('#stepTree .strow.failrow');
  if(failRow){
    await failRow.click();
    await page.waitForTimeout(200);
    ok('diff 面板展开', await page.isVisible('[data-testid="diff-box"]'));
    ok('diff 含期望/实际', (await page.textContent('[data-testid="diff-box"]')).includes('期望'));
  } else ok('fail 行存在', false);

  console.log('── R3.5 添加步骤');
  const before = (await page.$$('#stepTree .strow')).length;
  await page.click('[data-testid="scn-add"]');
  await page.waitForTimeout(150);
  ok('下拉菜单出现', await page.isVisible('[data-testid="add-menu"]'));
  await page.click('[data-add="loop"]');
  await page.waitForTimeout(200);
  const after = (await page.$$('#stepTree .strow')).length;
  ok('树中新增节点（'+before+'→'+after+'）', after === before + 1);
  ok('toast「已添加步骤」', (await page.textContent('[data-testid="toast-wrap"]')).includes('已添加步骤'));

  console.log('── R3.6 场景切换');
  await page.click('[data-testid="scn-item"]:has-text("登录回归")');
  await page.waitForTimeout(200);
  ok('切换场景后树变化', (await page.textContent('#stepTree')).includes('正确密码登录'));

  console.log('── R3.7 覆盖率视图');
  await page.click('[data-testid="nav-coverage"]');
  await page.waitForTimeout(200);
  ok('大数字 45.5%', (await page.textContent('[data-testid="cov-hero"]')).includes('45.5'));
  ok('趋势柱 >= 3 组', (await page.$$('.trend')).length >= 3);
  ok('未覆盖清单有补测按钮', (await page.$$('[data-testid="fill-gap"]')).length >= 5);
  ok('覆盖率表格渲染', (await page.$$('[data-testid="cov-table"] tr')).length >= 9);
  await page.screenshot({ path: SHOT('05-coverage') });
  await page.click('[data-testid="fill-gap"] >> nth=0');
  await page.waitForTimeout(350);
  ok('补测打开 AI 抽屉 edge-case', await page.$eval('#aiPanel', el => el.classList.contains('show'))
    && (await page.textContent('[data-testid="ai-ctx"]')).includes('edge-case'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  console.log('── R3.8 报告视图');
  await page.click('[data-testid="nav-report"]');
  await page.waitForTimeout(200);
  ok('报告 5 条', (await page.$$('[data-testid="rep-row"]')).length === 5);
  const badges = await page.$$eval('.rep-badge', els => els.map(e => e.textContent));
  ok('徽章含 PASS/FAIL/UNKNOWN', badges.includes('PASS') && badges.includes('FAIL') && badges.includes('UNKNOWN'));
  await page.click('[data-testid="rep-row"] >> nth=0');
  await page.waitForTimeout(200);
  ok('点击展开详情', await page.isVisible('[data-testid="rep-detail"]'));
  const det = await page.textContent('[data-testid="rep-detail"]');
  ok('详情含步骤/触达/证据', det.includes('步骤结果') && det.includes('触达校验') && det.includes('证据清单'));
  await page.click('[data-testid="rep-row"] >> nth=0');
  await page.waitForTimeout(150);
  ok('再点收起', !(await page.isVisible('[data-testid="rep-detail"]')));
  ok('底部汇总统计', (await page.$$('[data-testid="rep-stats"] .stat-pill')).length >= 4);

  console.log('── R3.9 设置视图');
  await page.click('[data-testid="nav-settings"]');
  await page.waitForTimeout(200);
  ok('provider 下拉 5 项', (await page.$$eval('[data-testid="provider-sel"] option', els => els.length)) === 5);
  await page.selectOption('[data-testid="provider-sel"]', 'deepseek-v3');
  ok('provider 可切换', (await page.$eval('[data-testid="provider-sel"]', el => el.value)) === 'deepseek-v3');
  await page.fill('[data-testid="api-key"]', 'sk-test-123');
  ok('API Key 输入框可输入', (await page.inputValue('[data-testid="api-key"]')) === 'sk-test-123');
  await page.click('[data-testid="test-conn"]');
  await page.waitForTimeout(1100);
  ok('测试连接 toast 成功', (await page.textContent('[data-testid="toast-wrap"]')).includes('连接成功'));
  ok('凭据 6 连接器行', (await page.$$('[data-testid="cred-row"]')).length === 6);
  await page.click('[data-testid="cred-row"] >> nth=1 >> [data-testid="cred-cfg"]');
  await page.waitForTimeout(150);
  ok('点配置展开 token 输入框', await page.isVisible('[data-testid="cred-token"]'));
  await page.fill('[data-testid="cred-token"]', 'glpat-xxx');
  await page.click('button:has-text("保存")');
  await page.waitForTimeout(200);
  ok('保存凭据 toast', (await page.textContent('[data-testid="toast-wrap"]')).includes('已保存'));
  ok('强调色 9 色', (await page.$$('[data-testid="swatch"]')).length === 9);
  await page.screenshot({ path: SHOT('06-settings') });
  await page.click('[data-testid="swatch"] >> nth=1');
  await page.waitForTimeout(150);
  ok('切强调色 toast', (await page.textContent('[data-testid="toast-wrap"]')).includes('强调色'));

  console.log('── R3.10 快捷键');
  await page.click('[data-testid="nav-api"]');
  await page.waitForTimeout(150);
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(250);
  ok('⌘Enter 发送（loading）', (await page.textContent('[data-testid="send-btn"]')).includes('发送中'));
  await page.waitForTimeout(500);
  ok('响应出现', await page.isVisible('[data-testid="resp-wrap"]'));
  await page.keyboard.press('Meta+s');
  await page.waitForTimeout(250);
  ok('⌘S 存为用例 toast', (await page.textContent('[data-testid="toast-wrap"]')).includes('已存为用例'));
  await page.screenshot({ path: SHOT('02-response') });

  console.log('R3 结果: ' + passed + ' passed, ' + failed + ' failed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
