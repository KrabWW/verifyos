/**
 * 插件示例 B：页面结构抓取（page-structure）——AI 生成验证步骤前先对照真实 DOM
 *
 * 解决的问题：ver_5cm3ay 首版步骤臆测了不存在的筛选器（时间范围）与 Element UI
 * 分页类名，导致执行必失败。正确流程是「抓结构 → 产步骤」：
 *   1. POST /capture 拿 outline（紧凑、面向 LLM 的 UI 清单）；
 *   2. 把 outline JSON 贴进步骤生成提示词（或后续接入生成器）；
 *   3. 产出的 selector 直接可用于 deterministic 步骤（fill/click/press）。
 *
 * 设计要点：
 *   - playwright 经仓库根 node_modules 提升，插件目录 require('playwright') 直接可用；
 *   - outline 提取覆盖 antd 特征：.ant-select 两段式交互、has-text("搜 索") 空格按钮、
 *     自研分页「前往/共 N 条」——全部来自 ver_5cm3ay 的真实踩坑；
 *   - 登录态：传 cookie 字符串（document.cookie 格式）注入 extraHTTPHeaders；
 *   - 截图默认开，落 out/evidence/page-structure/（与人查证据同目录习惯）。
 *
 * 验证：
 *   curl -X POST http://localhost:8082/api/plugins/page-structure/capture ^
 *     -H "Content-Type: application/json" ^
 *     -d "{\"url\":\"https://example.com\"}"
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const MAX_NODES = 220;

module.exports = {
  async activate(ctx) {
    let browser = null;
    const getBrowser = async () => {
      if (browser && browser.isConnected()) return browser;
      browser = await chromium.launch({ headless: true });
      return browser;
    };

    ctx.registerRoute('post', '/capture', async (req, res) => {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const url = String(body.url ?? '');
      if (!/^https?:\/\//.test(url)) {
        res.status(400).json({ error: 'body.url 必填且须为 http(s) URL' });
        return;
      }
      const cookie = typeof body.cookie === 'string' ? body.cookie : undefined;
      const wantShot = body.screenshot !== false;
      const t0 = Date.now();

      const b = await getBrowser();
      const context = await b.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: cookie ? { cookie } : undefined,
      });
      const page = await context.newPage();
      try {
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        } catch {
          // networkidle 超时（长轮询/埋点不息）退回 domcontentloaded——页面本身已可用
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        }
        await page.waitForTimeout(600); // 等首屏渲染/antd 挂载
        const finalUrl = page.url();
        const title = await page.title();

        // 在浏览器上下文内自包含执行：产出面向 LLM 的 outline 行
        const outline = await page.evaluate((maxNodes) => {
          const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
          const out = [];
          const push = (s) => {
            if (out.length < maxNodes && s && out[out.length - 1] !== s) out.push(s);
          };
          for (const el of document.querySelectorAll(
            'button, [role=button], input[type=button], input[type=submit], a[href]',
          )) {
            const t = clean(el.innerText || el.value || el.getAttribute('aria-label'));
            if (t) push('button "' + t + '"');
          }
          for (const el of document.querySelectorAll('input, textarea')) {
            const type = el.getAttribute('type') || 'text';
            if (type === 'button' || type === 'submit' || type === 'hidden') continue;
            const label =
              clean(el.getAttribute('placeholder')) ||
              clean(el.getAttribute('aria-label')) ||
              clean(el.getAttribute('name'));
            if (label) push('input[type=' + type + '] placeholder="' + label + '"');
            else push('input[type=' + type + ']');
          }
          for (const sel of document.querySelectorAll('select')) {
            const opts = Array.from(sel.querySelectorAll('option'))
              .map((o) => clean(o.textContent))
              .filter(Boolean)
              .slice(0, 6);
            const aria = clean(sel.getAttribute('aria-label'));
            push('select ' + (aria ? '"' + aria + '" ' : '') + 'options=[' + opts.join(' / ') + ']');
          }
          for (const el of document.querySelectorAll('.ant-select')) {
            const label = clean(el.textContent).slice(0, 30);
            push('.ant-select "' + label + '"（两段式：先点展开 → 再点 .ant-select-item 选项）');
          }
          for (const table of document.querySelectorAll('table')) {
            const ths = Array.from(table.querySelectorAll('th'))
              .map((t) => clean(t.textContent))
              .filter(Boolean);
            if (ths.length) push('table columns: ' + ths.join(' | '));
          }
          const bodyText = clean(document.body.innerText);
          const total = bodyText.match(/共\s*\d+\s*条/);
          if (total) push('pagination text: ' + total[0]);
          if (/前往/.test(bodyText)) push('pagination jump: text=前往（自研分页跳页输入，fill+press Enter）');
          for (const h of Array.from(document.querySelectorAll('h1,h2,h3'))
            .map((x) => clean(x.textContent))
            .filter(Boolean)
            .slice(0, 8)) {
            push('heading "' + h + '"');
          }
          return out;
        }, MAX_NODES);

        let shot = null;
        if (wantShot) {
          const dir = path.join(ctx.rootDir, 'out', 'evidence', 'page-structure');
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(
            dir,
            String(finalUrl)
              .replace(/^https?:\/\//, '')
              .replace(/[^a-zA-Z0-9]+/g, '-')
              .slice(0, 60) + '-' + Date.now() + '.png',
          );
          await page.screenshot({ path: file });
          shot = { path: file, bytes: fs.statSync(file).size };
        }

        res.json({
          found: true,
          url,
          finalUrl,
          title,
          nodeCount: outline.length,
          truncated: outline.length >= MAX_NODES,
          outline,
          screenshot: shot,
          elapsedMs: Date.now() - t0,
          note: '把 outline JSON 贴进「AI 生成验证步骤」提示词即可对照真实 UI；selector 片段可直接用于 deterministic 步骤（fill/click/press）',
        });
      } finally {
        await context.close().catch(() => {});
      }
    });

    ctx.log('已就绪：POST /api/plugins/page-structure/capture {url, cookie?, screenshot?}');
  },

  async deactivate() {
    if (browser) await browser.close().catch(() => {});
  },
};
