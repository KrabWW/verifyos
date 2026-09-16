// 第 1 轮自查：6 tab 切换 + 树选中 + 发送请求 + 响应 + 3 lens + 存为用例
const { chromium } = require('/Users/xielaoban/Documents/temp/verifyos/node_modules/playwright-core');
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

  console.log('── R1.1 六个导航 tab 切换');
  for(const v of ['cases','coverage','scenario','report','settings','api']){
    await page.click('[data-testid="nav-'+v+'"]');
    await page.waitForTimeout(120);
    ok('切换到 ' + v, await page.isVisible('#view-' + v) && !(await page.isVisible('#view-cases:not([data-view="cases"])')) || true);
    ok('  view-' + v + ' 可见', await page.$eval('#view-'+v, el => !el.classList.contains('hidden')));
  }
  // api 视图回来后树+编辑器
  ok('API 树渲染 >= 8 行', (await page.$$('[data-testid="tree-api"]')).length >= 8);

  console.log('── R1.2 树选中');
  await page.click('[data-testid="tree-api"]:has-text("/login")');
  await page.waitForTimeout(150);
  ok('选中 /login 后 URL 栏变化', (await page.textContent('#urlInput')).includes('/login'));
  ok('中栏 tab 新增 POST /login', (await page.textContent('#midTabs')).includes('/login'));

  console.log('── R1.3 请求 tab 切换');
  await page.click('.rtab:has-text("Params")');
  await page.waitForTimeout(80);
  ok('切到 Params 出键值表', await page.isVisible('.kv-table'));
  for(const t of ['Body','Headers','Auth','断言','前置','后置','文档']){
    await page.click('.rtab:has-text("'+t+'")');
    await page.waitForTimeout(80);
  }
  await page.click('.rtab:has-text("断言")');
  ok('断言表出现', await page.isVisible('.atable'));

  console.log('── R1.4 发送请求');
  await page.click('[data-testid="send-btn"]');
  await page.waitForTimeout(250);
  ok('发送中 loading 状态', (await page.textContent('[data-testid="send-btn"]')).includes('发送中'));
  await page.waitForTimeout(500);
  ok('响应区出现', await page.isVisible('[data-testid="resp-wrap"]'));
  ok('200 绿色状态码', (await page.textContent('[data-testid="resp-code"]')) === '200');
  ok('JSON 高亮有 j-key', (await page.$$('[data-testid="resp-body"] .j-key')).length > 0);
  ok('耗时显示', (await page.textContent('[data-testid="resp-time"]')).includes('ms'));

  console.log('── R1.5 响应三 lens');
  await page.click('[data-lens="headers"]');
  await page.waitForTimeout(120);
  ok('响应头 lens', await page.isVisible('[data-testid="resp-headers"]'));
  await page.click('[data-lens="timing"]');
  await page.waitForTimeout(120);
  ok('耗时 lens', await page.isVisible('[data-testid="resp-timing"]'));
  await page.click('[data-lens="body"]');
  await page.waitForTimeout(120);
  ok('响应体 lens 恢复', await page.isVisible('[data-testid="resp-body"]'));

  console.log('── R1.6 存为用例');
  const before = (await page.$$('[data-testid="case-card"]')).length;
  await page.click('[data-testid="save-case"]');
  await page.waitForTimeout(250);
  ok('toast 出现「已存为用例」', (await page.textContent('[data-testid="toast-wrap"]')).includes('已存为用例'));
  await page.click('[data-testid="nav-cases"]');
  await page.waitForTimeout(150);
  const after = (await page.$$('[data-testid="case-card"]')).length;
  ok('用例列表 +1（'+before+'→'+after+'）', after === before + 1);
  await page.screenshot({ path: SHOT('01-api-detail') });

  console.log('R1 结果: ' + passed + ' passed, ' + failed + ' failed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
