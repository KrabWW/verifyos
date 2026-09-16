import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { RunsService } from '../runs/runs.service';
import { ExploreService } from '../explore/explore.service';
import { parseChatIntent, type ChatIntent } from './chat.service';

/**
 * AI 工作区（C 系 chat 屏引擎）：自然语言 → 意图解析 → 能力调度。
 * 前端收到 plan 后自动执行对应动作并渲染卡片；chat 类直接展示 reply。
 */
@Controller('api/chat')
export class ChatController {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly runs: RunsService,
  ) {}

  /** 对话历史（PG 持久化，刷新不丢）；limit NaN → 400，负数 clamp 到 1（J01 任务2） */
  @Get('history')
  async history(@Query('limit') limit?: string) {
    await this.exploreSvc.ensureReady();
    const n = Number(limit ?? 50);
    if (!Number.isFinite(n)) throw new BadRequestException('invalid limit');
    const lim = Math.max(1, Math.min(Math.floor(n), 200));
    const r = await this.exploreSvc.pg.query(
      `SELECT role, content, card, created_at FROM chat_message
       WHERE session_id = 'default' ORDER BY created_at DESC LIMIT $1`,
      [lim],
    );
    return { items: (r.rows as Array<Record<string, unknown>>).reverse() };
  }

  @Post()
  async send(@Body() body: {
    message: string;
    /** U20：图片附件（dataURL）——glm-4.5v 视觉通道；文本附件由前端解析后拼进 message，不走这里 */
    attachments?: Array<{ name: string; type: string; data: string }>;
  }): Promise<{ plan: ChatIntent }> {
    const message = String(body?.message ?? '').slice(0, 8000);
    // 图片附件校验：≤2 张、单张 dataURL ≤ 4MB（超限直接丢弃并标注，不阻塞对话）
    const images = (body?.attachments ?? [])
      .filter((a) => typeof a?.data === 'string' && a.data.startsWith('data:image/'))
      .slice(0, 2)
      .map((a) => a.data)
      .filter((d) => d.length <= 4 * 1024 * 1024);
    const llm = {
      apiKey: process.env.LLM_API_KEY ?? '',
      baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
    };

    // M1：插件上下文注入——enabled 插件的声明（schema 摘要/能力描述）拼进消息，AI 即刻具备插件带来的领域上下文
    let pluginContext = '';
    try {
      const pr = await this.exploreSvc.pg.query(
        `SELECT name, description, manifest FROM plugin WHERE status = 'enabled' AND kind IN ('custom','mcp') ORDER BY updated_at DESC LIMIT 8`,
      );
      const segs: string[] = [];
      for (const row of pr.rows as Array<{ name: string; description: string; manifest: Record<string, unknown> }>) {
        const manifest = (row.manifest ?? {}) as Record<string, unknown>;
        const cfg = (manifest.config ?? {}) as Record<string, unknown>;
        const schemaSummary = String(cfg.schemaSummary ?? '');
        const tools = ((manifest.tools ?? []) as Array<{ name?: string; description?: string }>)
          .map((t) => `${t.name}（${t.description ?? ''}）`).join('、');
        if (schemaSummary || tools) {
          segs.push(`· ${row.name}：${tools ? `工具 ${tools}` : ''}${schemaSummary ? `；Schema：${schemaSummary}` : ''}`);
        }
      }
      if (segs.length > 0) pluginContext = `\n\n[已装插件上下文——回答与规划时可利用]\n${segs.join('\n')}`;
    } catch { /* 插件上下文获取失败不阻塞对话 */ }
    const plan = await parseChatIntent(message || (images.length ? '请看图说话：这张图里是什么页面？可以怎么测试它？' : '你好'), llm, images, pluginContext);

    // 持久化：user + assistant 两条（card 由前端根据 dispatched 补，这里存 plan 摘要）
    await this.exploreSvc.ensureReady();
    await this.exploreSvc.pg.query(
      `INSERT INTO chat_message(session_id, role, content) VALUES('default', 'user', $1)`,
      [`${(body?.attachments ?? []).length > 0 ? `[附件 ${(body?.attachments ?? []).length} 个] ` : ''}${message}`],
    );
    await this.exploreSvc.pg.query(
      `INSERT INTO chat_message(session_id, role, content, card) VALUES('default', 'assistant', $1, $2::jsonb)`,
      [plan.reply, JSON.stringify({ action: plan.action, dispatched: (plan as { dispatched?: string }).dispatched ?? null, intent_text: plan.intent_text ?? null })],
    );

    // 服务端直接调度（异步）：explore / run_tests 立即触发，前端靠 WS 收进度
    if (plan.action === 'explore') {
      // LLM 可能照抄 prompt 里的旧端口（9000）——localhost 目标一律走当前 fixture 真实端口
      const raw = plan.target_url ?? this.runs.fixtureEntryUrl;
      const startUrl = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(raw) && raw !== this.runs.fixtureEntryUrl && !raw.includes(new URL(this.runs.fixtureEntryUrl).port)
        ? this.runs.fixtureEntryUrl
        : raw;
      void this.exploreSvc.explore(
        { startUrl, intent: plan.intent_text, credential: { username: 'admin', password: 'test123' } },
        (e) => this.exploreSvc.emit('explore.event', e),
      );
      (plan as ChatIntent & { dispatched?: string }).dispatched = 'explore';
    } else if (plan.action === 'run_tests') {
      void this.runs.trigger({});
      (plan as ChatIntent & { dispatched?: string }).dispatched = 'run';
    }

    return { plan };
  }
}
