import type { CrawlResult } from './crawler.js';

interface PgLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

// ---------- Intent Score（v1 启发式；C 系将替换为 LLM 评估并落 exploration_iteration.intent_score） ----------

export type IntentBand = 'low' | 'mid' | 'high';

/** qa.tech 分档：0-40 低 / 41-70 中 / 71-100 高 */
export function bandOf(score: number): IntentBand {
  return score <= 40 ? 'low' : score <= 70 ? 'mid' : 'high';
}

/**
 * v1 启发式打分：intent 关键词（中英文分词按空白/逗号切）在页面 title/headings/链接文本中的命中率。
 * 基础分 30 + 命中率 × 70。LLM 版接入点已预留（GraphStore.saveCrawlGraph 的 intentScores 覆盖参数）。
 */
export function scoreIntent(
  intent: string,
  page: { title: string; headings: string[]; links: string[] },
): number {
  if (!intent.trim()) return 50;
  const keywords = intent
    .toLowerCase()
    .split(/[\s,，、;；/]+/)
    .filter((w) => w.length >= 2);
  if (keywords.length === 0) return 50;
  const haystack = [page.title, ...page.headings, ...page.links].join(' ').toLowerCase();
  let hits = 0;
  for (const k of keywords) if (haystack.includes(k)) hits++;
  return Math.round(Math.min(100, 30 + (hits / keywords.length) * 70));
}

// ---------- GraphStore ----------

export interface GraphNodeRow {
  id: number;
  type: string;
  ref: string;
  title: string | null;
  meta: Record<string, unknown>;
}

export interface GraphEdgeRow {
  fromRef: string;
  toRef: string;
  action: string;
}

/**
 * Coverage Graph v1（B4）：爬取结果落 PG（page 节点 + navigate 边）。
 * 幂等：节点 UNIQUE(application_id,type,ref) UPSERT；边 UNIQUE(from,to,action) DO NOTHING。
 */
export class GraphStore {
  constructor(private readonly pool: PgLike) {}

  async saveCrawlGraph(input: {
    applicationId: number;
    result: CrawlResult;
    intent?: string;
    explorationId?: number;
    /** 外部已算好的分数（如 LLM 评估）按 URL 覆盖启发式 */
    intentScores?: Map<string, number>;
  }): Promise<{ nodes: number; edges: number }> {
    const { applicationId, result, intent = '', explorationId, intentScores } = input;
    const idByUrl = new Map<string, number>();
    let nodes = 0;
    let edges = 0;

    for (const page of result.pages) {
      const score = intentScores?.get(page.url) ?? scoreIntent(intent, page);
      const meta = {
        depth: page.depth,
        headings: page.headings,
        interactive: page.interactive,
        loginWall: page.loginWall,
        intentScore: score,
        intentBand: bandOf(score),
        explorationId: explorationId ?? null,
        lastSeenAt: new Date().toISOString(),
      };
      const r = await this.pool.query(
        `INSERT INTO graph_node(application_id, type, ref, title, meta)
         VALUES ($1, 'page', $2, $3, $4::jsonb)
         ON CONFLICT (application_id, type, ref)
         DO UPDATE SET title = EXCLUDED.title, meta = EXCLUDED.meta
         RETURNING id`,
        [applicationId, page.url, page.title, JSON.stringify(meta)],
      );
      idByUrl.set(page.url, r.rows[0].id as number);
      nodes++;
    }

    for (const e of result.edges) {
      const fromId = idByUrl.get(e.from);
      const toId = idByUrl.get(e.to);
      if (!fromId || !toId) continue; // 边端点未被爬取（如被去重的重定向源 URL）
      // SELECT-then-INSERT：pg-mem 的 ON CONFLICT DO NOTHING RETURNING 在冲突时仍返回行（行为差异），
      // 存在性预判在真实 PG 与 pg-mem 下语义一致；唯一约束兜底防并发重复。
      const exists = await this.pool.query(
        `SELECT 1 FROM graph_edge WHERE from_node = $1 AND to_node = $2 AND action = 'navigate' LIMIT 1`,
        [fromId, toId],
      );
      if (exists.rows.length > 0) continue;
      await this.pool.query(
        `INSERT INTO graph_edge(application_id, from_node, to_node, action)
         VALUES ($1, $2, $3, 'navigate')
         ON CONFLICT (from_node, to_node, action) DO NOTHING`,
        [applicationId, fromId, toId],
      );
      edges++;
    }

    return { nodes, edges };
  }

  /** 应用地图数据源：节点 + 边（带 ref 便于前端直接渲染） */
  async loadGraph(applicationId: number): Promise<{ nodes: GraphNodeRow[]; edges: GraphEdgeRow[] }> {
    const n = await this.pool.query(
      `SELECT id, type, ref, title, meta FROM graph_node WHERE application_id = $1 ORDER BY id`,
      [applicationId],
    );
    const e = await this.pool.query(
      `SELECT fn.ref AS "fromRef", tn.ref AS "toRef", ge.action
       FROM graph_edge ge
       JOIN graph_node fn ON fn.id = ge.from_node
       JOIN graph_node tn ON tn.id = ge.to_node
       WHERE ge.application_id = $1 ORDER BY ge.id`,
      [applicationId],
    );
    return {
      nodes: n.rows as unknown as GraphNodeRow[],
      edges: e.rows as unknown as GraphEdgeRow[],
    };
  }
}
