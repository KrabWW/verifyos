import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PluginsService, type PluginRow } from './plugins.service';
import { installPluginFromZip, uninstallLocalPlugin } from './plugin-host';

/**
 * L7：插件注册表端点。
 * GET    /api/plugins           → 列表（query: kind/status 过滤）
 * GET    /api/plugins/:shortId  → 详情
 * POST   /api/plugins           → 创建 custom（short_id 自动生成 plg_xxx，落库 draft）
 * PATCH  /api/plugins/:shortId  → status/manifest/config_schema/permission 更新
 * DELETE /api/plugins/:shortId  → 仅 custom 可删
 */
@Controller('api/plugins')
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  async list(@Query('kind') kind?: string, @Query('status') status?: string) {
    const items = await this.plugins.list({ kind: kind || undefined, status: status || undefined });
    return { plugins: items, total: items.length };
  }

  @Get(':shortId')
  async detail(@Param('shortId') shortId: string) {
    const row = await this.plugins.getByShortId(shortId);
    if (!row) throw new NotFoundException(`插件 ${shortId} 不存在`);
    return row;
  }

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    try {
      return await this.plugins.create(body);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  @Patch(':shortId')
  async update(@Param('shortId') shortId: string, @Body() body: Record<string, unknown>) {
    const row = await this.plugins.update(shortId, body);
    if (!row) throw new NotFoundException(`插件 ${shortId} 不存在`);
    return row;
  }

  /** M3：探活——对插件声明的第一个工具做一次基座调用（db.query 类跑 SELECT 1），返回连通结果 */
  @Post(':shortId/probe')
  async probe(@Param('shortId') shortId: string) {
    const row = await this.plugins.getByShortId(shortId);
    if (!row) throw new NotFoundException(`插件 ${shortId} 不存在`);
    const manifest = (row.manifest ?? {}) as Record<string, unknown>;
    const tools = (manifest.tools ?? []) as Array<{ name?: string; implements?: string }>;
    const tool = tools[0];
    if (!tool?.name) return { ok: false, reason: '插件未声明任何工具' };
    const base = tool.implements ?? tool.name!;
    const demoArgs: Record<string, Record<string, unknown>> = { 'db.query': { sql: 'SELECT 1 AS probe' } };
    const args = demoArgs[base];
    if (!args) return { ok: false, reason: `基座工具 ${base} 暂不支持自动探活（仅 db.query）` };
    try {
      const res = await this.plugins.probeBase(base, args);
      return { ok: true, via: base, plugin: row.short_id, result: res };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** M4：导出——manifest+config_schema 打包 JSON（敏感字段脱敏），供分享/共创 */
  @Get(':shortId/export')
  async exportPlugin(@Param('shortId') shortId: string, @Res() res: Response) {
    const row = await this.plugins.getByShortId(shortId);
    if (!row) throw new NotFoundException(`插件 ${shortId} 不存在`);
    const sensitive = /password|secret|token|key/i;
    const manifest = JSON.parse(JSON.stringify(row.manifest ?? {}));
    const config = (manifest.config ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(config)) if (sensitive.test(k)) config[k] = '';
    const schema = JSON.parse(JSON.stringify(row.config_schema ?? {}));
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(props)) if (sensitive.test(k)) (props[k] as Record<string, unknown>)['default'] = '';
    const pkg = {
      name: row.name, version: row.version, kind: 'custom',
      description: row.description, permission: row.permission,
      manifest, config_schema: schema,
      exportedFrom: row.short_id, exportedAt: new Date().toISOString(),
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${row.short_id}-plugin.json"`);
    res.send(JSON.stringify(pkg, null, 2));
  }

  /** M4：导入——他人分享的插件 JSON → 本地新建 custom 插件（draft，short_id 重新生成） */
  @Post('import')
  async importPlugin(@Body() body: Record<string, unknown>) {
    const name = String(body?.name ?? '');
    if (!name) throw new BadRequestException('导入包缺少 name');
    try {
      const row = await this.plugins.create({
        name: `${name}（导入）`,
        version: String(body?.version ?? '1.0.0'),
        description: String(body?.description ?? '') + (body?.exportedFrom ? `（来自 ${String(body.exportedFrom)}）` : ''),
        permission: String(body?.permission ?? 'ask'),
        manifest: (body?.manifest ?? {}) as Record<string, unknown>,
        config_schema: (body?.config_schema ?? {}) as Record<string, unknown>,
      });
      return { ok: true, shortId: row.short_id, name: row.name, status: row.status };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  /** zip 安装包导入（共创闭环）：解包校验 → 落盘 plugins/<name>/ → 即时激活，同名热替换 */
  @Post('install')
  async installZip(@Body() body: { filename?: string; dataBase64?: string }) {
    if (!body?.dataBase64) throw new BadRequestException('缺少 dataBase64（插件 zip 的 base64 内容）');
    try {
      return await installPluginFromZip(String(body.filename ?? 'plugin.zip'), body.dataBase64);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  @Delete(':shortId')
  async remove(@Param('shortId') shortId: string) {
    // 本地插件（plg_local_*）：先卸运行时实例 + 删插件目录（uninstall 内部已删注册表行）；
    // 未激活（仅剩注册表行/残留）则走原有注册表删除路径
    let uninstalled = false;
    if (shortId.startsWith('plg_local_')) {
      try {
        const r = await uninstallLocalPlugin(shortId.slice('plg_local_'.length));
        if (r.ok) return { ok: true, uninstalled: true };
      } catch {
        /* 宿主未初始化等场景：仅删注册表行 */
      }
    }
    const res = await this.plugins.remove(shortId);
    if (!res.ok) {
      throw res.reason === 'not_found'
        ? new NotFoundException(`插件 ${shortId} 不存在`)
        : new BadRequestException(res.reason);
    }
    return { ok: true, uninstalled };
  }
}
