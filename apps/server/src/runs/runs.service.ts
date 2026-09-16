import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { RunRunner, serveStatic, LocalDiskStore, type EvidenceStore, type StepDef, type RunOutcome } from '@verifyos/agent-core';
import { ExploreService } from '../explore/explore.service';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ev, type RunEvent } from '@verifyos/shared';
import { FeishuNotifier } from '../connectors/feishu.notifier';

/** 演示步骤（对 fixture 站点）：module 确定性登录 → assertion → ai → assertion */
export const DEMO_STEPS: StepDef[] = [
  {
    id: 'st_01', title: '管理员登录', kind: 'module',
    actions: [
      { type: 'fill', selector: '#username', value: 'admin' },
      { type: 'fill', selector: '#password', value: 'test123' },
      { type: 'click', selector: 'button[type="submit"]' },
    ],
  },
  { id: 'st_02', title: '进入员工列表', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' } },
  { id: 'st_03', title: '打开关于页', kind: 'ai', instruction: '点击页面上的「关于我们」链接' },
  { id: 'st_04', title: '关于页可达', kind: 'assertion', assert: { kind: 'url_contains', value: 'about.html' } },
];

/**
 * RunsService（C1/C4 桥）：真实 Run 执行编排。
 * POST /api/runs 触发 → RunRunner 执行（Stagehand×glm-4.5v）→ 事件经 emitter 交给 Gateway 广播。
 */
@Injectable()
export class RunsService extends EventEmitter implements OnModuleInit {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
    private readonly feishu: FeishuNotifier,
  ) {
    super();
  }
  private runner: RunRunner | null = null;
  private fixtureUrl = '';
  private evidenceBaseDir = path.resolve(process.cwd(), '../../out/evidence');
  private evidenceStore: EvidenceStore | null = null;
  private readonly outcomes = new Map<string, RunOutcome>();
  /** U22：runId → 关联验证 short_id（执行页 chip 显示真关联并可跳编辑器） */
  private readonly runVer = new Map<string, string>();

  async onModuleInit(): Promise<void> {
    // fixture 站点（pnpm dev 的 cwd=apps/server；生产由 RUN_TARGET_URL 指定真实目标）
    const fixtureDir = process.env.FIXTURE_DIR ?? path.resolve(process.cwd(), '../../packages/agent-core/fixtures/site');
    const fixture = await serveStatic(fixtureDir);
    this.fixtureUrl = fixture.url;
    this.runner = new RunRunner({
      apiKey: process.env.LLM_API_KEY ?? '',
      baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
    });
    console.log(`[runs] fixture ready at ${this.fixtureUrl}`);
    // T16：从 locator_cache 表恢复定位缓存（跨重启命中，零 LLM 重放）
    try {
      await this.exploreSvc.ensureReady();
      const r = await this.exploreSvc.pg.query(
        `SELECT instruction, selector, action, value, hits FROM locator_cache`,
      );
      const entries = r.rows.map((row) => ({
        instruction: String(row.instruction),
        selector: String(row.selector),
        action: (row.action === 'fill' ? 'fill' : 'click') as 'click' | 'fill',
        value: row.value == null ? undefined : String(row.value),
        hits: Number(row.hits ?? 0),
      }));
      this.runner.cache.load(entries);
      console.log(`[runs] locator_cache 恢复 ${entries.length} 条`);
    } catch (err) {
      console.log('[runs] locator_cache 恢复跳过：', err instanceof Error ? err.message : err);
    }
  }

  async trigger(input: { startUrl?: string; steps?: StepDef[]; device?: string; verificationShortId?: string; trigger?: string }): Promise<{ runId: string }> {
    const runId = `run_${Date.now().toString(36)}`;
    const t0 = Date.now();
    if (input.verificationShortId) this.runVer.set(runId, input.verificationShortId);
    const startUrl = input.startUrl ?? `${this.fixtureUrl}/login.html`;
    const steps = await this.injectCredential(input.steps ?? DEMO_STEPS);
    const baseDir = path.resolve(process.cwd(), '../../out/evidence');
    const store = this.evidenceStore ?? (this.evidenceStore = new LocalDiskStore(baseDir));

    // 浏览器/LLM 初始化失败（onModuleInit 异常）时 runner 为 null —— 同样走异常闭环而不是同步抛 500
    const runner = this.runner;
    const exec: Promise<RunOutcome> = runner
      ? runner.run({
          runId,
          startUrl,
          steps,
          device: input.device,
          evidenceStore: store,
          onEvent: (e: RunEvent) => this.emit('run.event', e),
        })
      : Promise.reject(new Error('RunRunner 未初始化（浏览器/LLM 启动失败），Run 无法执行'));

    // 异步执行：HTTP 立即返回 runId，事件走 WS 实时推
    void exec
      .then(async (outcome) => {
        // J04 补偿：agent-core runner 外层 catch（runner.ts:314）捕获启动/导航崩溃后，
        // run 级聚合（runner.ts:352）用空 stepResults 把 fail 重新聚合为 pass。此处按
        // 「无步骤完成 + 有失败摘要」识别该情况并在落库/广播前回正 verdict，保证审计口径正确。
        const crashOverride = outcome.verdict === 'pass' && !!outcome.failureSummary && outcome.stepResults.length === 0;
        const verdict = crashOverride ? 'fail' : outcome.verdict;
        if (crashOverride) {
          outcome.verdict = 'fail';
          const last = outcome.events[outcome.events.length - 1];
          if (last && last.type === 'run.completed') (last as { verdict: string }).verdict = 'fail';
          this.emit('run.event', last); // 修正后的终态事件补发（前端以最后一条为准）
        }
        // 持久化：run 表落 PG（重启不丢）
        try {
          await this.exploreSvc.ensureReady();
          await this.exploreSvc.pg.query(
            `INSERT INTO run(short_id, target, trigger, verification_id, verdict, duration_ms, failure_summary, output, finished_at)
             VALUES ($1, $2::jsonb, $7, (SELECT id FROM verification WHERE short_id = $8 LIMIT 1), $3, $4, $5, $6::jsonb, now())`,
            [
              runId,
              JSON.stringify({ applicationShortId: 'app_demo', platform: 'web', environment: { url: startUrl, isPreview: false } }),
              verdict,
              outcome.durationMs,
              outcome.failureSummary ?? null,
              JSON.stringify({ llmCalls: outcome.llmCalls, cache: outcome.cache, stepCount: outcome.stepResults.length, device: input.device ?? null, evidenceKeys: outcome.evidenceKeys, visitedUrls: outcome.visitedUrls, reachability: outcome.reachability, events: outcome.events }),
              input.trigger ?? 'manual',
              input.verificationShortId ?? null,
            ],
          );
        } catch (err) {
          console.error('[runs] 落库失败（不影响 Run 结果）：', err instanceof Error ? err.message : err);
        }
        // T16：持久化定位缓存（跨重启命中）+ 固化 ai 步 selector 回 verification.steps（下次零 LLM）
        if (runner) {
          await this.persistLocatorCache(runner);
          if (input.verificationShortId) await this.solidifyVerification(input.verificationShortId, runner);
        }
        this.outcomes.set(runId, outcome);
        this.emit('run.done', {
          runId,
          verdict,
          llmCalls: outcome.llmCalls,
          cache: outcome.cache,
          durationMs: outcome.durationMs,
        });
        this.pushFeishu(runId, verdict, outcome.durationMs, outcome.failureSummary ?? null);
      })
      .catch(async (err: unknown) => {
        // J04 异常闭环：RunRunner 抛异常（浏览器/LLM 崩溃等）不再静默悬挂——
        // 合成终态 outcome 落内存 + 落库 + 广播 run.completed/run.done，保证 runId 任何路径都可 GET 且事件流有终态。
        // verdict 选 'fail'：异常是执行管线硬失败；'unknown' 在本代码库保留给「步骤通过但触达无法确认」的防假绿语义，不可混用。
        const message = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - t0;
        const verdict = 'fail' as const;
        const target = {
          applicationShortId: 'app_demo',
          platform: 'web' as const,
          environment: { url: startUrl, isPreview: false },
        };
        // events 里补终态事件（run.started 之后的 run.completed），供 events 回放端点/前端拿到终态
        const events: RunEvent[] = [
          ev.runStarted(runId, target),
          ev.runCompleted(runId, verdict, { error: message }, message),
        ];
        const outcome: RunOutcome = {
          verdict,
          events,
          failureSummary: message,
          llmCalls: 0,
          cache: { entries: 0, totalHits: 0 },
          stepResults: [],
          durationMs,
          evidenceKeys: [],
          visitedUrls: [],
          reachability: [],
        };
        this.outcomes.set(runId, outcome);
        try {
          await this.exploreSvc.ensureReady();
          await this.exploreSvc.pg.query(
            `INSERT INTO run(short_id, target, trigger, verification_id, verdict, duration_ms, failure_summary, output, finished_at)
             VALUES ($1, $2::jsonb, $7, (SELECT id FROM verification WHERE short_id = $8 LIMIT 1), $3, $4, $5, $6::jsonb, now())`,
            [
              runId,
              JSON.stringify({ applicationShortId: 'app_demo', platform: 'web', environment: { url: startUrl, isPreview: false } }),
              verdict,
              durationMs,
              message,
              JSON.stringify({ llmCalls: 0, cache: outcome.cache, stepCount: 0, device: input.device ?? null, evidenceKeys: [], visitedUrls: [], reachability: [], error: message, events }),
              input.trigger ?? 'manual',
              input.verificationShortId ?? null,
            ],
          );
        } catch (pgErr) {
          console.error('[runs] 异常 Run 落库失败：', pgErr instanceof Error ? pgErr.message : pgErr);
        }
        this.emit('run.event', events[1]); // run.completed（前端停止转圈的终态事件）
        this.emit('run.done', {
          runId,
          verdict,
          llmCalls: 0,
          cache: outcome.cache,
          durationMs,
        });
        this.pushFeishu(runId, verdict, durationMs, message);
      });

    return { runId };
  }

  /** 从凭据库取角色凭据注入登录步骤（fallback：默认演示凭据） */
  private async injectCredential(steps: StepDef[]): Promise<StepDef[]> {
    let username = 'admin';
    let password = 'test123';
    try {
      await this.exploreSvc.ensureReady();
      const r = await this.exploreSvc.pg.query(
        `SELECT payload_enc FROM credential WHERE role = '管理员' ORDER BY created_at DESC LIMIT 1`,
      );
      if (r.rows.length > 0) {
        const vals = JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc as string)) as { username?: string; password?: string };
        if (vals.username) username = vals.username;
        if (vals.password) password = vals.password;
      }
    } catch {
      // 凭据库不可达 → 用默认
    }
    return steps.map((s) => ({
      ...s,
      actions: s.actions?.map((a) => {
        if (a.type === 'fill' && a.selector === '#username') return { ...a, value: username };
        if (a.type === 'fill' && a.selector === '#password') return { ...a, value: password };
        return a;
      }),
    }));
  }

  /** T16：Run 完成后把 cache 条目 upsert 到 locator_cache 表（跨重启命中） */
  private async persistLocatorCache(runner: RunRunner): Promise<void> {
    try {
      await this.exploreSvc.ensureReady();
      const entries = runner.cache.entries();
      for (const e of entries) {
        await this.exploreSvc.pg.query(
          `INSERT INTO locator_cache(instruction, selector, action, value, hits, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (instruction) DO UPDATE SET selector = EXCLUDED.selector, action = EXCLUDED.action, value = EXCLUDED.value, hits = EXCLUDED.hits, updated_at = now()`,
          [e.instruction, e.selector, e.action, e.value ?? null, e.hits],
        );
      }
      if (entries.length > 0) console.log(`[runs] locator_cache 已持久化 ${entries.length} 条`);
    } catch (err) {
      console.log('[runs] locator_cache 持久化失败（不影响 Run 结果）：', err instanceof Error ? err.message : err);
    }
  }

  /** T16 固化：Run 完成后把提取到的 ai 步 selector 写回 verification.steps（下次跑零 LLM） */
  private async solidifyVerification(verificationShortId: string, runner: RunRunner): Promise<void> {
    try {
      await this.exploreSvc.ensureReady();
      const r = await this.exploreSvc.pg.query(
        `SELECT id, steps FROM verification WHERE short_id = $1 LIMIT 1`,
        [verificationShortId],
      );
      if (r.rows.length === 0) return;
      const steps = (r.rows[0].steps ?? []) as StepDef[];
      let changed = false;
      const next = steps.map((s) => {
        if (s.kind === 'ai' && s.instruction && !s.selector) {
          const e = runner.cache.peek(s.instruction);
          if (e?.selector) {
            changed = true;
            return { ...s, selector: e.selector, action: e.action, ...(e.value ? { value: e.value } : {}) };
          }
        }
        return s;
      });
      if (!changed) return;
      await this.exploreSvc.pg.query(
        `UPDATE verification SET steps = $2::jsonb, status = 'ready', updated_at = now() WHERE id = $1`,
        [r.rows[0].id, JSON.stringify(next)],
      );
      console.log(`[runs] 固化完成：verification ${verificationShortId} 已写回 ai 步 selector`);
    } catch (err) {
      console.log('[runs] 固化写回失败（不影响 Run 结果）：', err instanceof Error ? err.message : err);
    }
  }

  get(runId: string): RunOutcome | undefined {
    return this.outcomes.get(runId);
  }

  /** U22：某 Run 关联的验证 short_id（内存优先；落库后由 controller 走 PG 兜底） */
  getRunVer(runId: string): string | undefined {
    return this.runVer.get(runId);
  }

  /** T3：Run 完成后异步推飞书（失败不阻塞主流程，不 await） */
  private pushFeishu(runId: string, verdict: string, durationMs: number, failureSummary?: string | null): void {
    const base = (process.env.VERIFYOS_BASE_URL ?? '').replace(/\/+$/, '');
    const evidenceUrl = `${base}/api/runs/${runId}/evidence`;
    void this.feishu.notify({
      verdict,
      durationMs,
      failureSummary,
      projectName: '演示项目',
      runId,
      evidenceUrl,
    });
  }

  /**
   * 编辑器试运行（同步返回）：跑到 upto 下标（含）即收尾，不落 run 表、不广播 WS。
   * 返回截图/步骤结果 + ai 步提取到的定位候选（顺带已写入 LocatorCache，正式运行即可零 LLM 重放）。
   */
  async dryRun(input: { steps: StepDef[]; startUrl?: string; upto?: number }): Promise<{
    runId: string;
    verdict: string;
    durationMs: number;
    stepResults: Array<{ id: string; title?: string; verdict: string; durationMs: number; llmCalls: number; selector?: string }>;
    screenshots: string[];
    failureSummary?: string;
  }> {
    if (!this.runner) throw new Error('RunRunner 未初始化');
    const runId = `dry_${Date.now().toString(36)}`;
    const startUrl = input.startUrl ?? `${this.fixtureUrl}/login.html`;
    const store = this.evidenceStore ?? (this.evidenceStore = new LocalDiskStore(this.evidenceBaseDir));
    const outcome = await this.runner.run({
      runId,
      startUrl,
      steps: input.steps,
      evidenceStore: store,
      ...(input.upto !== undefined ? { stopAfterStepIndex: Math.max(0, input.upto) } : {}),
    });
    const steps = input.steps ?? [];
    const stepResults = outcome.stepResults.map((r, i) => {
      // ai 步定位候选：从共享 LocatorCache 读（试运行 act 成功即已写入，正式运行可零 LLM 重放）
      let selector: string | undefined;
      const src = steps[i];
      if (src?.kind === 'ai' && src.instruction) {
        selector = this.runner?.cache.get(src.instruction)?.selector;
      }
      return { ...r, title: src?.title, ...(selector ? { selector } : {}) };
    });
    return {
      runId,
      verdict: outcome.verdict,
      durationMs: outcome.durationMs,
      stepResults,
      screenshots: outcome.evidenceKeys.filter((k) => k.includes('screenshot')),
      ...(outcome.failureSummary ? { failureSummary: outcome.failureSummary } : {}),
    };
  }

  /** D3：当前 fixture 入口 URL（webhook stub 的 preview 目标） */
  get fixtureEntryUrl(): string {
    return `${this.fixtureUrl}/login.html`;
  }

  /** E2：全部已完成 Run（内存，供概览聚合） */
  all(): Array<{ runId: string; verdict: string; durationMs: number; llmCalls: number }> {
    return [...this.outcomes.entries()].map(([runId, o]) => ({
      runId, verdict: o.verdict, durationMs: o.durationMs, llmCalls: o.llmCalls,
    }));
  }

  /** 证据 key → 本地文件绝对路径（目录穿越防护）；无 store 时返回 null */
  evidencePath(key: string): string | null {
    if (!this.evidenceBaseDir) return null;
    const file = path.resolve(this.evidenceBaseDir, key);
    if (!file.startsWith(path.resolve(this.evidenceBaseDir) + path.sep)) return null;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
    return file;
  }

  /** J04：某 run 的证据列表（对照磁盘 out/evidence/<runId>/ 枚举）；目录不存在返回 null（用于区分「run 不存在」与「无证据」） */
  evidenceList(runId: string): Array<{ key: string; kind: string; bytes: number }> | null {
    if (!this.evidenceBaseDir) return null;
    const dir = path.resolve(this.evidenceBaseDir, runId);
    // 目录穿越防护：runId 只能是 baseDir 下的一级目录
    if (!dir.startsWith(path.resolve(this.evidenceBaseDir) + path.sep)) return null;
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
    const out: Array<{ key: string; kind: string; bytes: number }> = [];
    const kindOf = (name: string): string => {
      if (name.startsWith('screenshot') || name.endsWith('.png')) return 'screenshot';
      if (name.startsWith('trace') || name.endsWith('.zip')) return 'trace';
      if (name.startsWith('network') || name.endsWith('.har')) return 'har';
      if (name.endsWith('.webm')) return 'video';
      if (name.endsWith('.log') || name.endsWith('.txt')) return 'console';
      return 'file';
    };
    const walk = (d: string, prefix = '') => {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        if (fs.statSync(full).isDirectory()) walk(full, `${prefix}${f}/`);
        else out.push({ key: `${runId}/${prefix}${f}`, kind: kindOf(f), bytes: fs.statSync(full).size });
      }
    };
    walk(dir);
    return out;
  }
}
