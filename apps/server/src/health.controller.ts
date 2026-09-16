import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/api/health')
  health() {
    return {
      ok: true,
      service: 'verifyos-server',
      // 模型 chip（G13：composer 展示当前引擎模型）
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
      ts: new Date().toISOString(),
    };
  }
  // GET /api/tools 已迁至 tools.controller.ts（F15：真 ToolRegistry.list() 替代静态 BUILTIN_TOOLS）
}
