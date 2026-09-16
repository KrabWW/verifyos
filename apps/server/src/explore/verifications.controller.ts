import {
  Controller, Get, Post, Put, Body, Param, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ExploreService } from './explore.service';
import { RunsService } from '../runs/runs.service';

@Controller('api')
export class VerificationsController {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly runs: RunsService,
  ) {}

  /** 数字 id 参数统一防护（J01 任务2）：NaN → 400 */
  private numericId(raw: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new BadRequestException('invalid id');
    return n;
  }

  /** QA 点 → 验证生成（探索→执行最后一公里）：从 QA 点构造步骤（登录前置 + 断言 + targetRef），可一键触发 */
  @Post('verifications')
  async genVerification(@Body() body: { qaShortId: string; trigger?: boolean }) {
    await this.exploreSvc.ensureReady();
    const qa = await this.exploreSvc.pg.query(
      `SELECT id, title, category, risk, source FROM qa_point WHERE short_id = $1 LIMIT 1`,
      [body.qaShortId],
    );
    if (qa.rows.length === 0) return { found: false };
    const row = qa.rows[0] as { id: number; title: string; category: string; source: Record<string, unknown> };
    const sourceUrl = String(row.source?.sourceUrl ?? '');
    const pathHint = sourceUrl.replace(/^https?:\/\/[^/]+/, '') || 'list.html';

    const steps = [
      {
        id: 'st_01', title: '管理员登录', kind: 'module',
        actions: [
          { type: 'fill', selector: '#username', value: 'admin' },
          { type: 'fill', selector: '#password', value: 'test123' },
          { type: 'click', selector: 'button[type="submit"]' },
        ],
      },
      {
        id: 'st_02', title: row.title, kind: 'assertion',
        assert: { kind: 'url_contains', value: pathHint.replace(/^\//, '') },
        targetRef: pathHint.replace(/^\//, ''),
      },
    ];
    const shortId = `ver_${Math.random().toString(36).slice(2, 8)}`;
    const actor = String(row.source?.actor ?? '管理员');
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO verification(short_id, qa_point_id, title, actor, steps, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'ready') RETURNING id`,
      [shortId, row.id, row.title, actor, JSON.stringify(steps)],
    );
    const verificationId = r.rows[0].id as number;
    // F5: QA 状态机流转（生成验证后 → generated）
    await this.exploreSvc.pg.query(`UPDATE qa_point SET status = 'generated', updated_at = now() WHERE id = $1`, [row.id]);

    let runId: string | undefined;
    if (body?.trigger) {
      const trigger = await this.runs.trigger({ steps: steps as never });
      runId = (trigger as { runId?: string }).runId;
    }
    return { found: true, verificationId, shortId, steps, runId };
  }

  // ---------- F6：验证编辑器（列表 / 详情 / 步骤保存 / 空白新建） ----------

  /** 空白验证挂靠的「手工」QA 锚点（qa_point_id NOT NULL 约束下的诚实方案） */
  private async manualQaAnchorId(): Promise<number> {
    const q = await this.exploreSvc.pg.query(`SELECT id FROM qa_point WHERE short_id = 'qa_manual' LIMIT 1`);
    if (q.rows.length > 0) return q.rows[0].id as number;
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO qa_point(short_id, application_id, title, category, status, confidence, source)
       VALUES ('qa_manual', 1, '手工创建（验证编辑器入口）', '正常流程', 'selected', 1.0, '{"manual":true}'::jsonb)
       RETURNING id`,
    );
    return r.rows[0].id as number;
  }

  @Get('verifications')
  async listVerifications() {
    await this.exploreSvc.ensureReady();
    const r = await this.exploreSvc.pg.query(
      `SELECT v.id, v.short_id, v.title, v.actor, v.status, v.steps,
              q.short_id AS qa_short_id, q.title AS qa_title
       FROM verification v LEFT JOIN qa_point q ON q.id = v.qa_point_id
       ORDER BY v.updated_at DESC LIMIT 200`,
    );
    return { items: r.rows };
  }

  @Get('verifications/:id')
  async getVerification(@Param('id') id: string) {
    await this.exploreSvc.ensureReady();
    const r = await this.exploreSvc.pg.query(
      `SELECT v.id, v.short_id, v.title, v.actor, v.status, v.steps,
              q.short_id AS qa_short_id, q.title AS qa_title
       FROM verification v LEFT JOIN qa_point q ON q.id = v.qa_point_id
       WHERE v.id = $1 LIMIT 1`,
      [Number(id)],
    );
    if (r.rows.length === 0) return { found: false };
    return { found: true, ...r.rows[0] };
  }

  /** 空白验证：预填登录模块 + 断言步骤（编辑器里改成目标行为） */
  @Post('verifications/blank')
  async createBlank(@Body() body: { title?: string; actor?: string }) {
    await this.exploreSvc.ensureReady();
    const qaId = await this.manualQaAnchorId();
    const shortId = `ver_${Math.random().toString(36).slice(2, 8)}`;
    const steps = [
      {
        id: 'st_01', title: '管理员登录', kind: 'module',
        actions: [
          { type: 'fill', selector: '#username', value: 'admin' },
          { type: 'fill', selector: '#password', value: 'test123' },
          { type: 'click', selector: 'button[type="submit"]' },
        ],
      },
      {
        id: 'st_02', title: '新断言步骤', kind: 'assertion',
        assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html',
      },
    ];
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO verification(short_id, qa_point_id, title, actor, steps, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'draft') RETURNING id, short_id`,
      [shortId, qaId, body?.title?.trim() || '手工验证', body?.actor?.trim() || '管理员', JSON.stringify(steps)],
    );
    return { found: true, id: r.rows[0].id, shortId: r.rows[0].short_id, steps };
  }

  /** 保存步骤（含标题/角色）：status 流转 draft→ready；不存在 → 404（0 行更新不再假成功） */
  @Put('verifications/:id/steps')
  async putSteps(@Param('id') id: string, @Body() body: { title?: string; actor?: string; steps?: unknown[] }) {
    await this.exploreSvc.ensureReady();
    const verId = this.numericId(id);
    const sets: string[] = [`updated_at = now()`];
    const vals: unknown[] = [verId];
    if (body?.title != null) { sets.push(`title = $${vals.length + 1}`); vals.push(String(body.title)); }
    if (body?.actor != null) { sets.push(`actor = $${vals.length + 1}`); vals.push(String(body.actor)); }
    if (Array.isArray(body?.steps)) {
      sets.push(`steps = $${vals.length + 1}::jsonb`);
      vals.push(JSON.stringify(body.steps));
      sets.push(`status = 'ready'`);
    }
    if (sets.length === 1) return { ok: false, reason: 'no fields to update' };
    // RETURNING id：无 RETURNING 的 UPDATE 在 node-pg 里 rows 恒为空，会把存在的 id 误判 404（保存并运行永远短路的根因）
    const r = await this.exploreSvc.pg.query(`UPDATE verification SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, vals);
    if (r.rows.length === 0) throw new NotFoundException('not found');
    return { ok: true };
  }
}
