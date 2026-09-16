import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PluginRuntime } from './plugin-runtime.service';
import { PluginsService } from './plugins.service';

/**
 * N 系：插件运行时控制端点（加载/卸载/重载 + 状态观测）。
 * 装插件 = 在 manifest.entry 声明代码文件 → 启用 → load 加载进进程；禁用 → unload 回滚。
 */
@Controller('api/plugin-runtime')
export class PluginRuntimeController {
  constructor(
    private readonly runtime: PluginRuntime,
    private readonly plugins: PluginsService,
  ) {}

  @Post(':shortId/load')
  async load(@Param('shortId') shortId: string) {
    const row = await this.plugins.getByShortId(shortId);
    if (!row) throw new NotFoundException(`插件 ${shortId} 不存在`);
    return this.runtime.load(shortId);
  }

  @Post(':shortId/unload')
  async unload(@Param('shortId') shortId: string) {
    return this.runtime.unload(shortId);
  }

  @Post(':shortId/reload')
  async reload(@Param('shortId') shortId: string) {
    return this.runtime.reload(shortId);
  }

  @Get()
  async loaded() {
    return { plugins: this.runtime.loaded() };
  }
}
