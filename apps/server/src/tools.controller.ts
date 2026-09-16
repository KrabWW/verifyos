import { BadRequestException, Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { Pool } from 'pg';
import { ApprovalManager, ToolRegistry, registerBuiltinTools } from '@verifyos/agent-core';
import type { ToolContext, ToolPermission } from '@verifyos/agent-core';

/**
 * F15：工具与插件屏后端 —— ToolRegistry 单例接入（E1 引擎首次进入运行时）。
 * GET  /api/tools        → registry.list()（8 内置工具 + 权限档）
 * POST /api/tools/invoke → registry.invoke（仅 auto 档；ask 须经 Run 内人工批准流，forbidden 禁用）
 * GET  /api/tools/audit  → audit_log 表最近 50 条（onAudit 落库；PG 不可用回退内存态）
 */

/** registry 单例：注入全局 ApprovalManager（B3），内置 8 工具（E1） */
export function createToolRegistry(approvals: ApprovalManager, pool: Pool): ToolRegistry {
  const registry = new ToolRegistry(approvals);
  registerBuiltinTools(registry);
  // 审计持久化：fire-and-forget，落 audit_log（action=tool.call，完整条目进 meta）
  registry.onAudit((entry) => {
    pool
      .query(
        `INSERT INTO audit_log (actor, action, target, meta)
         VALUES ($1, 'tool.call', $2, $3::jsonb)`,
        ['system', entry.tool, JSON.stringify(entry)],
      )
      .catch(() => undefined); // 审计落库失败不影响主流程（内存态仍在）
  });
  return registry;
}

interface InvokeDto {
  name?: string;
  args?: Record<string, unknown>;
}

@Controller('api/tools')
export class ToolsController {
  constructor(
    @Inject(ToolRegistry) private readonly registry: ToolRegistry,
    @Inject(Pool) private readonly pool: Pool,
  ) {}

  /** M2：enabled 插件声明的 tools（name 带插件前缀语义）→ 合并进工具列表 */
  private async pluginTools(): Promise<Array<{ name: string; description: string; permission: string; plugin: string }>> {
    try {
      const r = await this.pool.query(
        `SELECT short_id, name, manifest FROM plugin WHERE status = 'enabled' ORDER BY updated_at DESC`,
      );
      const out: Array<{ name: string; description: string; permission: string; plugin: string }> = [];
      for (const row of r.rows as Array<{ short_id: string; name: string; manifest: Record<string, unknown> }>) {
        const manifest = (row.manifest ?? {}) as Record<string, unknown>;
        const tools = (manifest.tools ?? []) as Array<{ name?: string; description?: string; permission?: string }>;
        for (const t of tools) {
          if (!t.name) continue;
          out.push({ name: t.name, description: `${t.description ?? ''}（插件 ${row.name}）`, permission: t.permission ?? 'ask', plugin: row.short_id });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  @Get()
  async tools() {
    // G07：audit_log 按 tool 24h 调用计数（工具名落 target 列——见 createToolRegistry 的 onAudit 写入）
    let usage: Record<string, number> = {};
    try {
      const r = await this.pool.query(
        `SELECT target AS tool, COUNT(*)::int AS n FROM audit_log
         WHERE created_at > now() - interval '24 hours' AND action = 'tool.call'
         GROUP BY target`,
      );
      for (const row of r.rows as Array<{ tool: string; n: number }>) usage[row.tool] = row.n;
    } catch {
      // PG 不可用：回退内存态审计计数（仅本进程）
      for (const e of this.registry.audit() as unknown as Array<{ tool?: string }>) {
        if (e.tool) usage[e.tool] = (usage[e.tool] ?? 0) + 1;
      }
    }
    const builtin = this.registry.list().map((t) => ({ ...t, usage24h: usage[t.name] ?? 0 }));
    const builtinNames = new Set(builtin.map((t) => t.name));
    // U30：与内置同名的插件工具声明不重复展示（invoke 仍按基座路由）
    const pluginTools = (await this.pluginTools())
      .filter((t) => !builtinNames.has(t.name))
      .map((t) => ({ ...t, usage24h: usage[t.name] ?? 0 }));
    return { tools: [...builtin, ...pluginTools] };
  }

  @Post('invoke')
  async invoke(@Body() dto: InvokeDto) {
    const name = String(dto.name ?? '');
    let base = name;
    let pluginShortId: string | null = null;
    let pluginPermission: string | null = null;
    const def = this.registry.get(name);
    if (!def) {
      // M2：非内置 → 查插件声明的工具（implements 指向基座；未声明时按名称末段匹配内置）
      const ptools = await this.pluginTools();
      const pt = ptools.find((t) => t.name === name);
      if (!pt) throw new BadRequestException(`未知工具 ${name}（内置与插件均未声明）`);
      pluginShortId = pt.plugin;
      pluginPermission = pt.permission;
      try {
        const r = await this.pool.query(
          `SELECT manifest FROM plugin WHERE short_id = $1 LIMIT 1`,
          [pt.plugin],
        );
        const manifest = ((r.rows[0] ?? {}).manifest ?? {}) as Record<string, unknown>;
        const tools = (manifest.tools ?? []) as Array<{ name?: string; implements?: string }>;
        const declared = tools.find((t) => t.name === name);
        base = declared?.implements ?? name.split('.').slice(-1)[0];
      } catch {
        base = name.split('.').slice(-1)[0];
      }
      const baseDef = this.registry.get(base);
      if (!baseDef) throw new BadRequestException(`插件工具 ${name} 的基座 ${base} 不存在`);
      if (baseDef.permission !== 'auto') {
        throw new BadRequestException(`基座工具 ${base} 权限为 ${baseDef.permission}，仅 auto 档支持屏上试运行`);
      }
      const ctx: ToolContext = { pool: this.pool };
      const result = await this.registry.invoke(base, dto.args ?? {}, ctx);
      return { ...(result as unknown as Record<string, unknown>), viaPlugin: pluginShortId, baseTool: base };
    }
    if (def.permission !== 'auto') {
      // ask 工具的调用入口在 Run 执行流（弹卡批准）；屏上直调仅开放 auto 档
      throw new BadRequestException(
        `工具 ${name} 权限为 ${def.permission}，仅 auto 档支持屏上试运行（ask 需经 Run 内人工批准）`,
      );
    }
    const ctx: ToolContext = { pool: this.pool };
    const result = await this.registry.invoke(name, dto.args ?? {}, ctx);
    return result;
  }

  @Get('audit')
  async audit() {
    try {
      const r = await this.pool.query(
        `SELECT meta, created_at FROM audit_log WHERE action = 'tool.call' ORDER BY id DESC LIMIT 50`,
      );
      const items = (r.rows as Array<{ meta: Record<string, unknown>; created_at: string }>).map((row) => ({
        ...(row.meta as Record<string, unknown>),
        ts: row.created_at,
      }));
      return { source: 'db', items };
    } catch {
      // PG 不可用：回退内存态（本进程内 audit）
      const items = this.registry.audit().slice(-50).reverse() as unknown as Array<Record<string, unknown>>;
      return { source: 'memory', items };
    }
  }
}

/** 供 AppModule 工厂使用：权限档守卫的类型收窄（仅编译期辅助） */
export type AutoToolGuard = { permission: ToolPermission };
