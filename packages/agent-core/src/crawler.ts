import { extractReasoningMiddleware, defaultSettingsMiddleware, wrapLanguageModel } from 'ai';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { Stagehand, AISdkClient } from '@browserbasehq/stagehand';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ApprovalManager } from './approval.js';

// ---------- 类型 ----------

export interface CrawlCredential {
  username: string;
  password: string;
}

export interface CrawlLlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface CrawlConfig {
  startUrl: string;
  maxDepth?: number; // 默认 3
  maxPages?: number; // 默认 20
  /** 爬取意图（≤500 字符，qa.tech Crawling Intent 对齐；当前版本仅记录，不做链接筛选） */
  intent?: string;
  /** 提供则遇登录墙时直接用 LLM（Stagehand act，A5 验证组合）执行登录 */
  credential?: CrawlCredential;
  /** 提供则遇登录墙且无 credential 时挂起发凭据请求（B3 WAITING_FOR_APPROVAL 门控），用户提交后自动续登 */
  approval?: ApprovalManager;
  /** approval 请求附带的角色/环境上下文（凭据按角色+环境维度存储） */
  credentialRole?: string;
  llm?: CrawlLlmConfig;
  headless?: boolean;
  /** G10: headful 人工接管模式——有头浏览器（headless=false）+ 固定 CDP 端口 9222，可经 chrome://inspect 直连被测页面 */
  headful?: boolean;
  /** F4: 增量事件（页/登录粒度，探索工作台实时渲染） */
  onProgress?: (e: CrawlProgressEvent) => void;
  /** F4: 人工接管控制——BFS 每页前检查（isStopped 退出循环，isPaused 挂起等待） */
  control?: { isPaused: () => boolean; isStopped: () => boolean };
  /** L5: 每页截图目录（提供则每页访问后 page.screenshot 存 <dir>/NNN.png，事件带 shotKey=「目录名/NNN.png」；
   *  暂停（人工接管）期间每 2s 续拍，前端截图流不中断） */
  shotDir?: string;
}

/** F4: 探索增量事件（page=每页完成 / login=登录尝试结果 / takeover=人工接管恢复） */
export type CrawlProgressEvent =
  | { kind: 'page'; url: string; title: string; depth: number; interactive: number; loginWall: boolean; links: number;
      /** F4-LF: 页粒度遥测——HTTP 状态/加载耗时/JS 错误数（Live Findings 多类型数据源） */
      status?: number; loadMs?: number; consoleErrors?: number;
      /** L5: 本页截图 key（相对探索截图根目录，如 exp_abc123/001.png；shotDir 未配置或截图失败时缺省） */
      shotKey?: string }
  | { kind: 'login'; ok: boolean; message: string }
  | { kind: 'takeover'; urls: string[] }
  /** L5: 暂停期间实时画面（人工接管中每 2s 一拍，供前端截图流持续可见） */
  | { kind: 'shot'; shotKey: string; url: string };

export interface CrawledPage {
  url: string;
  title: string;
  depth: number;
  links: string[];
  loginWall: boolean;
  interactive: number;
  headings: string[];
}

export interface CrawlEdge {
  from: string;
  to: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  edges: CrawlEdge[];
  loginWallDetected: boolean;
  authenticated: boolean;
  /** 登录成功后的 storageState JSON（Output State；供后续 Resume From 直接恢复会话） */
  outputStateJson?: string;
}

// ---------- 引擎 ----------

/**
 * Crawler（B2）：Playwright BFS 同域爬取 + 登录墙检测 + Stagehand 登录 + Output State 恢复。
 *
 * 设计要点：
 * - 有 credential 时整体跑在 Stagehand 持有的浏览器上（登录 act 与爬取同一 context，
 *   登录后直接从该 context 取 storageState —— 认证即状态）
 * - 无 credential 时用纯 Playwright（不需要 LLM，零成本）
 * - 登录墙启发式：页面存在 input[type=password]
 * - JS 重定向（如会话守卫 location.replace）通过 goto 后短等待 + 以最终 URL 去重处理
 */
export class Crawler {
  /** G10: 当前浏览器 CDP 接入点（headful launch 后有值；headless 运行保持 null） */
  private currentCdpEndpoint: string | null = null;

  /** G10: headful 模式 CDP 接入端点（http://127.0.0.1:9222）；headless 返回 null */
  cdpEndpoint(): string | null {
    return this.currentCdpEndpoint;
  }

  async crawl(cfg: CrawlConfig): Promise<CrawlResult> {
    const maxDepth = cfg.maxDepth ?? 3;
    const maxPages = cfg.maxPages ?? 20;
    const startOrigin = new URL(cfg.startUrl).origin;
    // G10: headful 优先——显式接管模式强制有头（默认仍为 headless）
    const headless = cfg.headful ? false : (cfg.headless ?? true);
    if (cfg.headful) this.currentCdpEndpoint = 'http://127.0.0.1:9222';

    let sh: Stagehand | undefined;
    let browser: Browser | undefined;
    let context: BrowserContext;
    let page: Page;
    let credential = cfg.credential;

    const needLlm = !!(credential || cfg.approval);
    if (needLlm && !cfg.llm) throw new Error('提供 credential/approval 时必须提供 llm 配置（登录依赖 Stagehand act）');
    const llm = cfg.llm!;

    if (needLlm) {
      const provider = createOpenAICompatible({
        name: 'glm',
        apiKey: llm.apiKey,
        baseURL: llm.baseURL,
      });
      const llmClient = new AISdkClient({
        model: wrapLanguageModel({
          model: provider(llm.model),
          middleware: [
            extractReasoningMiddleware({ tagName: 'think' }),
            defaultSettingsMiddleware({ settings: { maxTokens: 16384 } }),
          ],
        }),
      } as never);
      sh = new Stagehand({
        env: 'LOCAL',
        llmClient,
        verbose: 0,
        localBrowserLaunchOptions: {
          headless,
          // G10: headful 接管——固定 CDP 端口供 chrome://inspect 直连
          ...(cfg.headful ? { args: ['--remote-debugging-port=9222'] } : {}),
        },
      } as never);
      await sh.init();
      page = sh.page;
      context = page.context();
    } else {
      browser = await chromium.launch({
        headless,
        // G10: headful 接管——固定 CDP 端口供 chrome://inspect 直连
        ...(cfg.headful ? { args: ['--remote-debugging-port=9222'] } : {}),
      });
      context = await browser.newContext();
      page = await context.newPage();
    }

    const norm = (u: string) => {
      const x = new URL(u);
      x.hash = '';
      // SSO/CAS 登录页的 service/ticket 等易变参数会使同一登录页被重复爬取/记录——命中即去掉整个 query
      if (x.searchParams.has('service') || x.searchParams.has('ticket') || x.searchParams.has('redirect_uri') || x.searchParams.has('ReturnUrl')) {
        x.search = '';
      }
      let s = x.toString();
      if (s.endsWith('/')) s = s.slice(0, -1);
      return s;
    };

    const pages: CrawledPage[] = [];
    const edges: CrawlEdge[] = [];
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [{ url: norm(cfg.startUrl), depth: 0 }];

    let loginWallDetected = false;
    let authenticated = false;
    let loginAttempted = false;
    let outputStateJson: string | undefined;

    // L5: 每页截图——存 <shotDir>/NNN.png，返回相对 key（目录名/NNN.png）；失败不阻塞爬取
    let shotCounter = 0;
    const takeShot = async (): Promise<string | undefined> => {
      if (!cfg.shotDir) return undefined;
      try {
        await fs.promises.mkdir(cfg.shotDir, { recursive: true });
        const name = `${String(++shotCounter).padStart(3, '0')}.png`;
        await page.screenshot({ path: path.join(cfg.shotDir, name), timeout: 5000 });
        return `${path.basename(cfg.shotDir)}/${name}`;
      } catch {
        return undefined;
      }
    };

    const extract = async (url: string, depth: number): Promise<CrawledPage> => {
      return await page.evaluate((args) => {
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter(Boolean);
        const headings = Array.from(document.querySelectorAll('h1, h2'))
          .map((h) => (h.textContent ?? '').trim())
          .filter(Boolean)
          .slice(0, 5);
        const interactive = document.querySelectorAll('a, button, input, select, textarea').length;
        const loginWall = !!document.querySelector('input[type="password"]');
        return {
          url: args.url,
          title: document.title,
          depth: args.depth,
          links,
          loginWall,
          interactive,
          headings,
        };
      }, { url, depth });
    };

    const doLogin = async (): Promise<void> => {
      if (!sh || !credential) return;
      loginAttempted = true;
      await sh.page.act(`在用户名输入框填写「${credential.username}」`);
      await sh.page.act(`在密码输入框填写「${credential.password}」`);
      await sh.page.act('点击登录按钮');
      await page.waitForTimeout(1200);
      const stillWall = await page.evaluate(() => !!document.querySelector('input[type="password"]'));
      authenticated = !stillWall;
      if (authenticated) {
        outputStateJson = JSON.stringify(await context.storageState());
      }
    };

    try {
      // F4-LF: JS 控制台错误计数（console error + 未捕获异常），每页前重置
      let consoleErrors = 0;
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors += 1; });
      page.on('pageerror', () => { consoleErrors += 1; });

      // F4-deep: 接管期间导航记录——暂停时人在有头窗口里的主框架跳转全记下，恢复时并入 BFS 队列
      const humanNavs: string[] = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame() && cfg.control?.isPaused()) {
          try { humanNavs.push(norm(frame.url())); } catch { /* about:blank 等忽略 */ }
        }
      });
      let takeoverAnnounced = 0; // 已并入队列的人工导航数（避免重复 announce）

      // F4-deep: 循环条件含 isPaused——暂停期间即使队列已空也不退出（人可能正在操作，恢复后会有新页面并入）
      let lastPauseShotAt = 0; // L5: 暂停期间截图节拍（2s 一拍，截图流不中断）
      while ((queue.length > 0 || cfg.control?.isPaused()) && pages.length < maxPages) {
        if (cfg.control?.isStopped()) break; // F4: 人工停止——保留已爬页面照常产出
        while (cfg.control?.isPaused()) {
          await new Promise((r) => setTimeout(r, 500));
          // L5: 接管（暂停）期间每 2s 续拍当前画面——前端浏览器舞台持续可见人工操作实况
          if (cfg.shotDir && Date.now() - lastPauseShotAt > 2000) {
            lastPauseShotAt = Date.now();
            const k = await takeShot();
            if (k) cfg.onProgress?.({ kind: 'shot', shotKey: k, url: page.url() });
          }
        }

        // F4-deep: 暂停结束（交还）——把人工访问过的页面（含新标签页当前 URL）并入队首，从人的位置继续
        if (humanNavs.length > takeoverAnnounced) {
          const extraTabs: string[] = [];
          for (const p of context.pages()) {
            try {
              const u = norm(p.url());
              if (u.startsWith(startOrigin)) extraTabs.push(u);
            } catch { /* 忽略 */ }
          }
          const merged = [...new Set([...humanNavs.slice(takeoverAnnounced), ...extraTabs])]
            .filter((u) => u.startsWith(startOrigin) && !visited.has(u) && !queue.some((q) => q.url === u));
          takeoverAnnounced = humanNavs.length;
          if (merged.length > 0) {
            queue.unshift(...merged.map((u) => ({ url: u, depth: 1 })));
            cfg.onProgress?.({ kind: 'takeover', urls: merged });
          }
        }

        if (queue.length === 0) break; // 恢复后仍无新页面——正常收尾
        const { url, depth } = queue.shift()!;
        if (visited.has(url)) continue;

        consoleErrors = 0;
        const gotoStart = Date.now();
        let httpStatus: number | undefined;
        try {
          const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          httpStatus = resp?.status();
        } catch {
          visited.add(url);
          continue;
        }
        await page.waitForTimeout(700); // 等 JS 会话守卫重定向落地
        const loadMs = Date.now() - gotoStart;

        // L5: 页面落地即拍——先截图再抽取，事件带 shotKey 供前端实时渲染
        const shotKey = await takeShot();

        const finalUrl = norm(page.url());
        if (visited.has(finalUrl)) {
          visited.add(url);
          continue;
        }
        visited.add(url);
        visited.add(finalUrl);

        const info = await extract(finalUrl, depth);
        if (!info.loginWall) {
          pages.push(info); // 登录墙页只是墙，不计入业务页面产出
        }
        cfg.onProgress?.({ kind: 'page', url: finalUrl, title: info.title, depth, interactive: info.interactive, loginWall: info.loginWall, links: info.links.length, status: httpStatus, loadMs, consoleErrors, ...(shotKey ? { shotKey } : {}) });
        if (info.loginWall) {
          loginWallDetected = true;
          // 遇墙且无凭据 → B3 门控：挂起发凭据请求，用户提交后补凭据
          if (!credential && cfg.approval && !loginAttempted) {
            const res = await cfg.approval.request({
              kind: 'credential',
              title: `${startOrigin} 需要登录凭据`,
              reason: '检测到登录墙（密码表单），无法继续爬取墙内页面',
              fields: [
                { key: 'username', label: '用户名', type: 'text', required: true, placeholder: 'demo@acme.crm' },
                { key: 'password', label: '密码', type: 'password', required: true },
              ],
              context: { url: finalUrl, role: cfg.credentialRole },
              timeoutMs: 10 * 60_000,
            });
            if (res.approved) {
              credential = { username: res.values.username, password: res.values.password };
            } else {
              loginAttempted = true; // 用户拒绝/超时：本轮不再尝试
            }
          }
          // 有凭据且未尝试过 → 登录，成功后在当前页继续抽取链接
          if (credential && !loginAttempted) {
            await doLogin();
            cfg.onProgress?.({ kind: 'login', ok: authenticated, message: authenticated ? `登录成功（${credential.username}），继续爬取墙内页面` : '登录尝试未成功，继续爬公开页' });
            if (authenticated) {
              loginAttempted = true; // 每轮探索只登一次，避免会话再过期时无限登录循环
              // FIX: CAS/SSO 登录成功后浏览器未必自动回跳业务页——显式导航回本队列项原始 URL 再抽取
              try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(1200);
              } catch { /* 导航失败则退回当前页 */ }
              const afterUrl = norm(page.url());
              // 登录页本身不计入探索产出（它只是墙，不是业务页面）
              const wallPageIdx = pages.findIndex((p) => p.loginWall && p.url === finalUrl);
              if (wallPageIdx >= 0) pages.splice(wallPageIdx, 1);
              // 原始 url 在 goto 时已被标 visited——登录成功后显式重访，必须解除
              visited.delete(url);
              visited.delete(afterUrl);
              if (!visited.has(afterUrl)) {
                visited.add(afterUrl);
                const afterInfo = await extract(afterUrl, depth);
                pages.push(afterInfo);
                cfg.onProgress?.({ kind: 'page', url: afterUrl, title: afterInfo.title, depth, interactive: afterInfo.interactive, loginWall: afterInfo.loginWall, links: afterInfo.links.length, status: httpStatus, loadMs: Date.now() - gotoStart });
                for (const l of afterInfo.links) this.enqueue(afterInfo.url, l, startOrigin, depth, maxDepth, queue, visited, edges);
              }
            }
          }
        }

        for (const l of info.links) this.enqueue(info.url, l, startOrigin, depth, maxDepth, queue, visited, edges);
      }
    } finally {
      if (sh) await sh.close().catch(() => undefined);
      if (browser) await browser.close().catch(() => undefined);
    }

    return { pages, edges, loginWallDetected, authenticated, outputStateJson };
  }

  private enqueue(
    from: string,
    link: string,
    startOrigin: string,
    depth: number,
    maxDepth: number,
    queue: Array<{ url: string; depth: number }>,
    visited: Set<string>,
    edges: CrawlEdge[],
  ): void {
    let u: URL;
    try {
      u = new URL(link);
    } catch {
      return;
    }
    if (u.origin !== startOrigin) return;
    if (!/^https?:$/.test(u.protocol)) return;
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    edges.push({ from, to: s });
    if (depth + 1 <= maxDepth && !visited.has(s) && !queue.some((q) => q.url === s)) {
      queue.push({ url: s, depth: depth + 1 });
    }
  }
}
