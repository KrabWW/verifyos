import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { QaPointStore } from '@verifyos/agent-core';
import { ExploreService } from './explore.service';

@Controller('api')
export class QaPointsController {
  constructor(private readonly exploreSvc: ExploreService) {}

  @Get('qa-points')
  async qaPoints(@Query('applicationId') applicationId?: string) {
    await this.exploreSvc.ensureReady();
    const raw = (applicationId ?? '').trim();
    const appId = raw === '' ? 1 : Number(raw);
    if (!Number.isFinite(appId)) throw new BadRequestException('invalid id');
    const store = new QaPointStore(this.exploreSvc.pg);
    const rows = await store.list(appId);
    return { items: rows, kind: this.exploreSvc.kind };
  }

  /**
   * QA 点状态流转（B1 状态机守卫，J01 任务5）：
   * 合法矩阵 discovered→selected→generated，允许 selected→discovered 撤回、generated→selected 回退；
   * 禁止跳到 passed 等终态（终态由 Run 引擎写入，不走本端点）。
   * 非法值/非法流转 → 400 invalid transition；不存在 shortId → 404；无静默 fallback。
   */
  private static readonly QA_TRANSITIONS: Record<string, string[]> = {
    discovered: ['selected'],
    selected: ['discovered', 'generated'],
    generated: ['selected'],
  };

  @Put('qa-points/:shortId/status')
  async qaStatus(@Param('shortId') shortId: string, @Body() body: { status: string }) {
    await this.exploreSvc.ensureReady();
    const next = body?.status;
    if (typeof next !== 'string' || next === '') throw new BadRequestException('status required');
    const cur = await this.exploreSvc.pg.query(
      `SELECT status FROM qa_point WHERE short_id = $1 LIMIT 1`,
      [shortId],
    );
    if (cur.rows.length === 0) throw new NotFoundException('not found');
    const from = cur.rows[0].status as string;
    const canMove = from === next || (QaPointsController.QA_TRANSITIONS[from] ?? []).includes(next);
    if (!canMove) throw new BadRequestException(`invalid transition: ${from}→${next}`);
    await this.exploreSvc.pg.query(
      `UPDATE qa_point SET status = $2, updated_at = now() WHERE short_id = $1`,
      [shortId, next],
    );
    return { ok: true, status: next };
  }

  /** 删除 QA 点（详情抽屉操作）：:id 兼容数字主键与 short_id（前端列表只有 short_id）；不存在 → 404 */
  @Delete('qa-points/:id')
  async delQaPoint(@Param('id') id: string) {
    await this.exploreSvc.ensureReady();
    const r = await this.exploreSvc.pg.query(
      `DELETE FROM qa_point WHERE id::text = $1 OR short_id = $1 RETURNING id`,
      [id],
    );
    if (r.rows.length === 0) throw new NotFoundException('not found');
    return { ok: true };
  }

  /** Live Finding → QA 点（status=discovered，状态机起点；后续在 QA 点页确认） */
  @Post('qa-points/from-finding')
  async qaFromFinding(@Body() body: { title: string; risk?: string; detail?: string; explorationId?: number }) {
    await this.exploreSvc.ensureReady();
    if (!body?.title || !body.title.trim()) throw new BadRequestException('title required');
    const dup = await this.exploreSvc.pg.query(`SELECT id, short_id FROM qa_point WHERE title = $1 LIMIT 1`, [body.title]);
    if (dup.rows.length > 0) return { deduped: true, shortId: dup.rows[0].short_id };
    const shortId = `qa_${Math.random().toString(36).slice(2, 8)}`;
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO qa_point(short_id, application_id, title, category, risk, status, confidence, source)
       VALUES ($1, 1, $2, '探索发现', $3, 'discovered', 0.6, $4::jsonb) RETURNING id`,
      [shortId, body.title, body.risk ?? 'medium', JSON.stringify({ from: 'live-finding', detail: body.detail ?? '', explorationId: body.explorationId ?? null })],
    );
    return { ok: true, id: r.rows[0].id, shortId };
  }
}
