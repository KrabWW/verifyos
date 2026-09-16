import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { McpToolAdapter, ToolRegistry, type McpServerConfig, type ToolDef, type ToolPermission } from '@verifyos/agent-core';
import { PluginsService, type PluginRow } from './plugins.service';
import { LlmService } from '../llm/llm.service';

/**
 * N 系：DSH 进程内插件运行时（Cordis 式）。
 * 插件 = 一个 TS 文件，默认导出 `async activate(ctx) => ({ onDispose? })`。
 * - 加载：require('tsx/cjs') 打全局 TS hook → require(插件文件) → activate(ctx)
 * - ctx = 插件 API 白名单（registerTool / llm / db(只读) / config / log）——不暴露 require/fs/process
 * - 回滚：卸载时 onDispose() + 逐个 unregister 注册的工具（时间可组合性：卸载即撤回）
 * 安全模型 = 信任模型（插件代码与平台同进程，ctx 白名单是 API 规范非沙箱隔离）。
 */

export interface PluginContext {
  registerTool: (def: ToolDef) => void;
  llm: (prompt: string) => Promise<string>;
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
  config: Record<string, unknown>;
  log: (...args: unknown[]) => void;
}

interface LoadedPlugin {
  instance: { onDispose?: () => void | Promise<void>; [k: string]: unknown } | null;
  tools: string[];
}

@Injectable()
export class PluginRuntime implements OnModuleInit {
  private instances = new Map<string, LoadedPlugin>();
  private mcpAdapters = new Map<string, McpToolAdapter>();

  constructor(
    @Inject(ToolRegistry) private readonly registry: ToolRegistry,
    @Inject(Pool) private readonly pool: Pool,
    private readonly llmSvc: LlmService,
    private readonly plugins: PluginsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 扫描 enabled 插件逐个加载（进程内插件走 entry.file，MCP 连接器走 source.transport；单个失败不阻塞启动）
    try {
      const rows = await this.plugins.list({ status: 'enabled' });
      for (const p of rows) {
        const sid = String(p.short_id);
        if (this.mcpConfig(p)) {
          try { await this.loadMcp(sid); } catch (e) { console.log(`[plugin-runtime] 连接 MCP ${sid} 失败：`, (e as Error).message); }
        } else if (this.hasEntry(p)) {
          try { await this.load(sid); } catch (e) { console.log(`[plugin-runtime] 加载 ${sid} 失败：`, (e as Error).message); }
        }
      }
    } catch { /* DB 未就绪时跳过，运行时按需加载 */ }
  }

  private hasEntry(p: PluginRow): boolean {
    const manifest = (p.manifest ?? {}) as Record<string, unknown>;
    const entry = (manifest.entry ?? {}) as { file?: string };
    return typeof entry.file === 'string' && entry.file.length > 0;
  }

  /** F15：解析插件 source 为 McpServerConfig；未声明 command/url 时返回 null */
  private mcpConfig(p: PluginRow): McpServerConfig | null {
    const src = (p.source ?? {}) as Record<string, unknown>;
    const transport = String(src.transport ?? '');
    if (transport === 'stdio') {
      const command = String(src.command ?? '').trim();
      if (!command) return null;
      return {
        transport: 'stdio',
        command,
        args: Array.isArray(src.args) ? (src.args as string[]) : [],
        env: (src.env as Record<string, string>) ?? undefined,
        cwd: typeof src.cwd === 'string' ? src.cwd : undefined,
      };
    }
    if (transport === 'sse') {
      const url = String(src.url ?? '').trim();
      if (!url) return null;
      return { transport: 'sse', url, headers: (src.headers as Record<string, string>) ?? undefined };
    }
    return null;
  }

  private buildCtx(plugin: PluginRow): PluginContext {
    const manifest = (plugin.manifest ?? {}) as Record<string, unknown>;
    const cfg = (manifest.config ?? {}) as Record<string, unknown>;
    const sid = String(plugin.short_id);
    return {
      // 注册工具进 ToolRegistry（权限三档 + 审计复用），记录名字供卸载回滚
      registerTool: (def) => {
        this.registry.register(def);
        let existing = this.instances.get(sid);
        if (!existing) { existing = { instance: null, tools: [] }; this.instances.set(sid, existing); }
        if (!existing.tools.includes(def.name)) existing.tools.push(def.name);
      },
      llm: (prompt) => this.llmSvc.chat([{ role: 'user', content: prompt }]),
      db: { query: (sql, params) => this.pool.query(sql, params ?? []) },
      config: cfg,
      log: (...args) => console.log(`[plugin:${sid}]`, ...args),
    };
  }

  /** F15：连接 MCP server（spawn/SSE → 握手 tools/list → 注册进 ToolRegistry） */
  async loadMcp(shortId: string): Promise<{ ok: boolean; tools: string[]; error?: string }> {
    const plugin = await this.plugins.getByShortId(shortId);
    if (!plugin) return { ok: false, tools: [], error: `插件 ${shortId} 不存在` };
    const config = this.mcpConfig(plugin);
    if (!config) return { ok: false, tools: [], error: '插件 source 未声明 MCP 连接（transport + command/url）' };
    await this.unloadMcp(shortId); // 幂等：先断开旧连接
    const adapter = new McpToolAdapter({
      name: shortId,
      config,
      permission: (plugin.permission as ToolPermission) ?? 'ask',
      logger: (m) => console.log(`[plugin:mcp:${shortId}]`, m),
    });
    try {
      await adapter.start();
      const names = await adapter.register(this.registry);
      this.mcpAdapters.set(shortId, adapter);
      return { ok: true, tools: names };
    } catch (err) {
      await adapter.dispose().catch(() => undefined);
      return { ok: false, tools: [], error: (err as Error).message };
    }
  }

  private async unloadMcp(shortId: string): Promise<void> {
    const adapter = this.mcpAdapters.get(shortId);
    if (!adapter) return;
    for (const name of adapter.registered) this.registry.unregister(name);
    await adapter.dispose().catch(() => undefined);
    this.mcpAdapters.delete(shortId);
  }

  async load(shortId: string): Promise<{ ok: boolean; tools: string[]; error?: string }> {
    const plugin = await this.plugins.getByShortId(shortId);
    if (!plugin) return { ok: false, tools: [], error: `插件 ${shortId} 不存在` };
    if (this.mcpConfig(plugin)) return this.loadMcp(shortId);
    if (!this.hasEntry(plugin)) return { ok: false, tools: [], error: '插件 manifest 未声明 entry.file' };
    const entry = (((plugin.manifest ?? {}) as Record<string, unknown>).entry ?? {}) as { file: string };
    try {
      require('tsx/cjs'); // 全局 TS require hook（幂等，仅首次生效）
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(entry.file);
      const activate = mod.default ?? mod;
      if (typeof activate !== 'function') return { ok: false, tools: [], error: `插件 ${entry.file} 默认导出不是 activate 函数` };
      const instance = (await activate(this.buildCtx(plugin))) as { onDispose?: () => void | Promise<void> };
      let existing = this.instances.get(shortId);
      if (!existing) { existing = { instance: null, tools: [] }; this.instances.set(shortId, existing); }
      existing.instance = instance ?? null;
      return { ok: true, tools: existing.tools };
    } catch (e) {
      return { ok: false, tools: [], error: (e as Error).message };
    }
  }

  async unload(shortId: string): Promise<{ ok: boolean; error?: string }> {
    if (this.mcpAdapters.has(shortId)) {
      await this.unloadMcp(shortId);
      return { ok: true };
    }
    const existing = this.instances.get(shortId);
    if (!existing) return { ok: false, error: `插件 ${shortId} 未加载` };
    try {
      if (existing.instance?.onDispose) await existing.instance.onDispose();
    } catch (e) {
      console.log(`[plugin-runtime] ${shortId} onDispose 异常：`, (e as Error).message);
    }
    for (const t of existing.tools) this.registry.unregister(t);
    this.instances.delete(shortId);
    return { ok: true };
  }

  async reload(shortId: string): Promise<{ ok: boolean; tools: string[]; error?: string }> {
    await this.unload(shortId);
    return this.load(shortId);
  }

  /** 已加载插件的工具清单（调试/观测）——含进程内插件与 MCP 连接器 */
  loaded(): Array<{ shortId: string; tools: string[] }> {
    const custom = [...this.instances.entries()].map(([shortId, v]) => ({ shortId, tools: v.tools }));
    const mcp = [...this.mcpAdapters.entries()].map(([shortId, a]) => ({ shortId, tools: a.registered }));
    return [...custom, ...mcp];
  }
}
