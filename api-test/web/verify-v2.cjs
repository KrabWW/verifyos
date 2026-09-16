/**
 * 原型 v2 自验证（playwright-core 打开 web/prototype.html）
 *
 * 第 1 轮 · 空态引导卡：
 *   R1.1 首载无 tab → .empty-wrap 可见，3 张 .ecard，卡①带「推荐」徽章
 *   R1.2 点卡① → 录制开关自动开（.rec.on + .recpanel.show + 文案「录制中」）
 *   R1.3 点卡② → spec 导入弹窗出现；点「导入并派生测试」→ 解析完成态
 *   R1.4 点卡③ → 新开「新请求」tab，URL 输入框自动聚焦
 *   R1.5 关闭全部 tab → 回到空态
 *
 * 第 2 轮 · 既有功能回归 + 7 张截图（shots/proto/）：
 *   00 空态引导卡 / 01 API 详情 / 02 AI 抽屉 / 03 录制面板 /
 *   04 场景步骤树 / 05 场景运行 / 06 AI 诊断
 *   回归断言：树/tabs/断言表/步骤树/运行汇总/AI 抽屉/诊断 全部渲染，0 JS 报错
 */
const { chromium } = require("playwright-core");
const path = require("path");
const os = require("os");

const CHROME = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const PAGE_URL = "file://" + path.resolve(__dirname, "prototype.html");
const OUT_DIR = "/Users/xielaoban/Documents/temp/verifyos/shots/proto";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error: " + msg.text()); });

  const checks = {};
  const fail = (k, v) => { checks[k] = "FAIL:" + JSON.stringify(v); };

  /* ============ 第 1 轮：空态引导卡 ============ */
  await page.goto(PAGE_URL, { waitUntil: "load" });
  await page.waitForTimeout(300);

  // R1.1 空态渲染
  checks.r1_emptyVisible = await page.locator(".empty-wrap").count();
  checks.r1_cards = await page.locator(".ecard").count();
  checks.r1_recBadge = await page.locator(".ecard.hot .ebadge").innerText().catch(() => "");
  checks.r1_tabsOnLoad = await page.locator("#tabs .tab").count();
  checks.r1_cardTitles = await page.locator(".ecard .ett").allInnerTexts();
  checks.r1_cardGos = await page.locator(".ecard .ego").count();

  // 截图 00：空态引导卡
  await page.screenshot({ path: path.join(OUT_DIR, "00-empty-onboarding.png") });

  // R1.2 点卡① → 自动开录制开关 + 录制面板
  await page.click("#ecRec");
  await page.waitForTimeout(350);
  checks.r1_recToggleOn = await page.locator("#recToggle.on").count();
  checks.r1_recPanelShow = await page.locator("#recpanel.show").count();
  checks.r1_recText = (await page.locator("#recToggle").innerText()).includes("录制中");
  await page.click("#recToggle"); // 关掉，避免遮挡后续
  await page.waitForTimeout(300);

  // R1.3 点卡② → spec 导入弹窗
  await page.click("#ecSpec");
  await page.waitForTimeout(250);
  checks.r1_specModal = await page.locator(".spec-mask.show .spec-modal").count();
  checks.r1_specDrop = await page.locator(".sp-drop").count();
  await page.click(".sp-foot .sp-ok"); // 导入并派生测试
  await page.waitForTimeout(200);
  checks.r1_specDone = (await page.locator(".sp-done").innerText()).includes("10 个 operation");
  await page.click(".sp-foot .sp-ok"); // 完成 → 关弹窗
  await page.waitForTimeout(200);
  checks.r1_specClosed = await page.locator(".spec-mask.show").count() === 0;

  // R1.4 点卡③ → 新请求 tab + URL 聚焦
  await page.click("#ecReq");
  await page.waitForTimeout(300);
  checks.r1_newTab = await page.locator("#tabs .tab").count();
  checks.r1_urlFocused = await page.evaluate(() => document.activeElement && document.activeElement.id === "reqUrl");
  checks.r1_urlPlaceholder = await page.locator("#reqUrl").getAttribute("placeholder");

  // R1.5 关闭全部 tab → 回空态
  await page.evaluate(() => {
    document.querySelectorAll("#tabs .tab .x").forEach((x) => x.click());
  });
  await page.waitForTimeout(250);
  checks.r1_backToEmpty = await page.locator(".empty-wrap").count();
  checks.r1_tabsAfterClose = await page.locator("#tabs .tab").count();

  /* ============ 第 2 轮：既有功能回归 + 截图 ============ */
  // 01：点树 API → API 详情（断言表 + diff）
  await page.click('.api[onclick*="a2"]');
  await page.waitForTimeout(300);
  checks.r2_tabsAfterOpen = await page.locator("#tabs .tab").count();
  checks.r2_assertRows = await page.locator(".atable tr").count();
  checks.r2_diff = await page.locator(".diff .row").count();
  await page.screenshot({ path: path.join(OUT_DIR, "01-api-detail.png") });

  // 02：AI 抽屉（从录制生成用例）
  await page.click("#aiBtn");
  await page.waitForTimeout(350);
  checks.r2_drawer = await page.locator(".drawer.show").count();
  checks.r2_gcases = await page.locator(".gcase").count();
  await page.screenshot({ path: path.join(OUT_DIR, "02-ai-drawer.png") });
  await page.click("#drClose");
  await page.waitForTimeout(250);

  // 03：录制面板
  await page.click("#recToggle");
  await page.waitForTimeout(350);
  checks.r2_recDoms = await page.locator(".rp-dom").count();
  checks.r2_recRows = await page.locator(".rp-row").count();
  await page.screenshot({ path: path.join(OUT_DIR, "03-rec-panel.png") });
  await page.click("#recToggle");
  await page.waitForTimeout(300);

  // 04：场景步骤树（打开场景 tab）
  await page.click('.scn[onclick*="s1"]');
  await page.waitForTimeout(300);
  checks.r2_stepRows = await page.locator(".strow").count();
  checks.r2_nested = await page.locator(".stkids .stkids").count();
  checks.r2_failRow = await page.locator(".strow.fail").count();
  await page.screenshot({ path: path.join(OUT_DIR, "04-scenario-tree.png") });

  // 05：运行动画 → 汇总
  await page.click("#runBtn");
  await page.waitForTimeout(600);
  checks.r2_running = await page.evaluate(() =>
    !!document.querySelector(".sdot.run") || running === true);
  await page.waitForFunction(() => document.querySelector("#sum").textContent.includes("pass"), { timeout: 12000 });
  checks.r2_summary = await page.locator("#sum").innerText();
  await page.screenshot({ path: path.join(OUT_DIR, "05-scenario-run.png") });

  // 06：AI 断言诊断
  await page.evaluate(() => openAI("diag"));
  await page.waitForTimeout(350);
  checks.r2_diag = (await page.locator("#drBody").innerText()).includes("contract_break");
  await page.screenshot({ path: path.join(OUT_DIR, "06-ai-diagnose.png") });
  await page.click("#drClose");

  await browser.close();

  console.log("checks:", JSON.stringify(checks, null, 2));
  console.log("js errors:", errors.length === 0 ? "NONE" : JSON.stringify(errors, null, 2));
  const pass =
    errors.length === 0 &&
    // 第 1 轮
    checks.r1_emptyVisible === 1 && checks.r1_cards === 3 &&
    checks.r1_recBadge === "推荐" && checks.r1_tabsOnLoad === 0 &&
    checks.r1_cardTitles.length === 3 && checks.r1_cardGos === 3 &&
    checks.r1_recToggleOn === 1 && checks.r1_recPanelShow === 1 && checks.r1_recText === true &&
    checks.r1_specModal === 1 && checks.r1_specDrop === 1 && checks.r1_specDone === true && checks.r1_specClosed === true &&
    checks.r1_newTab === 1 && checks.r1_urlFocused === true &&
    checks.r1_backToEmpty === 1 && checks.r1_tabsAfterClose === 0 &&
    // 第 2 轮
    checks.r2_tabsAfterOpen === 1 && checks.r2_assertRows >= 4 && checks.r2_diff >= 1 &&
    checks.r2_drawer === 1 && checks.r2_gcases === 3 &&
    checks.r2_recDoms === 3 && checks.r2_recRows >= 6 &&
    checks.r2_stepRows >= 8 && checks.r2_nested >= 1 && checks.r2_failRow >= 1 &&
    checks.r2_running === true && /pass/.test(checks.r2_summary) && /fail/.test(checks.r2_summary) &&
    checks.r2_diag === true;
  console.log(pass ? "VERIFY PASS" : "VERIFY FAIL");
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
