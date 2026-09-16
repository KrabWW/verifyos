/**
 * B2 冒烟：Crawler 三场景验证（真实浏览器 + 真实 GLM 登录）
 *   场景 A：无凭据 → 撞登录墙，只能爬到公开页
 *   场景 B：有凭据 → Stagehand×glm-4.5v 登录成功，爬到墙内全部页面，产出 Output State
 *   场景 C：用 Output State 恢复新会话 → 直访内页不被重定向（认证即状态）
 *
 * 运行：npx tsx src/crawler.smoke.ts（需根目录 .env 含 LLM_API_KEY）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { Crawler } from './crawler.js';
import { serveStatic } from './static-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
    failures++;
  }
}

async function main() {
  const siteDir = path.resolve(__dirname, '../fixtures/site');
  const srv = await serveStatic(siteDir);
  console.log(`fixture 站点：${srv.url}\n`);

  const crawler = new Crawler();

  // ---------- 场景 A：无凭据 → 登录墙 ----------
  console.log('[A] 无凭据爬取（预期：撞墙，仅公开页）');
  const a = await crawler.crawl({ startUrl: `${srv.url}/login.html`, maxDepth: 3, maxPages: 20 });
  const aUrls = a.pages.map((p) => p.url);
  check('A1 检测到登录墙', a.loginWallDetected);
  check('A2 未认证', !a.authenticated);
  check('A3 爬到公开页 about.html', aUrls.some((u) => u.includes('about.html')));
  check('A4 未爬进内页 list.html（被守卫重定向）', !aUrls.some((u) => u.includes('list.html')), JSON.stringify(aUrls));
  check('A5 登录页标记 loginWall', a.pages.find((p) => p.url.includes('login.html'))?.loginWall === true);

  // ---------- 场景 B：有凭据 → LLM 登录后全爬 ----------
  console.log('\n[B] 有凭据爬取（Stagehand × glm-4.5v 登录，预期：全站爬通 + Output State）');
  const b = await crawler.crawl({
    startUrl: `${srv.url}/login.html`,
    maxDepth: 3,
    maxPages: 20,
    credential: { username: 'admin', password: 'test123' },
    llm: {
      apiKey: process.env.LLM_API_KEY ?? '',
      baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
    },
  });
  const bUrls = b.pages.map((p) => p.url);
  console.log('  爬取页面：', bUrls.map((u) => u.replace(srv.url, '')).join(', '));
  check('B1 检测到登录墙', b.loginWallDetected);
  check('B2 登录成功（authenticated）', b.authenticated);
  check('B3 产出 Output State（storageState JSON）', !!b.outputStateJson && b.outputStateJson.includes('session'));
  check('B4 爬进内页 list.html', bUrls.some((u) => u.includes('list.html')));
  check('B5 爬进 detail1.html 与 detail2.html', bUrls.some((u) => u.includes('detail1.html')) && bUrls.some((u) => u.includes('detail2.html')));
  check('B6 页面数 ≥ 5（login+list+detail1+detail2+about）', b.pages.length >= 5, `实际 ${b.pages.length}`);
  check('B7 边数量 ≥ 4（链接关系落图）', b.edges.length >= 4, `实际 ${b.edges.length}`);
  check('B8 内页标题抽取正确', b.pages.find((p) => p.url.includes('list.html'))?.title.includes('员工列表') === true);

  // ---------- 场景 C：Output State 恢复 → 直访内页 ----------
  console.log('\n[C] 用 Output State 恢复新会话（预期：直访 list.html 不被踢回登录页）');
  if (b.outputStateJson) {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: JSON.parse(b.outputStateJson) });
    const page = await ctx.newPage();
    await page.goto(`${srv.url}/list.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    const finalUrl = page.url();
    const title = await page.title();
    await browser.close();
    check('C1 直访内页未被重定向', finalUrl.includes('list.html'), `落到 ${finalUrl}`);
    check('C2 内页标题正确（会话恢复）', title.includes('员工列表'), `标题 ${title}`);
  } else {
    check('C 跳过：场景 B 未产出 Output State', false);
  }

  srv.close();
  console.log(failures === 0 ? '\n✅ B2 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
