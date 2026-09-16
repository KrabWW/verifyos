import { Controller, Get, Query } from '@nestjs/common';
import { BUILTIN_TOOLS } from '@verifyos/shared';
import { ExploreService } from './explore/explore.service';

/** E2：概览 API（从 PostgreSQL 聚合——重启不丢） */
@Controller('api/overview')
export class OverviewController {
  constructor(private readonly exploreSvc: ExploreService) {}

  @Get()
  async overview(@Query('recentLimit') recentLimit?: string) {
    await this.exploreSvc.ensureReady();
    // H07 集成：recent 上限可配置（默认 8 保持兼容；执行历史屏传 200 拉全量）
    const rl = Math.min(200, Math.max(1, Number(recentLimit) || 8));
    const stats = await this.exploreSvc.pg.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE verdict = 'pass')::int AS passed,
         count(*) FILTER (WHERE verdict = 'unknown')::int AS unknown,
         count(*) FILTER (WHERE verdict = 'fail')::int AS failed
       FROM run`,
    );
    const recent = await this.exploreSvc.pg.query(
      `SELECT r.short_id, r.verdict, r.duration_ms, (r.output->>'llmCalls')::int AS llm_calls, r.created_at, r.output, r.trigger,
              v.short_id AS ver_short_id, v.title AS ver_title
       FROM run r LEFT JOIN verification v ON v.id = r.verification_id
       ORDER BY r.id DESC LIMIT $1`,
      [rl],
    );
    const qa = await this.exploreSvc.pg.query(`SELECT count(*)::int AS n FROM qa_point`);
    // F10: 按日趋势（近 14 天）+ PR 验证次数 + 未覆盖 high 流程
    const trend = await this.exploreSvc.pg.query(
      `SELECT to_char(created_at, 'MM-DD') AS day, min(created_at)::date AS d,
              count(*) FILTER (WHERE verdict = 'pass')::int AS pass,
              count(*) FILTER (WHERE verdict = 'unknown')::int AS unknown,
              count(*) FILTER (WHERE verdict = 'fail')::int AS fail
       FROM run WHERE created_at > now() - interval '14 days'
       GROUP BY 1, created_at::date ORDER BY 2`,
    );
    const prRuns = await this.exploreSvc.pg.query(`SELECT count(*)::int AS n FROM run WHERE trigger = 'pr'`);
    let uncoveredHigh: Array<{ path: string; title: string | null }> = [];
    try {
      const highNodes = await this.exploreSvc.pg.query(
        `SELECT ref, title FROM graph_node WHERE application_id = 1 AND type = 'page' AND meta->>'intentBand' = 'high'`,
      );
      const vers = await this.exploreSvc.pg.query(`SELECT steps FROM verification`);
      const pathOf = (u: string) => (u ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
      const covered = new Set<string>();
      for (const v of vers.rows as Array<{ steps: Array<{ targetRef?: string; assert?: { kind?: string; value?: string } }> }>) {
        for (const s of v.steps ?? []) {
          if (s.targetRef) covered.add(pathOf(s.targetRef));
          if (s.assert?.kind === 'url_contains' && s.assert.value) covered.add(pathOf(s.assert.value));
        }
      }
      uncoveredHigh = (highNodes.rows as Array<{ ref: string; title: string | null }>)
        .filter((n) => !covered.has(pathOf(n.ref)))
        .map((n) => ({ path: pathOf(n.ref) || '/', title: n.title }))
        // J02：同 path 多端口重复节点只报一次
        .filter((n, i, arr) => arr.findIndex((m) => m.path === n.path) === i);
    } catch (e) {
      console.warn('[overview] uncoveredHigh 计算失败:', e instanceof Error ? e.message : e);
    }
    const s = stats.rows[0] as { total: number; passed: number; unknown: number; failed: number };

    // G04: 验证覆盖率（当前值 + 近 8 周按日趋势）——复用 graph/coverage 的触达集匹配逻辑
    // J02：graph_node 现有 created_at 列（migrations/002）；分母按 path 去重（同 path 多端口节点只计一次，covered 任一即可）
    type PageNode = { ref: string; created_at: string | Date };
    type VerRow = { created_at: string | Date; steps: Array<{ targetRef?: string; assert?: { kind?: string; value?: string } }> };
    let coveragePct = 0;
    let coverageTrend: Array<{ day: string; pct: number }> = [];
    let coveragePaths: Array<{ path: string; covered: boolean; firstSeenAt: string | Date }> = [];
    try {
      const pathOf = (u: string) => (u ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
      const nodes = await this.exploreSvc.pg.query(
        `SELECT ref, created_at FROM graph_node WHERE application_id = 1 AND type = 'page' ORDER BY created_at`,
      );
      const vers = await this.exploreSvc.pg.query(`SELECT steps, created_at FROM verification ORDER BY created_at`);
      const nodeRows = nodes.rows as PageNode[];
      const verRows = vers.rows as VerRow[];
      const coveredOf = (uptoMs: number) => {
        const covered = new Set<string>();
        for (const v of verRows) {
          if (new Date(v.created_at).getTime() > uptoMs) continue;
          for (const st of v.steps ?? []) {
            if (st.targetRef) covered.add(pathOf(st.targetRef));
            if (st.assert?.kind === 'url_contains' && st.assert.value) covered.add(pathOf(st.assert.value));
          }
        }
        return covered;
      };
      // path 维度汇总：原始节点保留在 refs 中，出现时间取同 path 最早 created_at
      const byPath = new Map<string, { firstMs: number; refs: string[] }>();
      for (const n of nodeRows) {
        const p = pathOf(n.ref);
        const ms = new Date(n.created_at).getTime();
        const cur = byPath.get(p);
        if (cur) {
          cur.firstMs = Math.min(cur.firstMs, ms);
          cur.refs.push(n.ref);
        } else {
          byPath.set(p, { firstMs: ms, refs: [n.ref] });
        }
      }
      // 当前覆盖率（截至现在）：分母 = 去重后的 path 数
      const nowCovered = coveredOf(Date.now());
      const pathEntries = [...byPath.entries()];
      coveragePct = pathEntries.length
        ? Math.round((pathEntries.filter(([p]) => nowCovered.has(p)).length / pathEntries.length) * 100)
        : 0;
      coveragePaths = pathEntries
        .map(([p, { firstMs }]) => ({ path: p || '/', covered: nowCovered.has(p), firstSeenAt: new Date(firstMs) }))
        .sort((a, b) => a.path.localeCompare(b.path));
      // 近 8 周按日分桶：截至该日 24:00 出现的 path / 已覆盖 path 快照
      const DAY = 86400e3;
      const today = new Date(); today.setHours(23, 59, 59, 999);
      const days: Array<{ day: string; uptoMs: number }> = [];
      for (let i = 55; i >= 0; i--) {
        const d = new Date(today.getTime() - i * DAY);
        days.push({ day: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, uptoMs: d.getTime() });
      }
      coverageTrend = days.map(({ day, uptoMs }) => {
        const covered = coveredOf(uptoMs);
        const paths = pathEntries.filter(([, { firstMs }]) => firstMs <= uptoMs);
        const matched = paths.filter(([p]) => covered.has(p)).length;
        return { day, pct: paths.length ? Math.round((matched / paths.length) * 100) : 0 };
      });
    } catch (e) {
      console.warn('[overview] coverage 计算失败:', e instanceof Error ? e.message : e);
    }

    return {
      tools: { total: BUILTIN_TOOLS.length },
      qaPoints: qa.rows[0].n as number,
      runs: { total: s.total, passed: s.passed, unknown: s.unknown, failed: s.failed },
      recent: (recent.rows as Array<Record<string, unknown>>).map((r) => ({
        runId: r.short_id,
        verdict: r.verdict,
        durationMs: Number(r.duration_ms ?? 0),
        llmCalls: r.llm_calls ?? 0,
        createdAt: r.created_at,
        device: (r.output as Record<string, unknown> | null)?.device ?? null,
        trigger: (r.trigger as string) ?? 'manual',
        verShortId: (r.ver_short_id as string) ?? null,
        verTitle: (r.ver_title as string) ?? null,
      })),
      trend: trend.rows,
      prRuns: (prRuns.rows[0] as { n: number }).n,
      uncoveredHigh,
      coveragePct,
      coverageTrend,
      // J02：path 维度汇总（raw 节点仍可在 /api/graph 查询；此处分母按 path 去重）
      coveragePaths,
    };
  }
}
