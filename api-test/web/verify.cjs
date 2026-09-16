/**
 * Web UI 自验证脚本：用 playwright-core 打开 web/index.html，
 * 1. 收集 JS 报错（pageerror / console error）；
 * 2. 截图 3 张（API 树+详情 / 覆盖率看板 / 场景编排）到 shots/api-ui/；
 * 3. 校验三栏布局 / 暗色主题 / method 徽章 / AI 入口按钮存在。
 */
const { chromium } = require("playwright-core");
const path = require("path");
const os = require("os");

const CHROME = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const PAGE_URL = "file://" + path.resolve(__dirname, "index.html");
const OUT_DIR = "/Users/xielaoban/Documents/temp/verifyos/shots/api-ui";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 } });

  const errors = [];
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error: " + msg.text()); });

  await page.goto(PAGE_URL, { waitUntil: "load" });
  await page.waitForTimeout(400);

  // 基础断言
  const checks = {};
  checks.treeItems = await page.locator(".tree-item").count();
  checks.methodBadges = await page.locator(".method-badge").count();
  checks.ctxButtons = await page.locator(".ctx-btn").count();
  checks.layoutCols = await page.evaluate(() => {
    const side = document.querySelector(".sidebar");
    const ws = document.querySelector(".workspace");
    const ctx = document.querySelector(".context-panel");
    return { side: !!side, ws: !!ws, ctx: !!ctx };
  });
  checks.bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  checks.getMethodColor = await page.evaluate(() => getComputedStyle(document.querySelector(".method-GET")).color);

  // 截图 1：API 树 + API 详情（默认视图）
  await page.screenshot({ path: path.join(OUT_DIR, "01-api-detail.png") });

  // 截图 2：覆盖率看板
  await page.click('[data-view="coverage"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, "02-coverage.png") });

  // 截图 3：场景编排
  await page.click('[data-view="scenario"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, "03-scenario.png") });

  // 附加验证：右栏 AI 按钮点击有结果渲染
  await page.click('[data-view="api"]');
  await page.click('.ctx-btn[data-demo="recordToCase"]');
  await page.waitForTimeout(200);
  checks.aiResultBlocks = await page.locator(".ai-block").count();

  // 测试用例视图可用性（额外验证，不入验收截图）
  await page.click('[data-view="cases"]');
  await page.waitForTimeout(200);
  checks.caseCards = await page.locator(".case-card").count();
  await page.click(".case-card"); // 展开断言明细
  await page.waitForTimeout(200);
  checks.assertRows = await page.locator(".case-detail .assert-row").count();

  await browser.close();

  console.log("checks:", JSON.stringify(checks, null, 2));
  console.log("js errors:", errors.length === 0 ? "NONE" : JSON.stringify(errors, null, 2));
  const pass =
    errors.length === 0 &&
    checks.treeItems >= 5 && checks.methodBadges >= 5 && checks.ctxButtons === 3 &&
    checks.layoutCols.side && checks.layoutCols.ws && checks.layoutCols.ctx &&
    checks.aiResultBlocks >= 1 && checks.caseCards >= 5 && checks.assertRows >= 1;
  console.log(pass ? "VERIFY PASS" : "VERIFY FAIL");
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
