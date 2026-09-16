import { Controller, Get, Query } from '@nestjs/common';
import { GraphStore } from '@verifyos/agent-core';
import { ExploreService } from './explore.service';

@Controller('api')
export class GraphController {
  constructor(private readonly exploreSvc: ExploreService) {}

  @Get('graph')
  async graph(@Query('applicationId') applicationId?: string) {
    await this.exploreSvc.ensureReady();
    const store = new GraphStore(this.exploreSvc.pg);
    return { found: true, kind: this.exploreSvc.kind, ...(await store.loadGraph(Number(applicationId ?? 1))) };
  }

  // ---------- F9: 地图覆盖率 + 节点关联 ----------
  @Get('graph/coverage')
  async graphCoverage() {
    await this.exploreSvc.ensureReady();
    const nodes = await this.exploreSvc.pg.query(
      `SELECT ref, title, meta FROM graph_node WHERE application_id = 1 AND type = 'page' ORDER BY id`,
    );
    const vers = await this.exploreSvc.pg.query(`SELECT id, short_id, steps FROM verification`);
    const runs = await this.exploreSvc.pg.query(
      `SELECT verification_id, verdict, created_at FROM run ORDER BY created_at ASC NULLS LAST`,
    );
    const qas = await this.exploreSvc.pg.query(`SELECT short_id, title, status, source FROM qa_point`);
    const pathOf = (u: string) => (u ?? '').replace(/^https?:\/\/[^/]+/, '') || '/';

    // 验证触达集：steps[].targetRef + url_contains 断言值（都按 path 归一）
    const coveredPaths = new Set<string>();
    const pathsByVer = new Map<number, Set<string>>();
    for (const v of vers.rows as Array<{ id: number; steps: Array<{ targetRef?: string; assert?: { kind?: string; value?: string } }> }>) {
      const paths = new Set<string>();
      for (const s of v.steps ?? []) {
        if (s.targetRef) { coveredPaths.add(pathOf(s.targetRef).replace(/^\//, '')); paths.add(pathOf(s.targetRef).replace(/^\//, '')); }
        if (s.assert?.kind === 'url_contains' && s.assert.value) { coveredPaths.add(pathOf(s.assert.value).replace(/^\//, '')); paths.add(pathOf(s.assert.value).replace(/^\//, '')); }
      }
      pathsByVer.set(v.id, paths);
    }
    // G03：按 verification 关联 run，得到每 path 的判定序列（时间升序）→ 最近判定 + 失败次数
    const verdictsByPath = new Map<string, Array<string | null>>();
    for (const r of runs.rows as Array<{ verification_id: number | null; verdict: string | null }>) {
      if (r.verification_id == null) continue;
      for (const p of pathsByVer.get(r.verification_id) ?? []) {
        verdictsByPath.set(p, [...(verdictsByPath.get(p) ?? []), r.verdict]);
      }
    }
    const statsByPath = new Map<string, { lastVerdict: string | null; failCount: number }>();
    for (const [p, list] of verdictsByPath) {
      statsByPath.set(p, { lastVerdict: list[list.length - 1] ?? null, failCount: list.filter((x) => x === 'fail').length });
    }
    // QA 关联：source.sourceUrl 按 path 匹配
    const qaByPath = new Map<string, Array<{ shortId: string; title: string; status: string }>>();
    for (const q of qas.rows as Array<{ short_id: string; title: string; status: string; source: Record<string, unknown> }>) {
      const p = pathOf(String(q.source?.sourceUrl ?? '')).replace(/^\//, '');
      if (!p) continue;
      qaByPath.set(p, [...(qaByPath.get(p) ?? []), { shortId: q.short_id, title: q.title, status: q.status }]);
    }

    const out = (nodes.rows as Array<{ ref: string; title: string | null; meta: Record<string, unknown> }>).map((n) => {
      const p = pathOf(n.ref).replace(/^\//, '');
      const covered = coveredPaths.has(p);
      const related = qaByPath.get(p) ?? [];
      const vstat = statsByPath.get(p) ?? null;
      return {
        ref: n.ref, path: p || '/', title: n.title, intentBand: n.meta?.intentBand ?? null,
        covered, qa: related,
        lastVerdict: vstat?.lastVerdict ?? null, failCount: vstat?.failCount ?? 0,
      };
    });
    const matched = out.filter((n) => n.covered).length;
    return {
      coverage: { total: out.length, matched, pct: out.length ? Math.round((matched / out.length) * 100) : 0 },
      nodes: out,
    };
  }
}
