import { type ApprovalManager } from './approval.js';

interface PgLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

// ---------- 类型 ----------

export type ToolPermission = 'auto' | 'ask' | 'forbidden';

export interface ToolContext {
  runId?: string;
  stepId?: string;
  pool?: PgLike;
  /** ask 批准后写操作的目标连接（与只读 pool 可不同账号） */
  writePool?: PgLike;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** 审计补充信息 */
  audit?: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  description: string;
  permission: ToolPermission;
  /** 执行体；ask 工具在批准后才被调用 */
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface AuditEntry {
  ts: string;
  tool: string;
  permission: ToolPermission;
  args: Record<string, unknown>;
  ok: boolean;
  /** auto=直接执行 ask=人工批准后执行 denied=被门控拒绝 */
  via: 'auto' | 'approval' | 'denied';
  durationMs: number;
  error?: string;
}

/**
 * ToolRegistry（E1）：统一工具接口 + 权限三档门控 + 全量审计。
 * PRD §8.4：Tool = { name, description, inputSchema, run, permission }；
 * LLM 侧转 function calling tools 参数，模型按任务自动选工具。
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  private auditLog: AuditEntry[] = [];

  constructor(private readonly approvals?: ApprovalManager) {}

  register(def: ToolDef): void {
    this.tools.set(def.name, def);
  }

  /** N 系：插件 onDispose 回滚用——移除工具（时间可组合性：卸载即撤回注册） */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  list(): Array<{ name: string; description: string; permission: ToolPermission }> {
    return [...this.tools.values()].map(({ name, description, permission }) => ({ name, description, permission }));
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  audit(): AuditEntry[] {
    return [...this.auditLog];
  }

  /** 审计持久化回调（server 侧可写 audit_log 表） */
  onAudit(cb: (entry: AuditEntry) => void): void {
    this.auditCb = cb;
  }
  private auditCb?: (entry: AuditEntry) => void;

  /**
   * 调用工具（权限门控）：
   * - auto：直接执行
   * - ask：经 ApprovalManager 弹卡，批准后执行；拒绝/超时 → 拒绝
   * - forbidden：直接拒绝
   */
  async invoke(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext = {},
  ): Promise<ToolResult> {
    const def = this.tools.get(name);
    const t0 = Date.now();
    const base: Omit<AuditEntry, 'ok' | 'via' | 'durationMs'> = {
      ts: new Date().toISOString(),
      tool: name,
      permission: def?.permission ?? 'forbidden',
      args,
    };

    if (!def) return this.finish(base, t0, false, 'denied', `未知工具 ${name}`);
    if (def.permission === 'forbidden') return this.finish(base, t0, false, 'denied', `工具 ${name} 被禁止（forbidden）`);

    if (def.permission === 'ask') {
      if (!this.approvals) return this.finish(base, t0, false, 'denied', 'ask 工具需要 ApprovalManager 但未配置');
      const res = await this.approvals.request({
        kind: `tool.${name}`,
        title: `工具调用需批准：${name}`,
        reason: def.description,
        fields: [],
        context: { runId: ctx.runId },
        timeoutMs: 10 * 60_000,
      });
      if (!res.approved) {
        return this.finish(base, t0, false, 'denied', `人工拒绝或超时（${(res as { reason?: string }).reason ?? 'rejected'}）`);
      }
    }

    try {
      const result = await def.run(args, ctx);
      return this.finish(base, t0, result.ok, def.permission === 'ask' ? 'approval' : 'auto', result.error, result.audit, result.data);
    } catch (err) {
      return this.finish(base, t0, false, def.permission === 'ask' ? 'approval' : 'auto', err instanceof Error ? err.message : String(err));
    }
  }

  private finish(
    base: Omit<AuditEntry, 'ok' | 'via' | 'durationMs'>,
    t0: number,
    ok: boolean,
    via: 'auto' | 'approval' | 'denied',
    error?: string,
    audit?: Record<string, unknown>,
    data?: unknown,
  ): ToolResult {
    const entry: AuditEntry = { ...base, ok, via, durationMs: Date.now() - t0, error };
    this.auditLog.push(entry);
    this.auditCb?.(entry);
    return { ok, data, error, audit: { ...audit, via, durationMs: entry.durationMs } };
  }
}

// ---------- 内置工具 ----------

/** db.query：只读。强制 SELECT 开头 + 自动补 LIMIT（auto 档，结果入证据链） */
export function makeDbQueryTool(): ToolDef {
  return {
    name: 'db.query',
    description: '数据库查询（只读账号 · 强制 LIMIT · 结果入证据链）',
    permission: 'auto',
    async run(args, ctx) {
      const sql = String(args.sql ?? '').trim();
      if (!/^select/i.test(sql)) return { ok: false, error: 'db.query 仅允许 SELECT（写操作走 db.exec 并需人工批准）' };
      const finalSql = /\blimit\b/i.test(sql) ? sql : `${sql.replace(/;$/, '')} LIMIT 100`;
      if (!ctx.pool) return { ok: false, error: '未配置只读连接（ctx.pool）' };
      const r = await ctx.pool.query(finalSql);
      return { ok: true, data: { rows: r.rows, sql: finalSql }, audit: { rowCount: r.rows.length } };
    },
  };
}

/** db.exec：写操作（ask 档——执行前必须人工批准） */
export function makeDbExecTool(): ToolDef {
  return {
    name: 'db.exec',
    description: '数据库写入（测试数据准备/清理）——执行前必须经 WAITING_FOR_APPROVAL 人工批准',
    permission: 'ask',
    async run(args, ctx) {
      const sql = String(args.sql ?? '').trim();
      if (!sql) return { ok: false, error: '缺少 sql' };
      if (/^select/i.test(sql)) return { ok: false, error: 'SELECT 请走 db.query（auto 档）' };
      if (!ctx.writePool && !ctx.pool) return { ok: false, error: '未配置写连接（ctx.writePool）' };
      const r = await (ctx.writePool ?? ctx.pool)!.query(sql);
      return { ok: true, data: { rowCount: r.rows.length }, audit: { sql } };
    },
  };
}

/** http：API 调用 / 接口断言（auto 档）——真 fetch + 超时 + 网络/5xx 重试 */
export function makeHttpTool(): ToolDef {
  return {
    name: 'http',
    description: 'HTTP API 调用 / 接口断言（超时 10s · body 截断 2000 · 网络/5xx 自动重试 2 次）',
    permission: 'auto',
    async run(args) {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'url 必须是 http(s)' };
      const method = String(args.method ?? 'GET').toUpperCase();

      const headers: Record<string, string> = { ...((args.headers as Record<string, string>) ?? {}) };
      let body: string | undefined;
      if (args.body !== undefined && args.body !== null) {
        if (typeof args.body === 'string') {
          body = args.body;
        } else {
          body = JSON.stringify(args.body);
          if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
            headers['content-type'] = 'application/json';
          }
        }
      }
      // GET/HEAD 不带 body（Node fetch 会拒绝）
      const sendBody = !['GET', 'HEAD'].includes(method) ? body : undefined;

      const attempt = async (): Promise<ToolResult> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        try {
          const res = await fetch(url, { method, headers, body: sendBody, signal: ctrl.signal });
          const text = await res.text();
          return { ok: res.ok, data: { status: res.status, body: text.slice(0, 2000) }, audit: { status: res.status, url } };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err), audit: { url } };
        } finally {
          clearTimeout(timer);
        }
      };

      // 网络错误 / 5xx 重试（最多 2 次，间隔 200ms）；4xx 与成功直接返回
      let last: ToolResult = { ok: false, error: 'http 请求失败', audit: { url } };
      for (let i = 0; i < 3; i++) {
        last = await attempt();
        const status = (last.data as { status?: number } | undefined)?.status;
        if (last.ok || (typeof status === 'number' && status < 500)) return last;
        if (i < 2) await new Promise((r) => setTimeout(r, 200));
      }
      return last;
    },
  };
}

/** browser：浏览器执行由 RunRunner 在验证步骤内联提供，registry 层无 Stagehand 实例——诚实标注不可独立调用 */
export function makeBrowserTool(): ToolDef {
  return {
    name: 'browser',
    description: '浏览器执行（act / observe / extract）——由 Run 执行引擎在验证步骤内联提供，本工具不独立执行',
    permission: 'auto',
    async run(args) {
      const action = String(args.action ?? 'act');
      return {
        ok: false,
        error: `browser.${action} 由 RunRunner 在验证步骤（kind: ai / deterministic）内联执行，registry 层无 Stagehand 实例，无法独立调用；请在验证步骤的 instruction / actions 中触发浏览器动作`,
        audit: { note: 'browser 能力由执行引擎内联提供（runner.ts）' },
      };
    },
  };
}

/** code.view：真调 GitLab API 读文件（token 来自 env GITLAB_TOKEN 或 args.token） */
export function makeCodeViewTool(): ToolDef {
  return {
    name: 'code.view',
    description: '代码查看（GitLab API · 按文件读取）——repo（group/project）/ path / ref',
    permission: 'auto',
    async run(args) {
      const repo = String(args.repo ?? '').trim();
      const filePath = String(args.path ?? '').trim();
      if (!repo) return { ok: false, error: '缺少 repo（如 group/project）' };
      if (!filePath) return { ok: false, error: '缺少 path（仓库内文件路径）' };
      const token = String(args.token ?? process.env.GITLAB_TOKEN ?? '').trim();
      if (!token) return { ok: false, error: '未配置 GITLAB_TOKEN（或 args.token）——无法调用 GitLab API' };
      const ref = String(args.ref ?? 'main').trim();
      const base = process.env.GITLAB_BASE_URL ?? 'https://gitlab.com/api/v4';
      const url = `${base}/projects/${encodeURIComponent(repo)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`;
      const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        return { ok: false, error: `GitLab 读取失败（HTTP ${res.status}）：${detail}`, audit: { status: res.status, url } };
      }
      const text = await res.text();
      return { ok: true, data: { path: filePath, ref, content: text.slice(0, 20000) }, audit: { repo, path: filePath, bytes: text.length } };
    },
  };
}

/** vision：真调视觉模型（默认 glm-4.5v）描述截图（ask 档——调用前需人工批准） */
export function makeVisionTool(): ToolDef {
  return {
    name: 'vision',
    description: '视觉模型描述截图（glm-4.5v · openai 兼容）——DOM 不可描述时兜底',
    permission: 'ask',
    async run(args) {
      const imageBase64 = String(args.imageBase64 ?? '').trim();
      const imageUrl = String(args.imageUrl ?? '').trim();
      if (!imageBase64 && !imageUrl) return { ok: false, error: '缺少 imageBase64 或 imageUrl' };
      const apiKey = process.env.LLM_API_KEY ?? '';
      if (!apiKey) return { ok: false, error: '未配置 LLM_API_KEY（vision 需要视觉模型）' };
      const baseURL = process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4';
      const model = process.env.LLM_MODEL ?? 'glm-4.5v';
      const prompt = String(args.prompt ?? '描述这张截图中的界面元素、状态与可交互控件');
      const img = imageBase64 ? `data:image/png;base64,${imageBase64}` : imageUrl;
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: img } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        return { ok: false, error: `视觉模型调用失败（HTTP ${res.status}）：${detail}`, audit: { status: res.status, model } };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? '';
      return { ok: true, data: { description: content.slice(0, 2000) }, audit: { model } };
    },
  };
}

/** evidence：证据采集由 RunRunner 内联完成，registry 层无 EvidenceStore——诚实标注不可独立调用 */
export function makeEvidenceTool(): ToolDef {
  return {
    name: 'evidence',
    description: '证据采集归档（截图 / trace / HAR / video）——由 RunRunner 在验证步骤内联完成，本工具不独立执行',
    permission: 'auto',
    async run() {
      return {
        ok: false,
        error: '证据采集由 RunRunner 内联完成（截图/trace/HAR/video/console，LocalDiskStore/MinIO）；registry 层无 EvidenceStore，无法独立调用',
        audit: { note: '证据由执行引擎内联采集（runner.ts + evidence.ts）' },
      };
    },
  };
}

/** report：报告与 MR 评论回写由服务层在 Run 结束后执行，registry 层无该上下文——诚实标注不可独立调用 */
export function makeReportTool(): ToolDef {
  return {
    name: 'report',
    description: '报告与 MR 评论回写——由服务层在 Run 结束后执行，本工具不独立执行',
    permission: 'auto',
    async run() {
      return {
        ok: false,
        error: '报告与 MR 评论回写由服务层在 Run 结束后执行（需 GitLab 写凭据 + MR 上下文），registry 层无该上下文，无法独立调用',
        audit: { note: '报告回写由服务层在 Run 结束后执行' },
      };
    },
  };
}

/** 注册全部 8 个内置工具（与原型插件屏一致） */
export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register(makeDbQueryTool());
  registry.register(makeDbExecTool());
  registry.register(makeHttpTool());
  registry.register(makeBrowserTool());
  registry.register(makeCodeViewTool());
  registry.register(makeVisionTool());
  registry.register(makeEvidenceTool());
  registry.register(makeReportTool());
}
