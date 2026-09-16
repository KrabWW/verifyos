import {
  Controller, Get, Post, Put, Body, Param, Query,
  BadRequestException, NotFoundException, HttpException, HttpStatus,
} from '@nestjs/common';
import { ExploreService } from './explore/explore.service';
import { DefectTracker } from './connectors/defect-tracker';

/** 问题库：MR 影响分析高风险自动转入 + 手动创建 + 状态流转（白名单 open|resolved|ignored） */
@Controller('api/issues')
export class IssuesController {
  constructor(private readonly exploreSvc: ExploreService, private readonly defects: DefectTracker) {}

  /** 数字 id 参数统一防护（J01 任务2）：NaN → 400 */
  private numericId(raw: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new BadRequestException('invalid id');
    return n;
  }

  @Get()
  async list(@Query('status') status?: string) {
    await this.exploreSvc.ensureReady();
    const r = await this.exploreSvc.pg.query(
      `SELECT id, short_id, title, severity, status, source, created_at, resolved_at
       FROM issue WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC`,
      [status ?? null],
    );
    return { items: r.rows };
  }

  /** 通用落库（webhook impact 高风险也会调用同逻辑，见 webhooks.controller） */
  @Post()
  async add(@Body() body: { title: string; severity?: string; source?: Record<string, unknown> }) {
    await this.exploreSvc.ensureReady();
    // 必填缺失 → 400（而非 PG NOT NULL 裸 500）
    if (!body?.title || !body.title.trim()) throw new BadRequestException('title required');
    // 同标题 open 去重
    const dup = await this.exploreSvc.pg.query(`SELECT id FROM issue WHERE title = $1 AND status = 'open' LIMIT 1`, [body.title]);
    if (dup.rows.length > 0) return { id: dup.rows[0].id, deduped: true };
    const shortId = `iss_${Math.random().toString(36).slice(2, 8)}`;
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO issue(short_id, application_id, title, severity, source)
       VALUES ($1, 1, $2, $3, $4::jsonb) RETURNING id`,
      [shortId, body.title, body.severity ?? 'medium', JSON.stringify(body.source ?? {})],
    );
    return { id: r.rows[0].id };
  }

  /** G11：全链路追溯——issue.source.runId 反查 run → verification → qa_point（查得到就填，查不到 null） */
  @Get(':id/trace')
  async trace(@Param('id') id: string) {
    await this.exploreSvc.ensureReady();
    const issueId = this.numericId(id);
    const q = await this.exploreSvc.pg.query(`SELECT source FROM issue WHERE id = $1 LIMIT 1`, [issueId]);
    if (q.rows.length === 0) return { found: false, run: null, verification: null, qa: null };
    const source = (q.rows[0].source ?? {}) as Record<string, unknown>;
    const runId = typeof source.runId === 'string' && source.runId ? source.runId : null;
    const empty = { run: null, verification: null, qa: null };
    if (!runId) return { found: true, ...empty };
    try {
      const r = await this.exploreSvc.pg.query(
        `SELECT r.short_id AS run_short_id, r.verdict,
                v.short_id AS ver_short_id, v.title AS ver_title,
                qa.short_id AS qa_short_id, qa.title AS qa_title
         FROM run r
         LEFT JOIN verification v ON v.id = r.verification_id
         LEFT JOIN qa_point qa ON qa.id = v.qa_point_id
         WHERE r.short_id = $1 LIMIT 1`,
        [runId],
      );
      if (r.rows.length === 0) return { found: true, ...empty };
      const row = r.rows[0] as {
        run_short_id: string; verdict: string | null;
        ver_short_id: string | null; ver_title: string | null;
        qa_short_id: string | null; qa_title: string | null;
      };
      return {
        found: true,
        run: { id: row.run_short_id, verdict: row.verdict ?? null },
        verification: row.ver_short_id ? { shortId: row.ver_short_id, title: row.ver_title ?? '' } : null,
        qa: row.qa_short_id ? { shortId: row.qa_short_id, title: row.qa_title ?? '' } : null,
      };
    } catch {
      return { found: true, ...empty };
    }
  }

  /** F13: 同步外部缺陷系统（禅道/Jira 真调 API，替代 Math.random 假 ID）：返回真实缺陷 ID 写入 source.external */
  @Post(':id/sync')
  async sync(@Param('id') id: string, @Body() body: { system?: string }) {
    await this.exploreSvc.ensureReady();
    const issueId = this.numericId(id);
    const sys = body?.system === 'jira' ? 'jira' : 'zentao';
    const q = await this.exploreSvc.pg.query(`SELECT title, severity, source FROM issue WHERE id = $1 LIMIT 1`, [issueId]);
    // 业务失败 → 404（body 保持 {ok:false,reason} 兼容前端特判）
    if (q.rows.length === 0) throw new HttpException({ ok: false, reason: 'issue 不存在' }, HttpStatus.NOT_FOUND);
    const row = q.rows[0] as { title: string; severity: string | null; source: Record<string, unknown> | null };
    // 真调缺陷系统（缺凭证 / API 失败在此抛 {ok:false,reason}，不再假装生成随机 ID）
    const { id: extId } = await this.defects.create(sys, {
      title: row.title,
      severity: row.severity,
      source: row.source ?? {},
    });
    const merged = { ...(row.source ?? {}), external: { system: sys, id: extId, syncedAt: new Date().toISOString() } };
    await this.exploreSvc.pg.query(`UPDATE issue SET source = $2::jsonb WHERE id = $1`, [issueId, JSON.stringify(merged)]);
    return { ok: true, system: sys, externalId: extId };
  }

  @Put(':id')
  async upd(@Param('id') id: string, @Body() body: { status?: string }) {
    await this.exploreSvc.ensureReady();
    const issueId = this.numericId(id);
    // 状态白名单（J01 任务6）：非法值 → 400（DB CHECK 原本会兜成 500）
    const next = body?.status;
    if (next !== 'open' && next !== 'resolved' && next !== 'ignored') {
      throw new BadRequestException(`invalid status: ${String(next)}`);
    }
    const resolved = next === 'resolved';
    const r = await this.exploreSvc.pg.query(
      `UPDATE issue SET status = $2, resolved_at = $3 WHERE id = $1 RETURNING id`,
      [issueId, next, resolved ? new Date().toISOString() : null],
    );
    // 0 行更新 → 404（不再假成功）
    if (r.rows.length === 0) throw new NotFoundException('not found');
    return { ok: true };
  }
}
