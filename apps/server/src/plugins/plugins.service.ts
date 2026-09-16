import { Injectable, OnModuleInit } from '@nestjs/common';
import { ExploreService } from '../explore/explore.service';

/**
 * L7：插件注册表（「Everything is a Plugin」——Cordis 插件框架理念）。
 * 把 ToolRegistry 8 内置工具 + 3 MCP 连接器统一为「插件」视图，并支持用户自建 custom 插件。
 * 表 plugin（IF NOT EXISTS 幂等 DDL）；内置/mcp 行种子 ON CONFLICT DO NOTHING。
 */

export type PluginKind = 'builtin' | 'mcp' | 'custom';
export type PluginStatus = 'enabled' | 'disabled' | 'draft';
export type PluginPermission = 'auto' | 'ask' | 'forbidden';

export interface PluginManifest {
  name: string;
  version: string;
  kind: PluginKind;
  description: string;
  tools: Array<{ name: string; description: string; permission: PluginPermission }>;
  config: Record<string, unknown>;
}

export interface PluginRow {
  id: number;
  short_id: string;
  name: string;
  version: string;
  kind: PluginKind;
  description: string | null;
  status: PluginStatus;
  manifest: PluginManifest | null;
  config_schema: Record<string, unknown> | null;
  permission: PluginPermission;
  source: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const PLUGIN_DDL = `
CREATE TABLE IF NOT EXISTS plugin (
  id bigserial PRIMARY KEY,
  short_id text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL DEFAULT '0.0.0',
  kind text NOT NULL CHECK (kind IN ('builtin','mcp','custom')),
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('enabled','disabled','draft')),
  manifest jsonb,
  config_schema jsonb,
  permission text NOT NULL DEFAULT 'ask' CHECK (permission IN ('auto','ask','forbidden')),
  source jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

interface SeedSpec {
  shortId: string;
  name: string;
  version: string;
  kind: PluginKind;
  description: string;
  status: PluginStatus;
  permission: PluginPermission;
  tools: Array<{ name: string; description: string; permission: PluginPermission }>;
  config: Record<string, unknown>;
  source: Record<string, unknown>;
}

/** 8 内置工具（与 ToolRegistry registerBuiltinTools 一致）+ 3 MCP 连接器 */
const SEEDS: SeedSpec[] = [
  {
    shortId: 'plg_db_query', name: 'db.query', version: '1.0.0', kind: 'builtin',
    description: '数据库查询（只读账号 · 强制 LIMIT · 结果入证据链）', status: 'enabled', permission: 'auto',
    tools: [{ name: 'db.query', description: '只读 SELECT（强制 LIMIT 100）', permission: 'auto' }],
    config: { maxRows: 100, readOnlyUser: true }, source: { origin: 'agent-core/registry.ts' },
  },
  {
    shortId: 'plg_db_exec', name: 'db.exec', version: '1.0.0', kind: 'builtin',
    description: '数据库写入（测试数据准备/清理）——执行前必须经 WAITING_FOR_APPROVAL 人工批准', status: 'enabled', permission: 'ask',
    tools: [{ name: 'db.exec', description: '非 SELECT 写操作（批准后执行）', permission: 'ask' }],
    config: { writePool: 'approval-gated' }, source: { origin: 'agent-core/registry.ts' },
  },
  {
    shortId: 'plg_http', name: 'http', version: '1.0.0', kind: 'builtin',
    description: 'HTTP API 调用 / 接口断言', status: 'enabled', permission: 'auto',
    tools: [{ name: 'http', description: 'fetch 封装（status + body 截断）', permission: 'auto' }],
    config: { timeoutMs: 15000 }, source: { origin: 'agent-core/registry.ts' },
  },
  {
    shortId: 'plg_browser', name: 'browser', version: '1.0.0', kind: 'builtin',
    description: 'Stagehand act / observe / extract（Web 执行主路 · 缓存 + 自愈）', status: 'enabled', permission: 'auto',
    tools: [{ name: 'browser', description: 'Stagehand act/observe/extract', permission: 'auto' }],
    config: { engine: 'stagehand' }, source: { origin: 'agent-core/registry.ts（占位）' },
  },
  {
    shortId: 'plg_code_view', name: 'code.view', version: '1.0.0', kind: 'builtin',
    description: '代码查看（GitLab API · 按文件/行号定位）', status: 'enabled', permission: 'auto',
    tools: [{ name: 'code.view', description: 'GitLab API 按文件/行号读取', permission: 'auto' }],
    config: {}, source: { origin: 'agent-core/registry.ts（占位）' },
  },
  {
    shortId: 'plg_vision', name: 'vision', version: '1.0.0', kind: 'builtin',
    description: '视觉模型兜底（DOM 不可描述时）', status: 'enabled', permission: 'ask',
    tools: [{ name: 'vision', description: '截图 → 视觉模型描述', permission: 'ask' }],
    config: { model: 'glm-4.5v' }, source: { origin: 'agent-core/registry.ts（占位）' },
  },
  {
    shortId: 'plg_evidence', name: 'evidence', version: '1.0.0', kind: 'builtin',
    description: '证据采集归档（MinIO · 90 天保留）', status: 'enabled', permission: 'auto',
    tools: [{ name: 'evidence', description: '截图/trace/日志归档', permission: 'auto' }],
    config: { retentionDays: 90 }, source: { origin: 'agent-core/registry.ts（占位）' },
  },
  {
    shortId: 'plg_report', name: 'report', version: '1.0.0', kind: 'builtin',
    description: '报告与 MR 评论回写', status: 'enabled', permission: 'auto',
    tools: [{ name: 'report', description: '验证报告生成 + MR 评论', permission: 'auto' }],
    config: {}, source: { origin: 'agent-core/registry.ts（占位）' },
  },
  // F15：MCP 连接器声明（source = McpServerConfig，transport stdio + command/args 或 transport sse + url，凭据走 env）。
  // 三个内置 mcp 连接器为「声明 + 待配置」态（status=disabled，command/url 为空），配置后启用即经 PluginRuntime.loadMcp 连接。
  {
    shortId: 'plg_mcp_cmdb', name: '内部 CMDB 查询', version: '1.0.0', kind: 'mcp',
    description: 'service-gw · SSE · 4 个工具（待配置 url）', status: 'disabled', permission: 'auto',
    tools: [{ name: 'cmdb.lookup', description: '服务拓扑/负责人查询', permission: 'auto' }],
    config: {}, source: { transport: 'sse', url: '' },
  },
  {
    shortId: 'plg_mcp_zentao', name: '禅道 Issue 工具', version: '1.0.0', kind: 'mcp',
    description: 'stdio · 6 个工具 · 项目内只读（待配置 command）', status: 'disabled', permission: 'ask',
    tools: [{ name: 'zentao.issue', description: 'Issue 读写（项目内）', permission: 'ask' }],
    config: {}, source: { transport: 'stdio', command: '', args: [], env: { ZENTAO_URL: '', ZENTAO_TOKEN: '' } },
  },
  {
    shortId: 'plg_mcp_gitlab', name: 'GitLab MR 工具', version: '1.0.0', kind: 'mcp',
    description: 'stdio · 5 个工具 · 评论回写（待配置 command）', status: 'disabled', permission: 'ask',
    tools: [{ name: 'gitlab.mr', description: 'MR 评论/状态回写', permission: 'ask' }],
    config: {}, source: { transport: 'stdio', command: '', args: [], env: { GITLAB_TOKEN: '' } },
  },
];

@Injectable()
export class PluginsService implements OnModuleInit {
  constructor(private readonly explore: ExploreService) {}

  async onModuleInit(): Promise<void> {
    // 懒初始化：首个请求前完成（避免阻塞启动）
  }

  /** 幂等建表 + 种子；GET 端点也可安全调用 */
  async ensureReady(): Promise<void> {
    await this.explore.ensureReady();
    await this.pg.query(PLUGIN_DDL);
    for (const s of SEEDS) {
      await this.pg.query(
        `INSERT INTO plugin (short_id, name, version, kind, description, status, manifest, config_schema, permission, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb)
         ON CONFLICT (short_id) DO NOTHING`,
        [
          s.shortId, s.name, s.version, s.kind, s.description, s.status,
          JSON.stringify({ name: s.name, version: s.version, kind: s.kind, description: s.description, tools: s.tools, config: s.config }),
          JSON.stringify({}), s.permission, JSON.stringify(s.source),
        ],
      );
    }
  }

  private get pg() {
    return this.explore.pg;
  }

  async list(filter: { kind?: string; status?: string }): Promise<PluginRow[]> {
    await this.ensureReady();
    const conds: string[] = [];
    const params: unknown[] = [];
    if (filter.kind) { params.push(filter.kind); conds.push(`kind = $${params.length}`); }
    if (filter.status) { params.push(filter.status); conds.push(`status = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await this.pg.query(
      `SELECT * FROM plugin ${where} ORDER BY CASE kind WHEN 'builtin' THEN 0 WHEN 'mcp' THEN 1 ELSE 2 END, id`,
      params,
    );
    return r.rows as unknown as PluginRow[];
  }

  /** M3：探活基座——对 db 类插件跑 SELECT 1 验证连通（复用平台 PG） */
  async probeBase(base: string, args: Record<string, unknown>): Promise<unknown> {
    if (base === 'db.query') {
      const r = await this.pg.query(String(args.sql ?? 'SELECT 1 AS probe'));
      return { rows: (r.rows ?? []).slice(0, 5), note: '基座连通（当前走平台 PG 连接；插件独立数据源连接隔离属后续）' };
    }
    throw new Error(`基座工具 ${base} 不支持探活`);
  }

  async getByShortId(shortId: string): Promise<PluginRow | null> {
    await this.ensureReady();
    const r = await this.pg.query(`SELECT * FROM plugin WHERE short_id = $1`, [shortId]);
    return (r.rows[0] as unknown as PluginRow) ?? null;
  }

  /** short_id 自动生成：plg_ + 6 位随机（碰撞重试） */
  private async newShortId(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const id = `plg_${Math.random().toString(36).slice(2, 8)}`;
      const hit = await this.pg.query(`SELECT 1 FROM plugin WHERE short_id = $1`, [id]);
      if (hit.rows.length === 0) return id;
    }
    throw new Error('short_id 生成失败（重试耗尽）');
  }

  async create(input: {
    name?: string; version?: string; description?: string;
    permission?: string; config_schema?: unknown; manifest?: unknown; source?: unknown;
  }): Promise<PluginRow> {
    await this.ensureReady();
    const name = String(input.name ?? '').trim();
    if (!name) throw new Error('name 必填');
    const permission = ['auto', 'ask', 'forbidden'].includes(String(input.permission)) ? (input.permission as PluginPermission) : 'ask';
    const shortId = await this.newShortId();
    const version = String(input.version ?? '0.1.0');
    const description = input.description ? String(input.description) : null;
    const manifest = (input.manifest as PluginManifest | undefined) ?? {
      name, version, kind: 'custom' as const, description: description ?? '',
      tools: [], config: {},
    };
    const r = await this.pg.query(
      `INSERT INTO plugin (short_id, name, version, kind, description, status, manifest, config_schema, permission, source)
       VALUES ($1,$2,$3,'custom',$4,'draft',$5::jsonb,$6::jsonb,$7,$8::jsonb) RETURNING *`,
      [shortId, name, version, description, JSON.stringify(manifest),
       JSON.stringify(input.config_schema ?? {}), permission, JSON.stringify(input.source ?? {})],
    );
    return r.rows[0] as unknown as PluginRow;
  }

  async update(shortId: string, input: {
    status?: string; manifest?: unknown; config_schema?: unknown; permission?: string;
  }): Promise<PluginRow | null> {
    await this.ensureReady();
    const existing = await this.getByShortId(shortId);
    if (!existing) return null;
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    if (input.status && ['enabled', 'disabled', 'draft'].includes(input.status)) {
      params.push(input.status); sets.push(`status = $${params.length}`);
    }
    if (input.manifest !== undefined) {
      params.push(JSON.stringify(input.manifest)); sets.push(`manifest = $${params.length}::jsonb`);
    }
    if (input.config_schema !== undefined) {
      params.push(JSON.stringify(input.config_schema)); sets.push(`config_schema = $${params.length}::jsonb`);
    }
    if (input.permission && ['auto', 'ask', 'forbidden'].includes(input.permission)) {
      params.push(input.permission); sets.push(`permission = $${params.length}`);
    }
    params.push(shortId);
    const r = await this.pg.query(`UPDATE plugin SET ${sets.join(', ')} WHERE short_id = $${params.length} RETURNING *`, params);
    return (r.rows[0] as unknown as PluginRow) ?? null;
  }

  /** 仅 custom 可删（builtin/mcp 由引擎/平台管理） */
  async remove(shortId: string): Promise<{ ok: boolean; reason?: string }> {
    await this.ensureReady();
    const existing = await this.getByShortId(shortId);
    if (!existing) return { ok: false, reason: 'not_found' };
    if (existing.kind !== 'custom') return { ok: false, reason: `kind=${existing.kind} 不可删除（仅 custom 插件支持删除）` };
    await this.pg.query(`DELETE FROM plugin WHERE short_id = $1`, [shortId]);
    return { ok: true };
  }
}
