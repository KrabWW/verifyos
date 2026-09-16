/**
 * 场景步骤树视图自验证：
 * 1. 打开 scenario 视图，0 JS 报错；
 * 2. 树含嵌套（循环 > 条件 > 请求，.step-children 内再有 .step-children）；
 * 3. 六种类型徽章全部可见；
 * 4. fail 节点高亮（.step-row.st-fail），点击后检查器显示失败断言详情；
 * 5. 运行动画走完出汇总（.scn-summary）；
 * 6. 其它视图不破坏（cases / coverage / api 正常渲染）；
 * 7. 截图 04-scenario-tree.png、05-scenario-inspector.png。
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
  await page.waitForTimeout(300);

  const checks = {};

  // 切到场景视图，选中深度场景 sc-002
  await page.click('[data-view="scenario"]');
  await page.waitForTimeout(200);
  await page.click('.scn-card[data-scn="sc-002"]');
  await page.waitForTimeout(300);

  // 1. 树渲染：节点数 / 嵌套 / 深度
  checks.stepRows = await page.locator(".step-row").count();
  checks.nestedChildren = await page.locator(".step-children .step-children").count(); // 循环>条件>请求 至少 1
  // 六种类型徽章
  for (const t of ["request", "condition", "loop", "wait", "assert", "reference"]) {
    checks["badge_" + t] = await page.locator(".step-tbadge.t-" + t).count();
  }
  // 循环>条件>请求 三层验证：condition 的 children 里有 request
  checks.loopGtCondGtReq = await page.evaluate(() => {
    const loopKids = document.querySelector('.step-children[data-owner="st-b2"]');
    if (!loopKids) return false;
    const condKids = loopKids.querySelector('.step-children[data-owner="st-b4"]');
    if (!condKids) return false;
    return !!condKids.querySelector('.step-row[data-node="st-b5"]');
  });

  // 2. fail 节点高亮 + 点击展开失败断言详情（检查器）
  checks.failRows = await page.locator(".step-row.st-fail").count();
  await page.click('.step-row[data-node="st-b5"]'); // 创建订单（fail）
  await page.waitForTimeout(250);
  checks.inspectorShown = await page.locator(".scn-inspector .insp-head").count();
  checks.inspFailMsg = await page.locator(".scn-inspector .fail-msg").count();
  checks.inspAssertRows = await page.locator(".scn-inspector .assert-row").count();

  // 3. 截图 04：步骤树全貌（先点选根级一个节点保持检查器打开状态也行；先截全貌）
  await page.click('.step-row[data-node="st-b1"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, "04-scenario-tree.png") });

  // 4. 截图 05：选中 fail 节点 + 检查器显示失败详情
  await page.click('.step-row[data-node="st-b8"]'); // 断言：订单总数 = 2（fail）
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, "05-scenario-inspector.png") });
  checks.shot05FailMsg = await page.locator(".scn-inspector .fail-msg").count();

  // 5. 运行动画：点运行 → 等待跑完 → 出汇总
  await page.click("#scnRun");
  await page.waitForTimeout(400);
  checks.runningSeen = await page.evaluate(() => !!document.querySelector(".step-status.running") || !!document.querySelector("#scnRun[disabled]"));
  // 10 节点 × 240ms ≈ 2.4s + 收尾，等 6s 足够
  await page.waitForSelector(".scn-summary", { timeout: 10000 });
  checks.summaryText = await page.locator(".scn-summary").innerText();

  // 6. 添加步骤演示：等断言类（不依赖二级菜单）→ 确认树节点数增加
  const before = await page.locator(".step-row").count();
  await page.click("#scnAddBtn");
  await page.waitForTimeout(150);
  await page.click('.add-item[data-add="wait"]');
  await page.waitForTimeout(200);
  checks.addedDelta = (await page.locator(".step-row").count()) - before;

  // 请求原语 → API 清单二级菜单
  await page.click("#scnAddBtn");
  await page.waitForTimeout(150);
  await page.click('.add-item[data-add="request"]');
  await page.waitForTimeout(150);
  checks.apiPicker = await page.locator(".add-item[data-add-api]").count();
  await page.click('.add-item[data-add-api="api-002"]');
  await page.waitForTimeout(200);
  checks.addedApiDelta = (await page.locator(".step-row").count()) - before - checks.addedDelta;

  // 7. 折叠演示：折叠循环节点
  await page.click('.step-row[data-node="st-b2"] .twist');
  await page.waitForTimeout(150);
  checks.collapseWorks = await page.evaluate(() => document.querySelectorAll(".step-children.hide").length);
  await page.click('.step-row[data-node="st-b2"] .twist'); // 恢复展开
  await page.waitForTimeout(150);

  // 8. 其它视图不破坏
  await page.click('[data-view="cases"]');
  await page.waitForTimeout(200);
  checks.caseCards = await page.locator(".case-card").count();
  await page.click('[data-view="coverage"]');
  await page.waitForTimeout(200);
  checks.covRows = await page.locator(".cov-row").count();
  await page.click('[data-view="api"]');
  await page.waitForTimeout(200);
  checks.apiTreeItems = await page.locator(".tree-item").count();

  await browser.close();

  console.log("checks:", JSON.stringify(checks, null, 2));
  console.log("js errors:", errors.length === 0 ? "NONE" : JSON.stringify(errors, null, 2));
  const pass =
    errors.length === 0 &&
    checks.stepRows >= 10 &&
    checks.nestedChildren >= 1 &&
    checks.loopGtCondGtReq === true &&
    ["request", "condition", "loop", "wait", "assert", "reference"].every((t) => checks["badge_" + t] >= 1) &&
    checks.failRows >= 1 &&
    checks.inspectorShown === 1 &&
    checks.inspFailMsg >= 1 &&
    checks.inspAssertRows >= 1 &&
    checks.shot05FailMsg >= 1 &&
    checks.runningSeen === true &&
    /fail/.test(checks.summaryText) &&
    checks.addedDelta >= 1 &&
    checks.apiPicker >= 5 &&
    checks.addedApiDelta >= 1 &&
    checks.collapseWorks >= 1 &&
    checks.caseCards >= 5 &&
    checks.covRows >= 7 &&
    checks.apiTreeItems >= 5;
  console.log(pass ? "VERIFY PASS" : "VERIFY FAIL");
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
