import { Injectable, OnModuleInit } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  Crawler, GraphStore, QaExtractor, QaPointStore,
  type CrawlResult, type QaCandidate,
} from '@verifyos/agent-core';

interface PgLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface ExploreInput {
  startUrl?: string;
  intent?: string;
  credential?: { username: string; password: string };
  applicationName?: string;
  /** G10: headful 人工接管模式（有头浏览器 + CDP 端口 9222） */
  headful?: boolean;
  /** G10: 探索参数——BFS 最大深度（默认 2） */
  maxDepth?: number;
  /** J03: 最大页数（默认 12；统一语义——maxActions 为旧别名，兼容保留） */
  maxPages?: number;
  /** @deprecated 旧别名，等价 maxPages（J03 契约修正） */
  maxActions?: number;
}

/** J03: 探索会话（并发隔离的最小实现——按会话分槽计数与控制标志） */
export interface ExploreSessionInfo {
  id: string;
  startUrl: string;
  startedAt: number;
  currentUrl: string;
  pageCount: number;
  actCount: number;
  maxPages: number;
  paused: boolean;
  stopped: boolean;
  finishedAt: number | null;
}

export interface ExploreEvent {
  phase: 'crawl' | 'login' | 'graph' | 'qa' | 'done' | 'error' | 'stopped' | 'warning';
  message: string;
  /** J03: 会话标识（exp_xxx，本次探索所有事件可归属） */
  explorationId?: string;
  /** J03: exploration 表数字主键（原 explorationId 数字语义迁移到此，向后兼容新增） */
  explorationRowId?: number;
  pages?: number;
  edges?: number;
  qaCount?: number;
  visitedUrls?: string[];
  /** J03: 空爬标记（0 页时 done payload 标 empty） */
  empty?: boolean;
  /** J03: stop 终态标记 */
  stopped?: boolean;
  /** F4: 页粒度结构化字段（探索工作台实时渲染） */
  currentUrl?: string;
  pageTitle?: string;
  depth?: number;
  interactive?: number;
  linkCount?: number;
  loginWall?: boolean;
  finding?: { level: 'red' | 'amber' | 'yellow'; title: string; detail: string };
  /** L5: 当前页截图 key（相对探索截图根目录，如 exp_abc123/003.png；前端经 /api/explore/shot?key= 取图） */
  shotKey?: string;
}

const DEMO_APP = { org: 'org_demo', project: 'prj_demo', app: 'app_demo', name: '演示 CRM' };

/** L5: 探索截图根目录（out/evidence/explore/<sessionId>/NNN.png；与 runs 证据同根，磁盘可回看） */
const SHOT_BASE_DIR = path.resolve(process.cwd(), '../../out/evidence/explore');

/** 问题库（001 之后增量表，IF NOT EXISTS 幂等） */
const CHAT_DDL = `
CREATE TABLE IF NOT EXISTS chat_message (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL DEFAULT 'default',
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  card jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_session ON chat_message(session_id, created_at);`;

/** 需求导入·忽略清单（F3：cross-check 过滤已忽略疑点，重启不丢） */
const IMPORT_IGNORE_DDL = `
CREATE TABLE IF NOT EXISTS import_ignore (
  id bigserial PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);`;

/** T9: 多项目 ↔ 多 repo/环境关联（运行期幂等建表；与 migrations/003 同构，供 pg-mem 与真 PG 懒初始化） */
const MULTI_PROJECT_DDL = `
CREATE TABLE IF NOT EXISTS project_repo (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES project(id),
  repo_url text NOT NULL,
  kind text NOT NULL DEFAULT 'gitlab' CHECK (kind IN ('gitlab','github')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, repo_url)
);
CREATE INDEX IF NOT EXISTS idx_project_repo_project ON project_repo(project_id);
CREATE INDEX IF NOT EXISTS idx_project_repo_url ON project_repo(repo_url);

CREATE TABLE IF NOT EXISTS project_environment (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES project(id),
  name text NOT NULL,
  url text NOT NULL DEFAULT '',
  is_production boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);
CREATE INDEX IF NOT EXISTS idx_project_environment_project ON project_environment(project_id);`;

/** 问题库（001 之后增量表，IF NOT EXISTS 幂等） */
const ISSUE_DDL = `
CREATE TABLE IF NOT EXISTS issue (
  id bigserial PRIMARY KEY,
  short_id text NOT NULL UNIQUE,
  application_id bigint NOT NULL REFERENCES application(id),
  title text NOT NULL,
  severity text CHECK (severity IN ('high','medium','low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  source jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);`;

/**
 * 一键探索闭环（把 B 系引擎接到产品 API）：
 * Crawler（撞墙→凭据/弹卡）→ Coverage Graph 落 PG → LLM QA 点候选落库。
 * 首次调用自动 ensureSchema（幂等迁移）+ 种子 org/project/application。
 */
@Injectable()
export class ExploreService extends EventEmitter implements OnModuleInit {
  /** 活动连接：真实 PG 可达 → 真库；否则降级 pg-mem（内存，重启清空） */
  private activePool: PgLike | null = null;
  private poolKind: 'pg' | 'mem' = 'mem';

  constructor() {
    super();
  }

  /** 活动池（controller 存取数据统一走这里） */
  get pg(): PgLike {
    if (!this.activePool) throw new Error('pool 未初始化');
    return this.activePool;
  }

  get kind(): 'pg' | 'mem' {
    return this.poolKind;
  }

  private async ensurePool(): Promise<void> {
    // 已在真库 → 探活（PG 容器抖动后旧连接失效，探活失败则重建/降级，不再连续 ECONNREFUSED）
    if (this.activePool && this.poolKind === 'pg') {
      try {
        await this.activePool.query('SELECT 1');
        return;
      } catch (err) {
        console.log('[explore] ⚠️ 真库连接失效，尝试重建：', err instanceof Error ? err.message.slice(0, 60) : err);
        try { await (this.activePool as { end?: () => Promise<void> }).end?.(); } catch { /* ignore */ }
        this.activePool = null;
        this.poolKind = 'mem';
      }
    }
    const url = process.env.DATABASE_URL;
    if (url) {
      try {
        const { Pool } = await import('pg');
        const real = new Pool({ connectionString: url.replace('@localhost:', '@127.0.0.1:'), connectionTimeoutMillis: 2500 });
        real.on('error', (err: Error) => console.error('[explore] pool idle client error (ignored):', err.message));
        await real.query('SELECT 1');
        this.activePool = real as unknown as PgLike;
        this.poolKind = 'pg';
        console.log('[explore] ✅ 已升级到真实 PostgreSQL');
        return;
      } catch (err) {
        console.log('[explore] ⏳ 真库不可达，继续 mem：', err instanceof Error ? err.message.slice(0, 80) : err);
      }
    }
    if (this.activePool) return; // mem 兜底已建
    const { newDb } = await import('pg-mem');
    // noAstCoverageCheck：行内约束 AST 检查在 3.0.14 对多语句误报 Not supported
    const mem = newDb({ noAstCoverageCheck: true } as never);
    this.activePool = new (mem.adapters.createPg().Pool)() as unknown as PgLike;
    this.poolKind = 'mem';
  }

  private llm() {
    return {
      apiKey: process.env.LLM_API_KEY ?? '',
      baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
    };
  }

  async onModuleInit(): Promise<void> {
    // 懒初始化：首个请求前完成（避免阻塞启动）
  }

  /** 幂等建表 + 种子；GET 端点也可安全调用 */
  async ensureReady(): Promise<number> {
    await this.ensurePool();
    return this.ensureSchemaAndSeed();
  }

  private async ensureSchemaAndSeed(): Promise<number> {
    const sqlPath = path.resolve(process.cwd(), 'migrations/001_init.sql');
    if (fs.existsSync(sqlPath)) {
      let sql = fs.readFileSync(sqlPath, 'utf8');
      // 通用降级：剥离 CREATE EXTENSION；vector(1024)→text
      // （B4 v1 无向量查询，pgvector 检索为 Phase 后续——升级路径：装扩展后 ALTER 列类型）
      sql = sql
        .split('\n')
        .filter((l) => !/^\s*CREATE EXTENSION/i.test(l))
        .join('\n')
        .replace(/vector\(1024\)/g, 'text');
      if (this.poolKind === 'mem') {
        // pg-mem 在 autocommit 下对整文件多语句做 AST 检查误报 Not supported；事务包裹可过
        await this.pg.query('BEGIN');
        await this.pg.query(sql);
        await this.pg.query(CHAT_DDL);
        await this.pg.query(ISSUE_DDL);
        await this.pg.query(IMPORT_IGNORE_DDL);
        await this.pg.query(MULTI_PROJECT_DDL);
        await this.pg.query('COMMIT');
      } else {
        await this.pg.query(sql + CHAT_DDL + ISSUE_DDL + IMPORT_IGNORE_DDL + MULTI_PROJECT_DDL); // 真实 PG 支持多语句；全部 IF NOT EXISTS 幂等
      }
    }
    // 种子数据（幂等）
    const org = await this.pg.query(`SELECT id FROM organization WHERE short_id = $1`, [DEMO_APP.org]);
    if (org.rows.length === 0) {
      await this.pg.query(`INSERT INTO organization(short_id, name) VALUES($1, $2)`, [DEMO_APP.org, '演示组织']);
    }
    const prj = await this.pg.query(`SELECT id FROM project WHERE short_id = $1`, [DEMO_APP.project]);
    if (prj.rows.length === 0) {
      await this.pg.query(`INSERT INTO project(short_id, org_id, name) VALUES($1, 1, $2)`, [DEMO_APP.project, '演示项目']);
    }
    const app = await this.pg.query(`SELECT id FROM application WHERE short_id = $1`, [DEMO_APP.app]);
    if (app.rows.length === 0) {
      await this.pg.query(
        `INSERT INTO application(short_id, project_id, name, type) VALUES($1, 1, $2, 'web')`,
        [DEMO_APP.app, DEMO_APP.name],
      );
    }
    const appId = await this.pg.query(`SELECT id FROM application WHERE short_id = $1`, [DEMO_APP.app]);
    return appId.rows[0].id as number;
  }

  // ---- F4/J03: 人工接管控制状态——J03 改为按会话分槽（并发探索互不覆盖） ----
  /** J03: 全部会话（含已结束的，供 control?explorationId=xxx 补看；finished 会话定期清理） */
  private sessionMap = new Map<string, {
    info: ExploreSessionInfo;
    /** J03-9: 事件环形缓冲（最近 200 条，断线补看用） */
    events: ExploreEvent[];
    /** J03: 会话事件通道（explore() 启动时注入，stop() 借此发终态事件） */
    notify?: (e: ExploreEvent) => void;
    /** J03: stopped 终态事件只发一次 */
    stopNotified?: boolean;
    /** L5: 该会话最新截图 key（轮询 control 时供前端补帧） */
    lastShotKey?: string;
  }>();
  /** G10: headful 接管 CDP 接入点（本次探索为 headful 时有值） */
  private _cdpEndpoint: string | null = null;

  /** 活动中的会话（finishedAt 为空） */
  private runningSessions(): Array<{ info: ExploreSessionInfo; events: ExploreEvent[]; notify?: (e: ExploreEvent) => void; stopNotified?: boolean; lastShotKey?: string }> {
    return [...this.sessionMap.values()].filter((s) => s.info.finishedAt === null);
  }

  /** J03-7: 空闲态守卫辅助——活动会话数（0 表示无探索在跑） */
  get runningCount(): number {
    return this.runningSessions().length;
  }

  /**
   * J03: 停止探索。带 explorationId 定向停单会话；不带则停所有活动会话（旧全局语义兼容）。
   * 置位后：爬取阶段由 crawler isStopped 退出；QA/落库阶段由 explore() 内二次检查跳过/丢弃。
   * 同时立即发 stopped 终态事件（不等 LLM 返回——满足"3s 内终态"验收）。
   * 返回实际置位的会话数（0 = 无活动探索，controller 据此返回 400）。
   */
  stop(explorationId?: string): number {
    const targets = this.resolveTargets(explorationId);
    for (const s of targets) {
      s.info.stopped = true;
      s.info.paused = false;
      if (!s.stopNotified) {
        s.stopNotified = true;
        // stopped 终态事件经会话通道发出（notify 负责盖章 + 写环形缓冲）
        s.notify?.({
          phase: 'stopped', stopped: true,
          message: `已停止——已爬 ${s.info.pageCount} 页已落库，QA 提取已跳过`,
        });
      }
    }
    return targets.length;
  }

  /** J03: 暂停/恢复。定向语义同 stop；返回实际生效会话数。 */
  setPaused(on: boolean, explorationId?: string): number {
    const targets = this.resolveTargets(explorationId);
    for (const s of targets) s.info.paused = on;
    return targets.length;
  }

  private resolveTargets(explorationId?: string): Array<{ info: ExploreSessionInfo; events: ExploreEvent[]; notify?: (e: ExploreEvent) => void; stopNotified?: boolean; lastShotKey?: string }> {
    if (explorationId) {
      const s = this.sessionMap.get(explorationId);
      return s && s.info.finishedAt === null ? [s] : [];
    }
    return this.runningSessions();
  }

  /** J03: 新探索开始时清理过期会话（结束超 30 分钟或超出保留数） */
  private pruneSessions(): void {
    const CUT = 30 * 60 * 1000;
    const now = Date.now();
    for (const [id, s] of this.sessionMap) {
      if (s.info.finishedAt !== null && now - s.info.finishedAt > CUT) this.sessionMap.delete(id);
    }
    const finished = [...this.sessionMap.entries()].filter(([, s]) => s.info.finishedAt !== null);
    for (const [id] of finished.slice(0, Math.max(0, finished.length - 20))) this.sessionMap.delete(id);
  }

  /** G10: 当前探索的 CDP 接入端点（headless 运行返回 null——诚实暴露） */
  cdpEndpoint(): string | null {
    return this._cdpEndpoint;
  }

  /** L5: 截图 key → 磁盘绝对路径（防目录穿越，参照 runs evidencePath；不存在/非法返回 null） */
  shotPath(key: string): string | null {
    if (!key) return null;
    const file = path.resolve(SHOT_BASE_DIR, key);
    if (!file.startsWith(path.resolve(SHOT_BASE_DIR) + path.sep)) return null;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    return file;
  }

  /**
   * J03: 控制状态——按会话分槽（sessions/runningCount/runningSessions 为新契约），
   * running/currentUrl/pageCount/actCount 等旧单值字段保留（取最新活动会话，空闲时归零不复位残留）。
   * Query 参数（explorationId/since）由 controller 传入用于断线补看。
   */
  controlState(query?: { explorationId?: string; since?: number }) {
    const running = this.runningSessions();
    // J03-7: 旧单值字段只从活动会话派生——空闲时全部归零（stopped/paused 不残留）
    const latest = running.length > 0 ? running[running.length - 1].info : undefined;

    // J03-9: 指定会话 + since 游标 → 返回该会话 after-since 的事件（断线补看）
    if (query?.explorationId) {
      const s = this.sessionMap.get(query.explorationId);
      if (!s) return { found: false as const, events: [] as ExploreEvent[], since: 0 };
      const since = Math.max(0, Math.min(query.since ?? 0, s.events.length));
      return {
        found: true as const,
        running: s.info.finishedAt === null,
        session: s.info,
        since: s.events.length,
        events: s.events.slice(since),
      };
    }

    return {
      // 旧单值字段（兼容：当前最新活动会话的值；空闲归零）
      running: running.length > 0,
      paused: latest?.paused ?? false,
      stopped: latest?.stopped ?? false,
      currentUrl: latest?.currentUrl ?? '',
      pageCount: latest?.pageCount ?? 0,
      actCount: latest?.actCount ?? 0,
      cdpEndpoint: this._cdpEndpoint,
      // L5: 最新截图 key（WS 断帧时前端 3s 轮询此字段补帧）
      latestShotKey: running.length > 0 ? (this.runningSessions()[running.length - 1].lastShotKey ?? null) : null,
      // J03 新契约：并发隔离
      runningCount: running.length,
      sessions: running.map((s) => s.info),
    };
  }

  async explore(input: ExploreInput, onEvent: (e: ExploreEvent) => void): Promise<ExploreEvent> {
    await this.ensurePool();
    const applicationId = await this.ensureSchemaAndSeed();
    const startUrl = input.startUrl ?? `${process.env.EXPLORE_TARGET_URL ?? 'https://qa.tech'}`;
    // J03: maxPages 统一语义（maxActions 旧别名兼容）
    const maxPages = input.maxPages ?? input.maxActions ?? 12;

    // J03-1/3/6: 会话创建——exp_xxx 标识贯穿事件与 control 分槽；计数器按会话从零计
    this.pruneSessions();
    const sessionId = `exp_${Math.random().toString(36).slice(2, 8)}`;
    const session: ExploreSessionInfo = {
      id: sessionId, startUrl, startedAt: Date.now(), currentUrl: startUrl,
      pageCount: 0, actCount: 0, maxPages, paused: false, stopped: false, finishedAt: null,
    };
    const slot: { info: ExploreSessionInfo; events: ExploreEvent[]; notify?: (e: ExploreEvent) => void; stopNotified?: boolean; lastShotKey?: string } = { info: session, events: [] as ExploreEvent[] };
    this.sessionMap.set(sessionId, slot);
    this._cdpEndpoint = null; // G10: CDP 端点按本次探索实际模式重置

    // J03-1: 事件包装——统一盖 explorationId 章 + 写入环形缓冲（断线补看）；返回盖章后的事件
    const emit = (e: ExploreEvent): ExploreEvent => {
      const stamped = { explorationId: sessionId, ...e };
      slot.events.push(stamped);
      if (slot.events.length > 200) slot.events.splice(0, slot.events.length - 200);
      if (stamped.shotKey) slot.lastShotKey = stamped.shotKey; // L5: 记最新截图 key
      onEvent(stamped);
      return stamped;
    };
    // J03-2: stop() 借同一通道发 stopped 终态（保证不经 LLM 等待、立即到达）
    slot.notify = (e) => { const stamped = { explorationId: sessionId, ...e }; slot.events.push(stamped); onEvent(stamped); };

    try {
      emit({ phase: 'crawl', message: `开始探索 ${startUrl}`, currentUrl: startUrl });
      const crawler = new Crawler();
      const result: CrawlResult = await crawler.crawl({
        startUrl,
        maxDepth: input.maxDepth ?? 2,
        maxPages,
        headful: input.headful, // G10: headful 接管模式透传
        intent: input.intent,
        credential: input.credential,
        llm: this.llm(),
        shotDir: path.join(SHOT_BASE_DIR, sessionId), // L5: 每页截图（探索实时浏览舞台数据源）
        // F4: 增量事件（页粒度）+ 人工接管控制（J03: 按会话读写，多探索互不干扰）
        onProgress: (p) => {
          // G10: 每页循环时同步 crawler 的 CDP 接入点（headful launch 后有值）
          this._cdpEndpoint = crawler.cdpEndpoint();
          if (p.kind === 'page') {
            session.currentUrl = p.url;
            session.pageCount += 1;
            session.actCount += p.interactive;
            emit({
              phase: 'crawl',
              message: `[页] ${p.title || p.url}（深度 ${p.depth} · ${p.interactive} 交互 · ${p.links} 链接）`,
              currentUrl: p.url, pageTitle: p.title, depth: p.depth, interactive: p.interactive, linkCount: p.links, loginWall: p.loginWall,
              ...(p.shotKey ? { shotKey: p.shotKey } : {}),
              ...(p.loginWall ? { finding: { level: 'amber' as const, title: '登录墙', detail: `${p.url} 存在密码表单——Agent 将尝试用凭据登录（无凭据时会向你要）` } } : {}),
            });
            // F4-LF: Live Findings 多类型——HTTP 错误（red）/ 慢响应（amber）/ JS 控制台错误（amber）
            if (p.status != null && p.status >= 400) {
              emit({
                phase: 'crawl',
                message: `[发现] ${p.url} 返回 HTTP ${p.status}`,
                currentUrl: p.url,
                finding: { level: 'red' as const, title: `HTTP ${p.status}`, detail: `${p.title || p.url}（${p.url}）返回 HTTP ${p.status}——页面可能已失效、被权限拦截或路由损坏，是 Agent 视角的真实故障信号。` },
              });
            }
            if ((p.loadMs ?? 0) > 2500) {
              emit({
                phase: 'crawl',
                message: `[发现] ${p.url} 加载 ${((p.loadMs ?? 0) / 1000).toFixed(1)}s`,
                currentUrl: p.url,
                finding: { level: 'amber' as const, title: '慢响应', detail: `${p.title || p.url}（${p.url}）加载耗时 ${((p.loadMs ?? 0) / 1000).toFixed(1)}s（阈值 2.5s）——可能存在性能退化，建议关注首屏资源与接口耗时。` },
              });
            }
            if ((p.consoleErrors ?? 0) > 0) {
              emit({
                phase: 'crawl',
                message: `[发现] ${p.url} 出现 ${p.consoleErrors} 条 JS 错误`,
                currentUrl: p.url,
                finding: { level: 'amber' as const, title: 'JS 控制台错误', detail: `${p.title || p.url}（${p.url}）渲染期间捕获 ${p.consoleErrors} 条 console error / 未捕获异常——前端运行时不健康，可能影响用户路径。` },
              });
            }
          } else if (p.kind === 'shot') {
            // L5: 暂停（人工接管）期间实时画面——只更新截图流，不刷 activity（前端按无 currentUrl 判定静默）
            emit({ phase: 'crawl', message: '[接管] 实时画面更新', shotKey: p.shotKey });
          } else if (p.kind === 'takeover') {
            // F4-deep: 人工接管恢复——人访问的页面已并入探索队列
            emit({
              phase: 'crawl',
              message: `[接管] 人工访问 ${p.urls.length} 个页面已并入探索队列：${p.urls.map((u) => u.replace(/^https?:\/\//, '').slice(0, 40)).join('、')}`,
              currentUrl: p.urls[0] ?? session.currentUrl,
            });
          } else {
            emit({ phase: 'login', message: `[登录] ${p.message}`, currentUrl: session.currentUrl });
          }
        },
        control: { isPaused: () => session.paused, isStopped: () => session.stopped },
      });

      const stoppedNote = session.stopped ? '（人工停止——已爬部分照常落库）' : '';
      emit({
        phase: 'login', message: `爬取完成：${result.pages.length} 页 · 认证=${result.authenticated}${stoppedNote}`,
        pages: result.pages.length, edges: result.edges.length,
      });

      // 落探索记录（exploration 表；short_id 用会话 id——事件标识与库记录可互查）
      const expl = await this.pg.query(
        `INSERT INTO exploration(short_id, application_id, status, intent, start_url, max_depth, max_actions, finished_at)
         VALUES ($1, $2, 'complete', $3, $4, $5, $6, now()) RETURNING id`,
        [sessionId, applicationId, input.intent ?? null, startUrl, input.maxDepth ?? 2, maxPages],
      );
      const explorationRowId = expl.rows[0].id as number;

      emit({ phase: 'graph', message: 'Coverage Graph 落库…', explorationRowId });
      const store = new GraphStore(this.pg);
      const saved = await store.saveCrawlGraph({
        applicationId, result, intent: input.intent, explorationId: explorationRowId,
      });

      // J03-2/4: QA 提取守卫——stop 置位或 0 页空爬都跳过 LLM 提取与落库（不再产出幻觉 QA）
      const isEmpty = result.pages.length === 0;
      if (isEmpty) {
        emit({ phase: 'warning', message: '未爬到任何页面——请检查 startUrl 可达性' });
      }

      let qaCount = 0;
      if (!session.stopped && !isEmpty) {
        emit({ phase: 'qa', message: 'LLM 提取 QA 点候选…', explorationRowId });
        const graph = await store.loadGraph(applicationId);
        try {
          const extractor = new QaExtractor(this.llm());
          const candidates: QaCandidate[] = await extractor.extract({
            applicationName: DEMO_APP.name,
            intent: input.intent ?? '',
            nodes: graph.nodes,
            edges: graph.edges,
            maxCandidates: 6,
          });
          // J03-2: 提取期间收到 stop → 丢弃候选（qaPoints 不再增长）
          if (session.stopped) {
            emit({ phase: 'qa', message: '提取完成但已停止——候选已丢弃，未落库', explorationRowId });
          } else {
            // J03-5: 候选去重——批内按 title trim 精确去重 + 与库内既有 discovered 候选同 path+title 去重
            const deduped = await this.dedupeCandidates(applicationId, candidates);
            if (deduped.length < candidates.length) {
              emit({ phase: 'qa', message: `候选去重：${candidates.length} → ${deduped.length} 条`, explorationRowId });
            }
            if (deduped.length > 0) {
              const qaStore = new QaPointStore(this.pg);
              const ids = await qaStore.saveCandidates(applicationId, deduped, explorationRowId);
              qaCount = ids.length;
            }
          }
        } catch (err) {
          emit({ phase: 'qa', message: `QA 提取失败（不阻塞）：${err instanceof Error ? err.message : String(err)}`, explorationRowId });
        }
      }

      const done: ExploreEvent = {
        phase: 'done',
        message: `探索完成：${saved.nodes} 节点 · ${saved.edges} 边 · ${qaCount} 条 QA 点候选${stoppedNote}`,
        explorationRowId, pages: saved.nodes, edges: saved.edges, qaCount,
        visitedUrls: result.pages.map((p) => p.url),
        ...(isEmpty ? { empty: true } : {}),
        ...(session.stopped ? { stopped: true } : {}),
      };
      return emit(done);
    } catch (err) {
      return emit({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      // J03-3/7: 生命周期终态——会话标记结束（runningCount 归零、旧字段无残留）
      session.finishedAt = Date.now();
    }
  }

  /** J03-5: QA 候选去重——批内 title trim 精确去重；与库内 discovered 候选按 path+title 去重（对齐 from-finding 精确匹配语义） */
  private async dedupeCandidates(applicationId: number, candidates: QaCandidate[]): Promise<QaCandidate[]> {
    const existing = await this.pg.query(
      `SELECT title, source->>'sourceUrl' AS path FROM qa_point
       WHERE application_id = $1 AND status = 'discovered'`,
      [applicationId],
    );
    const seen = new Set(existing.rows.map((r) => `${String(r.path ?? '').trim()}|${String(r.title ?? '').trim()}`));
    const out: QaCandidate[] = [];
    const batchTitles = new Set<string>();
    for (const c of candidates) {
      const title = c.title.trim();
      if (batchTitles.has(title)) continue; // 批内 title 精确去重
      batchTitles.add(title);
      const key = `${(c.sourceUrl ?? '').trim()}|${title}`;
      if (seen.has(key)) continue; // 与库内 discovered 同 path+title 去重
      seen.add(key);
      out.push(c);
    }
    return out;
  }
}
