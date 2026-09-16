import { Controller, Get } from '@nestjs/common';
import { ExploreService } from './explore.service';

/**
 * G10: 探索接管控制端点（新拆分——pause/stop 留在 explore.controller.ts）。
 * headful 模式下 Crawler 以 --remote-debugging-port=9222 启动，前端经此端点
 * 读取接入指引（chrome://inspect → Configure → 添加 endpoint）。
 */
@Controller('api/explore')
export class ExploreControlController {
  constructor(private readonly exploreSvc: ExploreService) {}

  /** headful 浏览器 CDP 接入点（headless 运行时 available=false——诚实暴露） */
  @Get('cdp')
  cdp() {
    const endpoint = this.exploreSvc.cdpEndpoint();
    return { available: !!endpoint, endpoint };
  }
}
