import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { DEMO_STEPS, RunsService } from './runs.service';
import { ExploreService } from '../explore/explore.service';
import type { StepDef } from '@verifyos/agent-core';

@Controller('api/runs')
export class RunsController {
  constructor(private readonly runs: RunsService, private readonly exploreSvc: ExploreService) {}

  /** 步骤定义（前端三列页左列） */
  @Get('steps')
  steps() {
    return { steps: DEMO_STEPS };
  }

  @Post()
  async trigger(@Body() body: { startUrl?: string; steps?: StepDef[]; device?: string; verificationShortId?: string }) {
    return this.runs.trigger({ startUrl: body?.startUrl, steps: body?.steps, device: body?.device, verificationShortId: body?.verificationShortId });
  }

  /** 编辑器试运行：同步跑到 upto 步（含）返回截图/步骤结果/ai 定位候选（不落 run 表、不广播） */
  @Post('dry-run')
  async dryRun(@Body() body: { steps?: StepDef[]; startUrl?: string; upto?: number }) {
    try {
      return await this.runs.dryRun({ steps: body?.steps ?? [], startUrl: body?.startUrl, upto: body?.upto });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 历史 Run 事件流回放（从 PG output->events 读） */
  @Get(':id/events')
  async events(@Param('id') id: string) {
    const o = this.runs.get(id);
    if (o) return { found: true, events: o.events, source: 'memory' };
    // 内存没有 → 从 PG 读（重启后的历史 Run）
    try {
      await this.exploreSvc.ensureReady(); // 懒初始化连接池（否则 pool 未初始化会抛错）
      const r = await this.exploreSvc.pg.query(`SELECT output FROM run WHERE short_id = $1 LIMIT 1`, [id]);
      if (r.rows.length === 0) return { found: false };
      const events = ((r.rows[0].output as Record<string, unknown>)?.events ?? []) as unknown[];
      return { found: true, events, source: 'pg' };
    } catch {
      return { found: false };
    }
  }

  /** Run 结果（含 C3 触达校验明细）；内存 miss 后 PG 回退（重启后的历史 Run，对照 events 端点模式） */
  @Get(':id')
  async get(@Param('id') id: string) {
    const o = this.runs.get(id);
    if (o) {
      return {
        found: true,
        verShortId: this.runs.getRunVer(id) ?? null,
        verdict: o.verdict,
        llmCalls: o.llmCalls,
        cache: o.cache,
        durationMs: o.durationMs,
        failedStep: o.failedStep,
        failureSummary: o.failureSummary,
        stepResults: o.stepResults,
        visitedUrls: o.visitedUrls,
        reachability: o.reachability,
        evidenceKeys: o.evidenceKeys,
      };
    }
    // PG 回退：形状与内存版一致（steps 从 events 的 step.completed 重建）
    try {
      await this.exploreSvc.ensureReady(); // 懒初始化连接池（否则 pool 未初始化会抛错）
      const r = await this.exploreSvc.pg.query(`SELECT verdict, duration_ms, failure_summary, output FROM run WHERE short_id = $1 LIMIT 1`, [id]);
      if (r.rows.length === 0) return { found: false };
      const row = r.rows[0] as { verdict: string; duration_ms: number | null; failure_summary: string | null; output: Record<string, unknown> };
      const output = row.output ?? {};
      const events = (output.events as { type?: string; stepId?: string; verdict?: string; durationMs?: number; llmCalls?: number; cacheHit?: boolean }[]) ?? [];
      const stepResults = events
        .filter((e) => e.type === 'step.completed' && e.stepId)
        .map((e) => ({ id: e.stepId as string, verdict: e.verdict ?? 'unknown', llmCalls: e.llmCalls ?? 0, cacheHit: e.cacheHit ?? false, durationMs: e.durationMs ?? 0 }));
      const failedStep = events.find((e) => e.type === 'step.completed' && e.verdict === 'fail')?.stepId;
      // U22：PG 兜底查关联验证 short_id
      let verShortId: string | null = null;
      try {
        const vr = await this.exploreSvc.pg.query(
          `SELECT v.short_id AS ver FROM run r JOIN verification v ON r.verification_id = v.id WHERE r.short_id = $1 LIMIT 1`,
          [id],
        );
        verShortId = (vr.rows[0]?.ver as string) ?? null;
      } catch { /* 关联缺失不阻塞详情 */ }
      return {
        found: true,
        verShortId,
        verdict: row.verdict ?? 'unknown',
        llmCalls: (output.llmCalls as number) ?? 0,
        cache: (output.cache as { entries: number; totalHits: number }) ?? { entries: 0, totalHits: 0 },
        durationMs: Number(row.duration_ms ?? 0),
        failedStep,
        failureSummary: row.failure_summary ?? undefined,
        stepResults,
        visitedUrls: (output.visitedUrls as string[]) ?? [],
        reachability: (output.reachability as { stepId: string; verdict: string; explanation: string; matchedUrl?: string }[]) ?? [],
        evidenceKeys: (output.evidenceKeys as string[]) ?? [],
      };
    } catch {
      return { found: false };
    }
  }

  /** 证据端点：无 key → 证据列表 {found,runId,keys:[{key,kind,bytes}]}（J04，对照磁盘 out/evidence/<runId>/ 枚举）；
   *  有 key → 单文件下钻（/api/runs/:id/evidence?key=<key>；key 含 / 用 query 传，通配路由 Nest11/Express5 不兼容，Triage/执行页在用） */
  @Get(':id/evidence')
  async evidence(@Param('id') id: string, @Query('key') key: string, @Res() res: Response) {
    if (!key) {
      const keys = this.runs.evidenceList(id);
      if (keys === null) {
        // 磁盘无该 run 目录 → 区分「run 不存在」（内存/PG 都查无）与「run 存在但无证据」
        const existsMem = this.runs.get(id) !== undefined;
        let existsPg = false;
        if (!existsMem) {
          try {
            await this.exploreSvc.ensureReady();
            const r = await this.exploreSvc.pg.query(`SELECT 1 FROM run WHERE short_id = $1 LIMIT 1`, [id]);
            existsPg = r.rows.length > 0;
          } catch {
            existsPg = false;
          }
        }
        if (!existsMem && !existsPg) return res.status(404).json({ error: 'run not found' });
        return res.json({ found: true, runId: id, keys: [] });
      }
      return res.json({ found: true, runId: id, keys });
    }
    const file = this.runs.evidencePath(key);
    if (!file) return res.status(404).json({ error: 'not found' });
    res.sendFile(file);
  }

  /** Run 报告导出（Markdown）：内存命中全量明细；PG 回退从 events 重建步骤表 */
  @Get(':id/report')
  async report(@Param('id') id: string, @Res() res: Response) {
    const mem = this.runs.get(id);
    type StepRow = { id: string; verdict: string; llmCalls: number; cacheHit: boolean; durationMs: number };
    let verdict = 'unknown';
    let durationMs = 0;
    let llmCalls = 0;
    let cache: { entries: number; totalHits: number } = { entries: 0, totalHits: 0 };
    let failureSummary: string | undefined;
    let steps: StepRow[] = [];
    let visitedUrls: string[] = [];
    let reachability: { stepId: string; verdict: string; explanation: string; matchedUrl?: string }[] = [];
    let evidenceKeys: string[] = [];
    let device: string | null = null;
    let source: 'memory' | 'pg' = 'memory';

    if (mem) {
      verdict = mem.verdict;
      durationMs = mem.durationMs;
      llmCalls = mem.llmCalls;
      cache = mem.cache;
      failureSummary = mem.failureSummary;
      steps = mem.stepResults.map((s) => ({ id: s.id, verdict: s.verdict, llmCalls: s.llmCalls, cacheHit: s.cacheHit, durationMs: s.durationMs }));
      visitedUrls = mem.visitedUrls;
      reachability = mem.reachability;
      evidenceKeys = mem.evidenceKeys;
    } else {
      // PG 回退：output jsonb + 从 events 的 step.completed 重建步骤表
      try {
        await this.exploreSvc.ensureReady(); // 懒初始化连接池（否则 pool 未初始化会抛错）
        const r = await this.exploreSvc.pg.query(`SELECT verdict, duration_ms, failure_summary, output FROM run WHERE short_id = $1 LIMIT 1`, [id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'run not found' });
        const row = r.rows[0] as { verdict: string; duration_ms: number | null; failure_summary: string | null; output: Record<string, unknown> };
        const output = row.output ?? {};
        verdict = row.verdict ?? 'unknown';
        durationMs = row.duration_ms ?? 0;
        failureSummary = row.failure_summary ?? undefined;
        llmCalls = (output.llmCalls as number) ?? 0;
        cache = (output.cache as { entries: number; totalHits: number }) ?? { entries: 0, totalHits: 0 };
        device = (output.device as string) ?? null;
        evidenceKeys = (output.evidenceKeys as string[]) ?? [];
        visitedUrls = (output.visitedUrls as string[]) ?? [];
        reachability = (output.reachability as { stepId: string; verdict: string; explanation: string; matchedUrl?: string }[]) ?? [];
        const events = (output.events as { type?: string; stepId?: string; verdict?: string; durationMs?: number; llmCalls?: number; cacheHit?: boolean }[]) ?? [];
        steps = events
          .filter((e) => e.type === 'step.completed' && e.stepId)
          .map((e) => ({ id: e.stepId as string, verdict: e.verdict ?? 'unknown', llmCalls: e.llmCalls ?? 0, cacheHit: e.cacheHit ?? false, durationMs: e.durationMs ?? 0 }));
        source = 'pg';
      } catch {
        return res.status(404).json({ error: 'run not found' });
      }
    }

    const icon = (v: string) => (v === 'pass' ? '✅' : v === 'fail' ? '❌' : '⚠️');
    const lines: string[] = [];
    lines.push(`# VerifyOS Run 报告 · ${id}`);
    lines.push('');
    lines.push(`> 来源：${source === 'memory' ? '实时执行结果' : 'PG 历史归档（events 重建）'} · 生成时间 ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`## 结论`);
    lines.push('');
    lines.push(`| 指标 | 值 |`);
    lines.push(`| --- | --- |`);
    lines.push(`| 判定 | ${icon(verdict)} ${verdict.toUpperCase()} |`);
    lines.push(`| 耗时 | ${(durationMs / 1000).toFixed(1)}s |`);
    lines.push(`| LLM 调用 | ${llmCalls} 次 |`);
    lines.push(`| 定位缓存 | ${cache.entries} 条 / 命中 ${cache.totalHits} 次 |`);
    if (device) lines.push(`| 设备 | ${device} |`);
    lines.push(`| 证据文件 | ${evidenceKeys.length} 个 |`);
    lines.push('');
    if (failureSummary) {
      lines.push(`**失败摘要**：${failureSummary}`);
      lines.push('');
    }
    lines.push(`## 步骤明细（${steps.length}）`);
    lines.push('');
    lines.push(`| # | 步骤 | 判定 | LLM | 缓存 | 耗时 |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    steps.forEach((s, i) => {
      lines.push(`| ${i + 1} | ${s.id} | ${icon(s.verdict)} ${s.verdict} | ${s.llmCalls} | ${s.cacheHit ? '命中' : '-'} | ${(s.durationMs / 1000).toFixed(1)}s |`);
    });
    lines.push('');
    if (reachability.length > 0) {
      lines.push(`## 触达校验（UNKNOWN ≠ PASS）`);
      lines.push('');
      lines.push(`| 步骤 | 判定 | 说明 |`);
      lines.push(`| --- | --- | --- |`);
      for (const r0 of reachability) {
        lines.push(`| ${r0.stepId} | ${icon(r0.verdict)} ${r0.verdict} | ${r0.explanation}${r0.matchedUrl ? `（命中 ${r0.matchedUrl}）` : ''} |`);
      }
      lines.push('');
    }
    if (visitedUrls.length > 0) {
      lines.push(`## 实际触达 URL（${visitedUrls.length}）`);
      lines.push('');
      for (const u of visitedUrls) lines.push(`- ${u}`);
      lines.push('');
    }
    if (evidenceKeys.length > 0) {
      lines.push(`## 证据附件`);
      lines.push('');
      lines.push(`附件随报告一并归档（共 ${evidenceKeys.length} 个）：`);
      lines.push('');
      for (const k of evidenceKeys) lines.push(`- \`${k}\``);
      lines.push('');
    }
    lines.push(`---`);
    lines.push(`*Generated by VerifyOS*`);

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-report.md"`);
    res.send(lines.join('\n'));
  }
}

