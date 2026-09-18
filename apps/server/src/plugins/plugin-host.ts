import type { INestApplication } from '@nestjs/common';
import type { Request, Response, Router } from 'express';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { RunEvent } from '@verifyos/shared';
import { ExploreService } from '../explore/explore.service';
import { RunsService } from '../runs/runs.service';
import { PluginsService } from './plugins.service';

/**
 * 本地插件宿主（贡献插件扩展点）——「Everything is a Plugin」的落地缝。
 *
 * 核心只留这一个文件 + main.ts 一行接线；其余能力全部住在 plugins/ 目录：
 *   plugins/<name>/verifyos.plugin.json  # manifest（name/title/version/description/permission/routes）
 *   plugins/<name>/index.js              # CommonJS 入口：module.exports = { activate(ctx), deactivate?() }
 *
 * ctx 能力面（有意保持最小）：
 *   ctx.log(...args)                     带插件名前缀的日志
 *   ctx.pg                               平台 PG 连接（explore.pg，只读场景优先）
 *   ctx.rootDir                          仓库根绝对路径（证据/落盘用 out/...）
 *   ctx.pluginDir                        插件自身目录
 *   ctx.require(id)                      宿主侧模块解析（pnpm 严格 node_modules 下插件自带依赖用）
 *   ctx.registerRoute(method, path, h)   挂路由 → 最终暴露 /api/plugins/<name><path>
 *   ctx.onRunEvent(fn)                   订阅 run.event（与 WS 网关同一事件源，零侵入）
 *
 * 隔离原则：单个插件 activate 失败只降级为注册表 draft 行 + 日志，绝不影响 API 启动。
 * 热更新策略：
 *   - 启动扫描：plugins/ 下全部插件随 API 启动激活。
 *   - 运行中安装：POST /api/plugins/import（zip）→ 落盘 + 即时激活，无需重启。
 *   - 路由经 routeTable 间接分发：同名重装=替换处理器；卸载=表项摘除（express 壳保留，404）。
 *   - run.event 监听器按插件分组，卸载时整组摘除。
 */

export interface PluginRouteRequest {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body?: unknown;
}

export interface PluginRouteResponse {
  json(value: unknown): void;
  status(code: number): { json(value: unknown): void };
}

export type PluginRouteHandler = (req: PluginRouteRequest, res: PluginRouteResponse) => void | Promise<void>;

export interface PluginContext {
  /** manifest.name */
  name: string;
  log(...args: unknown[]): void;
  pg: ExploreService['pg'];
  rootDir: string;
  pluginDir: string;
  require(id: string): unknown;
  registerRoute(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    subPath: string,
    handler: PluginRouteHandler,
  ): void;
  onRunEvent(fn: (e: RunEvent) => void): void;
}

interface ActivePlugin {
  name: string;
  pluginDir: string;
  manifest: Record<string, unknown>;
  routes: string[];
  listeners: Array<(e: RunEvent) => void>;
  deactivate?: () => void | Promise<void>;
}

interface HostRuntime {
  app: INestApplication;
  pluginRouter: Router;
  pluginsSvc: PluginsService;
  pg: ExploreService['pg'];
  rootDir: string;
  pluginsDir: string;
}

const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

// ── 运行时状态（模块级，供 install/uninstall 在任意时刻操作）──────────────
const activePlugins = new Map<string, ActivePlugin>();
/** key: `<method> <sub>`（sub=/ <name>/<path>）→ 当前生效的插件处理器。路由壳只注册一次。 */
const routeTable = new Map<string, PluginRouteHandler>();
let host: HostRuntime | null = null;
let dispatcherBound = false;

export async function initPluginHost(app: INestApplication, pluginRouter: Router): Promise<void> {
  const explore = app.get(ExploreService);
  const runs = app.get(RunsService);
  const pluginsSvc = app.get(PluginsService);
  const rootDir = path.resolve(process.cwd(), '../..');
  const pluginsDir = process.env.PLUGIN_DIR
    ? path.resolve(process.env.PLUGIN_DIR)
    : path.join(rootDir, 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
  host = { app, pluginRouter, pluginsSvc, pg: explore.pg, rootDir, pluginsDir };

  // run.event 分发：与 WS 网关同一事件源（RunsService extends EventEmitter），
  // 监听器异常逐个吞掉，绝不影响主执行流。按插件分组存储 → 卸载时整组摘除。
  if (!dispatcherBound) {
    dispatcherBound = true;
    runs.on('run.event', (e: RunEvent) => {
      for (const plugin of activePlugins.values()) {
        for (const fn of plugin.listeners) {
          try {
            fn(e);
          } catch (err) {
            console.error('[plugin-host] run.event 监听器异常:', err instanceof Error ? err.message : err);
          }
        }
      }
    });
  }

  const entries = fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let failed = 0;
  for (const folder of entries) {
    const pluginDir = path.join(pluginsDir, folder);
    if (!fs.existsSync(path.join(pluginDir, 'verifyos.plugin.json'))) continue;
    try {
      await activatePluginDir(pluginDir);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[plugin-host] ✗ 插件 ' + folder + ' 加载失败（已跳过，不影响启动）:', msg);
      try {
        await upsertRegistryRow(pluginsSvc, explore.pg, {
          manifest: { name: folder },
          pluginDir,
          ok: false,
          error: msg,
        });
      } catch {
        /* 注册表不可用时忽略 */
      }
    }
  }

  if (activePlugins.size === 0 && failed === 0)
    console.log('[plugin-host] plugins/ 下没有可加载的插件（目录需含 verifyos.plugin.json + index.js）');
  else
    console.log(
      '[plugin-host] 本地插件 ' + activePlugins.size + ' 个已加载：' +
        [...activePlugins.keys()].join(', ') +
        (failed ? '（另有 ' + failed + ' 个加载失败）' : ''),
    );
}

/** 激活单个插件目录（启动扫描与 zip 安装共用）：读 manifest → require → activate(ctx) → 注册表 upsert */
async function activatePluginDir(pluginDir: string): Promise<ActivePlugin> {
  if (!host) throw new Error('插件宿主未初始化');
  const manifestPath = path.join(pluginDir, 'verifyos.plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const name = String(manifest?.name ?? '');
  if (!NAME_RE.test(name)) throw new Error('manifest.name 缺失或非法（小写字母/数字/连字符，2-41 位）');
  if (!fs.existsSync(path.join(pluginDir, 'index.js'))) throw new Error('缺少 index.js 入口');
  if (activePlugins.has(name)) throw new Error('同名插件已激活（' + name + '），如需替换请走 zip 重装');
  const rt = host; // 闭包内用的运行时引用（TS 无法对模块级 let 做收窄）

  const req = createRequire(path.join(pluginDir, 'index.js'));
  const mod = req('./index.js') as { activate?: unknown; deactivate?: unknown };
  if (typeof mod.activate !== 'function') throw new Error('index.js 未导出 activate(ctx)');

  const routes: string[] = [];
  const listeners: Array<(e: RunEvent) => void> = [];

  const ctx: PluginContext = {
    name,
    log: (...args: unknown[]) => console.log('[' + name + ']', ...args),
    pg: rt.pg,
    rootDir: rt.rootDir,
    pluginDir,
    require: (id: string) => req(id),
    registerRoute: (method, subPath, handler) => {
      const m = method.toLowerCase();
      if (!METHODS.has(m)) throw new Error('不支持的路由方法 ' + method);
      const full = '/api/plugins/' + name + (subPath.startsWith('/') ? subPath : '/' + subPath);
      const sub = '/' + name + (subPath.startsWith('/') ? subPath : '/' + subPath);
      const key = m + ' ' + sub;
      // 路由经 routeTable 间接分发：同名重装只换处理器，不再叠注册 express 路由
      const existed = routeTable.has(key);
      routeTable.set(key, handler);
      if (existed) {
        if (!routes.includes(m.toUpperCase() + ' ' + full)) routes.push(m.toUpperCase() + ' ' + full);
        return;
      }
      // pluginRouter 预挂载于 /api/plugins（main.ts，先于 Nest router）——
      // listen 后向 Router 追加路由依然生效，且优先于 Nest 的 404 处理
      const registrar = rt.pluginRouter as unknown as Record<
        string,
        (p: string, h: (req: Request, res: Response) => void) => void
      >;
      registrar[m](sub, (ereq: Request, eres: Response) => {
        const dispatch = () => {
          const current = routeTable.get(key);
          if (!current) {
            eres.status(404).json({ error: '插件路由已失效（' + name + ' 已卸载或未激活）' });
            return;
          }
          Promise.resolve(
            current(
              {
                params: (ereq.params ?? {}) as Record<string, string>,
                query: (ereq.query ?? {}) as Record<string, string | undefined>,
                body: (ereq as { body?: unknown }).body,
              },
              eres as unknown as PluginRouteResponse,
            ),
          ).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[' + name + '] 路由 ' + m.toUpperCase() + ' ' + full + ' 失败:', msg);
            if (!eres.headersSent) eres.status(500).json({ error: msg });
          });
        };
        // 插件 router 预挂载在 Nest body 解析器之前：POST/PUT/PATCH 需自行读流。
        // 命中插件路由时不会 next()，因此不影响 Nest 链路对其他请求的正常解析。
        const needsBody = m === 'post' || m === 'put' || m === 'patch';
        const mutable = ereq as Request & { body?: unknown };
        if (needsBody && mutable.body === undefined) {
          const chunks: Buffer[] = [];
          ereq.on('data', (c: Buffer) => chunks.push(c));
          ereq.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) mutable.body = {};
            else {
              try {
                mutable.body = JSON.parse(raw);
              } catch {
                mutable.body = { _raw: raw };
              }
            }
            dispatch();
          });
          return;
        }
        dispatch();
      });
      routes.push(m.toUpperCase() + ' ' + full);
    },
    onRunEvent: (fn) => {
      listeners.push(fn);
    },
  };

  await Promise.resolve((mod.activate as (c: PluginContext) => unknown)(ctx));
  const plugin: ActivePlugin = {
    name,
    pluginDir,
    manifest,
    routes,
    listeners,
    deactivate:
      typeof mod.deactivate === 'function'
        ? () => {
            (mod.deactivate as () => unknown)();
          }
        : undefined,
  };
  activePlugins.set(name, plugin);
  await upsertRegistryRow(host.pluginsSvc, host.pg, { manifest, pluginDir, ok: true });
  console.log(
    '[plugin-host] ✓ ' + name + ' v' + String(manifest.version ?? '?') +
      (routes.length ? ' · ' + routes.join(', ') : ''),
  );
  return plugin;
}

// ── zip 安装 / 卸载（POST /api/plugins/import 与 DELETE /api/plugins/:shortId 调用）────

/**
 * 安装 zip 插件包：解包校验 → 落盘 plugins/<name>/ → 即时激活（无需重启）。
 * zip 布局支持两种：文件在根（verifyos.plugin.json + index.js）或统一在单个顶层目录下。
 * 同名已安装 → 先卸旧（deactivate + 摘监听/路由）再装新（热替换）。
 */
export async function installPluginFromZip(
  filename: string,
  dataBase64: string,
): Promise<{ ok: true; name: string; version: string; routes: string[]; replaced: boolean; registryShortId: string }> {
  if (!host) throw new Error('插件宿主未初始化（API 尚未完成启动）');
  const buf = Buffer.from(dataBase64, 'base64');
  if (buf.length === 0) throw new Error('zip 内容为空');
  if (buf.length > 20 * 1024 * 1024) throw new Error('zip 超过 20MB 上限');
  const zip = new AdmZip(buf);

  // 收集文件条目（跳目录）并做路径安全校验
  let files: Array<{ name: string; data: Buffer }> = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const rawName = entry.entryName.replace(/\\/g, '/');
    const segs = rawName.split('/');
    if (rawName.startsWith('/') || segs.some((s) => s === '..' || s === '')) {
      throw new Error('zip 内含非法路径：' + rawName);
    }
    files.push({ name: rawName, data: entry.getData() });
  }
  if (files.length === 0) throw new Error('zip 内没有文件');

  // 统一顶层目录布局 → 剥掉该前缀
  const topPrefixes = new Set(files.map((f) => f.name.split('/')[0]));
  const hasRootManifest = files.some((f) => f.name === 'verifyos.plugin.json');
  if (!hasRootManifest && topPrefixes.size === 1) {
    const prefix = [...topPrefixes][0] + '/';
    if (files.some((f) => f.name === prefix + 'verifyos.plugin.json')) {
      files = files.map((f) => ({ name: f.name.slice(prefix.length), data: f.data })).filter((f) => f.name !== '');
    }
  }

  const manifestEntry = files.find((f) => f.name === 'verifyos.plugin.json');
  if (!manifestEntry) throw new Error('zip 缺少 verifyos.plugin.json');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('verifyos.plugin.json 不是合法 JSON');
  }
  const name = String(manifest?.name ?? '');
  if (!NAME_RE.test(name)) throw new Error('manifest.name 缺失或非法（小写字母/数字/连字符，2-41 位）');
  if (!files.some((f) => f.name === 'index.js')) throw new Error('zip 缺少 index.js 入口');

  // 同名热替换：先卸旧实例（deactivate + 摘监听器/路由），旧目录随后被覆盖
  const replaced = activePlugins.has(name);
  if (replaced) await deactivatePlugin(name);

  const target = path.join(host.pluginsDir, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const f of files) {
    const dest = path.join(target, ...f.name.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.data);
  }
  console.log('[plugin-host] zip 安装 ' + filename + ' → ' + target + '（' + files.length + ' 个文件）');

  const plugin = await activatePluginDir(target);
  return {
    ok: true,
    name: plugin.name,
    version: String(plugin.manifest.version ?? '0.0.0'),
    routes: plugin.routes,
    replaced,
    registryShortId: 'plg_local_' + plugin.name,
  };
}

/** 卸载本地插件：deactivate → 摘 run.event 监听器与路由表项 →（可选）删目录 → 删注册表行 */
export async function uninstallLocalPlugin(
  name: string,
  opts?: { deleteFiles?: boolean },
): Promise<{ ok: boolean; reason?: string }> {
  const plugin = activePlugins.get(name);
  if (!plugin) return { ok: false, reason: 'not_active' };
  await deactivatePlugin(name);
  if (opts?.deleteFiles !== false && host) {
    try {
      fs.rmSync(plugin.pluginDir, { recursive: true, force: true });
    } catch (err) {
      console.error('[plugin-host] 删除插件目录失败:', err instanceof Error ? err.message : err);
    }
  }
  if (host) {
    try {
      await host.pluginsSvc.remove('plg_local_' + name);
    } catch {
      /* 注册表行不存在等情况忽略 */
    }
  }
  console.log('[plugin-host] 卸载插件 ' + name + '（目录' + (opts?.deleteFiles === false ? '保留' : '已删') + '）');
  return { ok: true };
}

async function deactivatePlugin(name: string): Promise<void> {
  const plugin = activePlugins.get(name);
  if (!plugin) return;
  if (plugin.deactivate) {
    try {
      await plugin.deactivate();
    } catch (err) {
      console.error('[plugin-host] deactivate 异常（继续卸载）:', err instanceof Error ? err.message : err);
    }
  }
  activePlugins.delete(name);
  for (const key of [...routeTable.keys()]) {
    if (key.split(' ')[1]?.startsWith('/' + name + '/')) routeTable.delete(key);
  }
}

/** 插件行 upsert 进 DB 注册表（工具与插件页可见）：short_id 固定 plg_local_<name>，重启不重复 */
async function upsertRegistryRow(
  pluginsSvc: PluginsService,
  pg: ExploreService['pg'],
  input: { manifest: Record<string, unknown>; pluginDir: string; ok: boolean; error?: string },
): Promise<void> {
  await pluginsSvc.ensureReady();
  const m = input.manifest ?? {};
  const name = String(m.name ?? 'unknown');
  const shortId = 'plg_local_' + name;
  const manifestJson = {
    name,
    title: m.title ?? name,
    version: m.version ?? '0.0.0',
    kind: 'custom',
    description: m.description ?? '',
    tools: Array.isArray(m.tools) ? m.tools : [],
    routes: Array.isArray(m.routes) ? m.routes : [],
    config: (m.config ?? {}) as Record<string, unknown>,
  };
  const source = input.ok
    ? { type: 'local', dir: input.pluginDir, activatedAt: new Date().toISOString() }
    : { type: 'local', dir: input.pluginDir, error: input.error ?? 'activate 失败' };
  const permission = ['auto', 'ask', 'forbidden'].includes(String(m.permission)) ? String(m.permission) : 'ask';
  await pg.query(
    `INSERT INTO plugin (short_id, name, version, kind, description, status, manifest, config_schema, permission, source)
     VALUES ($1, $2, $3, 'custom', $4, $5, $6::jsonb, '{}'::jsonb, $7, $8::jsonb)
     ON CONFLICT (short_id) DO UPDATE SET
       name = EXCLUDED.name, version = EXCLUDED.version, description = EXCLUDED.description,
       status = EXCLUDED.status, manifest = EXCLUDED.manifest, source = EXCLUDED.source,
       permission = EXCLUDED.permission, updated_at = now()`,
    [
      shortId,
      String(m.title ?? name),
      String(m.version ?? '0.0.0'),
      String(m.description ?? ''),
      input.ok ? 'enabled' : 'draft',
      JSON.stringify(manifestJson),
      permission,
      JSON.stringify(source),
    ],
  );
}