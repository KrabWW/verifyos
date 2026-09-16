import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Stagehand, AISdkClient, type Page } from '@browserbasehq/stagehand';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ev, type RunEvent, type Verdict } from '@verifyos/shared';
import { type EvidenceStore, evidenceKey } from './evidence.js';
import { verifyReachability, aggregateVerdicts, type ReachabilityVerdict } from './reachability.js';
import { isNativeTarget, nativePlaceholderMessage, nativeEnvironmentUrl, type DeviceTarget, type NativeAppRunConfig } from './native-mobile.js';

// ---------- 步骤模型 ----------

export type RunnerStepKind = 'module' | 'ai' | 'deterministic' | 'assertion';

export interface ActionDef {
  type: 'goto' | 'fill' | 'click';
  selector?: string;
  value?: string;
  url?: string;
}

export interface AssertDef {
  kind: 'url_contains' | 'text_visible' | 'element_visible';
  value: string;
}

export interface StepDef {
  id: string;
  title: string;
  kind: RunnerStepKind;
  /** deterministic/module：直接导航 */
  goto?: string;
  /** module/deterministic：CSS 选择器级确定性动作（零 LLM） */
  actions?: ActionDef[];
  /** ai：自然语言指令（Stagehand act；失败时查 LocatorCache 走确定性重放） */
  instruction?: string;
  /** assertion：断言（也可附加在其他步骤后独立成步） */
  assert?: AssertDef;
  /** C3：该步骤声称要触达的目标分支（URL 子串）——全绿但未触达 → 判 unknown（防假绿） */
  targetRef?: string;
  /** T16 固化：ai 步骤跑通后写回的确定性 selector（下次跑直接零 LLM 执行） */
  selector?: string;
  /** T16 固化：selector 对应动作类型（默认 click；fill 需配合 value） */
  action?: 'click' | 'fill';
  /** T16 固化：fill 动作的输入值 */
  value?: string;
}

// ---------- 元素定位缓存 ----------

/** 缓存条目（对外暴露，供 server 持久化到 locator_cache 表） */
export interface CacheEntry {
  selector: string;
  /** 动作类型：act 指令通常对应一次点击或填值 */
  action: 'click' | 'fill';
  value?: string;
  hits: number;
}

/**
 * LocatorCache（C1）：ai 指令 → 确定性 selector。
 * 首次 act 成功后尽量从结果提取 selector 入缓存；命中后重放走确定性通道（零 LLM）。
 * 提取不到时该指令保持 miss（每次 act），不影响正确性。
 * T16：支持 entries()/load() 暴露与批量装载，供 server 跨重启持久化到 locator_cache 表。
 */
export class LocatorCache {
  private map = new Map<string, CacheEntry>();

  get(instruction: string): CacheEntry | undefined {
    const e = this.map.get(instruction);
    if (e) e.hits++;
    return e;
  }

  /** 只读查询（不增加 hits；固化写回/持久化遍历用） */
  peek(instruction: string): CacheEntry | undefined {
    return this.map.get(instruction);
  }

  set(instruction: string, entry: Omit<CacheEntry, 'hits'>): void {
    this.map.set(instruction, { ...entry, hits: 0 });
  }

  /** 全量条目（含 instruction + hits，供 server 落库 upsert） */
  entries(): Array<CacheEntry & { instruction: string }> {
    return [...this.map.entries()].map(([instruction, e]) => ({ instruction, ...e }));
  }

  /** 批量装载（server 启动时从 locator_cache 表恢复，跨重启命中） */
  load(entries: Array<{ instruction: string; selector: string; action: 'click' | 'fill'; value?: string; hits?: number }>): void {
    for (const e of entries) {
      if (e?.instruction && e?.selector) {
        this.map.set(e.instruction, { selector: e.selector, action: e.action ?? 'click', value: e.value, hits: e.hits ?? 0 });
      }
    }
  }

  stats(): { entries: number; totalHits: number } {
    let totalHits = 0;
    for (const e of this.map.values()) totalHits += e.hits;
    return { entries: this.map.size, totalHits };
  }
}

// ---------- 设备模拟描述（移动 Web；原生 App Phase 5+ 走 Maestro/Appium） ----------

const DEVICE_PROFILES: Record<string, { viewport: { width: number; height: number }; userAgent: string; hasTouch: boolean; isMobile: boolean; deviceScaleFactor: number }> = {
  'iPhone 13': { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  'Pixel 9 Pro': { viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', hasTouch: true, isMobile: true, deviceScaleFactor: 2.625 },
  'iPhone SE': { viewport: { width: 375, height: 667 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  'iPad Mini': { viewport: { width: 768, height: 1024 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: false, deviceScaleFactor: 2 },
};

function deviceProfile(name: string) {
  return DEVICE_PROFILES[name] ?? DEVICE_PROFILES['iPhone 13'];
}

// ---------- RunRunner ----------

export interface StepResult {
  id: string;
  verdict: Verdict;
  llmCalls: number;
  cacheHit: boolean;
  durationMs: number;
}

export interface RunOutcome {
  verdict: Verdict;
  events: RunEvent[];
  failedStep?: string;
  failureSummary?: string;
  llmCalls: number;
  cache: { entries: number; totalHits: number };
  stepResults: StepResult[];
  durationMs: number;
  /** C2：证据 key 列表（store 内相对 key），未开证据时为空 */
  evidenceKeys: string[];
  /** C3：本次 Run 实际触达的 URL 路径（按序） */
  visitedUrls: string[];
  /** C3：触达校验明细（有 targetRef 的步骤才有） */
  reachability: ReachabilityVerdict[];
}

export interface RunLlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * RunRunner（C1）：混合步骤执行引擎。
 * - module/deterministic：CSS 选择器动作，零 LLM（llmCalls=0 可观测）
 * - ai：Stagehand act（A5 组合 glm-4.5v + openai-compatible），LocatorCache 命中后零 LLM 重放
 * - assertion：url_contains / text_visible / element_visible
 * - 全程发 A3 RunEvent 事件流（ev 构造器），失败快速中断
 */
export class RunRunner {
  readonly cache = new LocatorCache();
  private llmCalls = 0;

  constructor(private readonly llm: RunLlmConfig) {}

  /** 从自然语言指令抽取最可能的交互文本（「关于我们」→ 关于我们） */
  private instructionText(instruction: string): string | undefined {
    const quoted = instruction.match(/[「『"“]([^」』"”]{1,20})[」』"”]/);
    if (quoted) return quoted[1];
    return undefined;
  }

  /**
   * 注入交互探针（T16）：act 前捕获 click/input 事件目标元素并写入 localStorage。
   * localStorage 按源域存活，跨页面导航后仍可读——这是链接类点击（act 后页面已跳走、
   * activeElement 失效）时仍能反查 selector 的关键。
   */
  private async injectProbe(page: Page): Promise<void> {
    await page.evaluate(() => {
      const esc = (s: string): string => {
        try { return (window as unknown as { CSS: { escape: (v: string) => string } }).CSS.escape(s); }
        catch { return s.replace(/[^\w-]/g, '\\$&'); }
      };
      const record = (e: Event) => {
        const el = e.target as HTMLElement | null;
        if (!el || el === document.body || el === document.documentElement) return;
        const tag = el.tagName?.toLowerCase() ?? '';
        const id = el.id ?? '';
        const cls = typeof el.className === 'string' ? el.className.trim() : '';
        const name = (el as HTMLInputElement)?.name ?? '';
        const value = (el as HTMLInputElement)?.value ?? '';
        const text = (el.textContent ?? '').trim().slice(0, 40);
        let sel = '';
        if (id) sel = `#${esc(id)}`;
        else if ((tag === 'input' || tag === 'textarea' || tag === 'select') && name) sel = `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
        else if (cls) sel = `${tag}${cls.split(/\s+/).filter(Boolean).map((c) => `.${esc(c)}`).join('')}`;
        else if (text && tag) sel = `${tag}:has-text("${text.replace(/"/g, '\\"')}")`;
        try { localStorage.setItem('__verifyos_probe', JSON.stringify({ sel, tag, text, value })); } catch { /* ignore */ }
      };
      try { localStorage.setItem('__verifyos_probe', ''); } catch { /* ignore */ }
      document.addEventListener('click', record, true);
      document.addEventListener('input', record, true);
    });
  }

  /** act 后多策略兜底提取 selector（act 结果不暴露 selector 时） */
  private async fallbackSelector(page: Page, instruction: string): Promise<{ selector: string; action: 'click' | 'fill'; value?: string } | undefined> {
    // 策略 1：交互探针（点击/输入捕获，经 localStorage 跨导航存活）
    try {
      const raw = await page.evaluate<string | null>(() => {
        try { return localStorage.getItem('__verifyos_probe'); } catch { return null; }
      });
      if (raw) {
        const p = JSON.parse(raw) as { sel?: string; tag?: string; value?: string };
        if (p?.sel) return { selector: p.sel, action: p.tag === 'input' || p.tag === 'textarea' ? 'fill' : 'click', value: p.value || undefined };
      }
    } catch { /* ignore */ }

    // 策略 2：聚焦元素（按钮点击/输入后焦点仍在目标上）
    try {
      const info = await page.evaluate<{ sel: string; tag: string } | null>(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el === document.documentElement) return null;
        const esc = (s: string): string => {
          try { return (window as unknown as { CSS: { escape: (v: string) => string } }).CSS.escape(s); }
          catch { return s.replace(/[^\w-]/g, '\\$&'); }
        };
        const tag = el.tagName?.toLowerCase() ?? '';
        const id = el.id ?? '';
        const cls = typeof el.className === 'string' ? el.className.trim() : '';
        const name = (el as HTMLInputElement)?.name ?? '';
        let sel = '';
        if (id) sel = `#${esc(id)}`;
        else if ((tag === 'input' || tag === 'textarea' || tag === 'select') && name) sel = `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
        else if (cls) sel = `${tag}${cls.split(/\s+/).filter(Boolean).map((c) => `.${esc(c)}`).join('')}`;
        return sel ? { sel, tag } : null;
      });
      if (info?.sel) return { selector: info.sel, action: info.tag === 'input' || info.tag === 'textarea' ? 'fill' : 'click' };
    } catch { /* ignore */ }

    // 策略 3：instruction 文本反查（元素仍在当前页时）
    try {
      const text = this.instructionText(instruction);
      if (text) {
        const loc = page.getByText(text, { exact: false }).first();
        if ((await loc.count()) > 0) return { selector: `text=${text}`, action: 'click' };
      }
    } catch { /* ignore */ }

    return undefined;
  }

  async run(input: {
    runId: string;
    startUrl: string;
    steps: StepDef[];
    headless?: boolean;
    /** C2 证据采集：提供 store 则开启 trace + HAR + 每步截图（video 经 contextOptions 尽力而为） */
    evidenceStore?: EvidenceStore;
    /** 移动 Web 设备模拟（'iPhone 13' / 'Pixel 9 Pro' 等——Playwright 设备描述；Web 默认不传） */
    device?: string;
    /** T13：原生 App 触发 target（默认 'web-sim'；'android'/'ios' 走 Maestro/Appium 占位，不驱动 Stagehand） */
    target?: DeviceTarget;
    /** T13：原生 App 运行配置（target 为 native 时提供） */
    nativeApp?: NativeAppRunConfig;
    /** 编辑器试运行：只跑到该步骤下标（含）即收尾——编辑态单步/截断反馈，不走完整 Run */
    stopAfterStepIndex?: number;
    onEvent?: (e: RunEvent) => void;
  }): Promise<RunOutcome> {
    const { runId, startUrl, steps, headless = true } = input;
    const evidenceStore = input.evidenceStore;
    const evidenceKeys: string[] = [];
    const visitedUrls: string[] = [];
    const reachability: ReachabilityVerdict[] = [];
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifyos-ev-'));
    const events: RunEvent[] = [];
    const stepResults: StepResult[] = [];
    const emit = (e: RunEvent) => {
      events.push(e);
      input.onEvent?.(e);
    };
    const t0 = Date.now();
    this.llmCalls = 0;

    // T13：原生 App 触发短路——Maestro/Appium 未接入前，诚实地返回占位 outcome，
    // 不初始化 Stagehand、不驱动模拟器/真机。web-sim（含 device 参数）走下方既有链路。
    if (isNativeTarget(input.target)) {
      const platform = input.target;
      const msg = nativePlaceholderMessage(platform, input.nativeApp);
      // 事件协议 Platform 暂未扩展 android/ios，以 'mobile' 表达「原生移动」；native 平台语义见 nativeApp
      emit(ev.runStarted(runId, {
        applicationShortId: 'app_fixture',
        platform: 'mobile',
        environment: { url: nativeEnvironmentUrl(platform, input.nativeApp), isPreview: false },
      }));
      emit(ev.observation(runId, 'native_mobile', false, msg));
      emit(ev.runCompleted(runId, 'unknown', undefined, msg));
      return {
        verdict: 'unknown',
        events,
        failureSummary: msg,
        llmCalls: 0,
        cache: this.cache.stats(),
        stepResults: [],
        durationMs: Date.now() - t0,
        evidenceKeys: [],
        visitedUrls: [],
        reachability: [],
      };
    }

    const provider = createOpenAICompatible({ name: 'glm', apiKey: this.llm.apiKey, baseURL: this.llm.baseURL });
    const llmClient = new AISdkClient({ model: provider(this.llm.model) } as never);
    const sh = new Stagehand({
      env: 'LOCAL',
      llmClient,
      verbose: 0,
      // L4 集成补正：Stagehand 2.5.9 的 recordVideo 只从 localBrowserLaunchOptions 读取
      // （dist/index.js:24429），放 contextOptions 会被静默忽略——这就是此前无 .webm 的根因
      localBrowserLaunchOptions: { headless, recordVideo: { dir: tmpDir } },
      // 移动 Web：device 存在时叠加设备模拟（viewport/UA/触控——Playwright 设备描述经 contextOptions 透传）
      contextOptions: {
        ...(input.device ? deviceProfile(input.device) : {}),
      },
    } as never);
    await sh.init();
    const page = sh.page;
    const context = page.context();

    // U28：Console/页面异常实时采集（RUN LOG Console tab 数据源；无 evidenceStore 也收集，上限 100 条防爆内存）
    const consoleLines: string[] = [];
    page.on('console', (msg) => {
      if (consoleLines.length < 100) consoleLines.push(`[${msg.type()}] ${String(msg.text()).slice(0, 300)}`);
    });
    page.on('pageerror', (err) => {
      if (consoleLines.length < 100) consoleLines.push(`[pageerror] ${String(err?.message ?? err).slice(0, 300)}`);
    });

    if (evidenceStore) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      await context.routeFromHAR(path.join(tmpDir, 'run.har'), { update: true });
    }

    emit(ev.runStarted(runId, {
      applicationShortId: 'app_fixture',
      platform: 'web',
      environment: { url: startUrl, isPreview: false },
    }));

    let verdict: Verdict = 'pass';
    let failedStep: string | undefined;
    let failureSummary: string | undefined;

    try {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);
      visitedUrls.push(page.url()); // C3：起始页也计入触达路径

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        emit(ev.stepStarted(runId, step.id, i, step.title, step.kind));
        const st0 = Date.now();
        let stepVerdict: Verdict = 'pass';
        let stepLlm = 0;
        let hit = false;
        let failReason = '';

        try {
          if (step.goto) {
            await page.goto(step.goto, { waitUntil: 'domcontentloaded', timeout: 15000 });
            emit(ev.action(runId, step.id, 'browser', 'goto', { url: step.goto }));
          }

          for (const a of step.actions ?? []) {
            if (a.type === 'goto') {
              await page.goto(a.url!, { waitUntil: 'domcontentloaded', timeout: 15000 });
            } else if (a.type === 'fill') {
              await page.fill(a.selector!, a.value ?? '');
            } else if (a.type === 'click') {
              await page.click(a.selector!);
            }
            emit(ev.action(runId, step.id, 'browser', a.type, { selector: a.selector, value: a.value, url: a.url, llmCalls: 0 }));
          }

          // C3：触达路径采样（去重）
          {
            const u = page.url();
            if (!visitedUrls.includes(u)) visitedUrls.push(u);
          }

          if (step.kind === 'ai' && step.instruction) {
            const cached = this.cache.get(step.instruction);
            if (cached) {
              hit = true;
              if (cached.action === 'click') await page.click(cached.selector);
              else await page.fill(cached.selector, cached.value ?? '');
              emit(ev.action(runId, step.id, 'browser', 'replay', { selector: cached.selector, llmCalls: 0, cache: 'hit' }));
            } else if (step.selector) {
              // T16 固化：ai 步骤已带确定性 selector → 零 LLM 直接执行，并回写缓存
              hit = true;
              const scriptedAction = step.action ?? 'click';
              if (scriptedAction === 'click') await page.click(step.selector);
              else await page.fill(step.selector, step.value ?? '');
              this.cache.set(step.instruction, { selector: step.selector, action: scriptedAction, value: step.value });
              emit(ev.action(runId, step.id, 'browser', 'replay', { selector: step.selector, llmCalls: 0, cache: 'scripted' }));
            } else {
              stepLlm++;
              this.llmCalls++;
              emit(ev.thinking(runId, step.id, `执行指令：${step.instruction}（LLM 规划中）`));
              // T16：act 前注入交互探针（点击/输入捕获，跨导航存活），供 act 后兜底反查 selector
              await this.injectProbe(page).catch(() => undefined);
              const result = (await sh.page.act(step.instruction)) as unknown;
              emit(ev.action(runId, step.id, 'browser', 'act', { instruction: step.instruction, llmCalls: 1 }));
              // 多策略提取 selector 入缓存（拿不到则该指令保持 miss）
              const r = result as { action?: string | { selector?: string; value?: string }; selector?: string } | null;
              const rawSel = typeof r?.action === 'string' ? undefined : r?.action?.selector;
              let sel: string | undefined = rawSel ?? r?.selector ?? undefined;
              let action: 'click' | 'fill' = 'click';
              let value: string | undefined;
              if (!sel) {
                const fb = await this.fallbackSelector(page, step.instruction);
                if (fb) { sel = fb.selector; action = fb.action; value = fb.value; }
              }
              if (sel) {
                this.cache.set(step.instruction, { selector: sel, action, value });
                console.log(`[runner] selector 提取成功：「${step.instruction}」→ ${sel} (${action})`);
              } else {
                console.log(`[runner] selector 提取失败：「${step.instruction}」`);
              }
              {
                const u = page.url();
                if (!visitedUrls.includes(u)) visitedUrls.push(u);
              }
            }
          }

          if (step.assert) {
            const a = step.assert;
            if (a.kind === 'url_contains') {
              const url = page.url();
              if (!url.includes(a.value)) throw new Error(`URL 不含「${a.value}」，实际 ${url}`);
            } else if (a.kind === 'text_visible') {
              await page.waitForSelector(`text=${a.value}`, { timeout: 5000 });
            } else if (a.kind === 'element_visible') {
              await page.waitForSelector(a.value, { timeout: 5000, state: 'visible' });
            }
            emit(ev.observation(runId, step.id, true, `${a.kind} ✓ ${a.value}`, Date.now() - st0));
          }
        } catch (err) {
          stepVerdict = 'fail';
          failReason = err instanceof Error ? err.message : String(err);
          emit(ev.observation(runId, step.id, false, failReason, Date.now() - st0));
        }

        // C3：触达校验（防假绿）
        if (step.targetRef) {
          const check = verifyReachability({
            stepId: step.id,
            stepTitle: step.title,
            targetRef: step.targetRef,
            stepVerdict: stepVerdict,
            visitedUrls,
          });
          reachability.push(check);
          if (check.verdict === 'unknown') {
            stepVerdict = 'unknown';
            emit(ev.observation(runId, step.id, true, `⚠ ${check.explanation}`, Date.now() - st0));
          }
        }

        if (evidenceStore) {
          try {
            const shot = await page.screenshot({ fullPage: false });
            const key = evidenceKey(runId, 'screenshot', step.id, 'png');
            await evidenceStore.put(key, shot, 'image/png');
            evidenceKeys.push(key);
            emit(ev.evidence(runId, step.id, 'screenshot', key, { step: step.id }));
          } catch {
            /* 截图失败不阻塞 Run */
          }
        }
        emit(ev.stepCompleted(runId, step.id, stepVerdict, hit, Date.now() - st0, stepLlm));
        stepResults.push({ id: step.id, verdict: stepVerdict, llmCalls: stepLlm, cacheHit: hit, durationMs: Date.now() - st0 });

        if (stepVerdict === 'fail') {
          verdict = 'fail';
          failedStep = step.id;
          failureSummary = failReason;
          break; // 快速失败
        }
        if (stepVerdict === 'unknown') {
          failureSummary = reachability[reachability.length - 1]?.explanation;
        }
        // 编辑器试运行：跑到指定步骤（含）即收尾（正常走 finally 证据管道）
        if (input.stopAfterStepIndex !== undefined && i >= input.stopAfterStepIndex) {
          break;
        }
      }
    } catch (err) {
      verdict = 'fail';
      failureSummary = err instanceof Error ? err.message : String(err);
    } finally {
      if (evidenceStore) {
        try {
          const tracePath = path.join(tmpDir, 'trace.zip');
          await context.tracing.stop({ path: tracePath });
          const traceKey = evidenceKey(runId, 'trace', 'run', 'zip');
          await evidenceStore.put(traceKey, fs.readFileSync(tracePath), 'application/zip');
          evidenceKeys.push(traceKey);
          emit(ev.evidence(runId, 'run', 'trace', traceKey, { step: 'run' }));
        } catch { /* trace 失败不阻塞 */ }
      }
      await sh.close().catch(() => undefined);
      if (evidenceStore) {
        // HAR 与 video 由 context/browser 关闭时落盘（routeFromHAR update 在 close 时写入）
        const harFile = path.join(tmpDir, 'run.har');
        if (fs.existsSync(harFile)) {
          try {
            const harKey = evidenceKey(runId, 'network', 'run', 'har');
            await evidenceStore.put(harKey, fs.readFileSync(harFile), 'application/json');
            evidenceKeys.push(harKey);
            emit(ev.evidence(runId, 'run', 'network', harKey, { step: 'run' }));
          } catch { /* ignore */ }
        }
        // U28：Console 采集落盘（RUN LOG Console tab 数据源；空日志不落）
        if (consoleLines.length > 0 && evidenceStore) {
          try {
            const consoleKey = evidenceKey(runId, 'console', 'run', 'log');
            await evidenceStore.put(consoleKey, Buffer.from(consoleLines.join('\n'), 'utf8'), 'text/plain');
            evidenceKeys.push(consoleKey);
            emit(ev.evidence(runId, 'run', 'console', consoleKey, { step: 'run' }));
          } catch { /* console 落盘失败不阻塞 */ }
        }
        const videoDir = tmpDir;
        for (const v of fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'))) {
          try {
            const videoKey = evidenceKey(runId, 'video', 'run', 'webm');
            await evidenceStore.put(videoKey, fs.readFileSync(path.join(videoDir, v)), 'video/webm');
            evidenceKeys.push(videoKey);
            emit(ev.evidence(runId, 'run', 'video', videoKey, { step: 'run' }));
            break; // 单页 Run 取第一个视频
          } catch { /* ignore */ }
        }
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // C3：Run 级聚合（fail > unknown > pass）
    verdict = aggregateVerdicts(reachability, stepResults.map((r) => r.verdict));
    emit(ev.runCompleted(runId, verdict, undefined, failureSummary));
    return {
      verdict,
      events,
      failedStep,
      failureSummary,
      llmCalls: this.llmCalls,
      cache: this.cache.stats(),
      stepResults,
      durationMs: Date.now() - t0,
      evidenceKeys,
      visitedUrls,
      reachability,
    };
  }
}
