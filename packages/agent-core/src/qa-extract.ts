import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { GraphNodeRow, GraphEdgeRow } from './graph.js';

interface PgLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

// ---------- 提取结果 schema ----------

export const QaCandidateSchema = z.object({
  title: z.string().describe('QA 点标题，动词开头，中文，≤30 字'),
  category: z.enum(['权限', '正常流程', '校验', '边界', '状态', '并发']).describe('测试类别'),
  risk: z.enum(['high', 'medium', 'low']).describe('业务风险等级'),
  actor: z.string().describe('执行角色，如：管理员 / 普通用户 / 审批人'),
  confidence: z.number().min(0).max(1).describe('该建议的置信度 0-1'),
  rationale: z.string().describe('为什么值得测，须引用页面证据'),
  sourceUrl: z.string().describe('依据的页面 URL（必须来自给定页面列表）'),
});
export type QaCandidate = z.infer<typeof QaCandidateSchema>;

export const QaExtractionSchema = z.object({
  candidates: z.array(QaCandidateSchema).min(1).max(8),
});

export interface QaLlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * QaExtractor（B5）：探索结果（Coverage Graph + 页面摘要）→ LLM structured output → QA 点候选。
 * glm-4.5v + openai-compatible（A5 验证组合）；generateObject 走 chat/completions + JSON mode。
 */
export class QaExtractor {
  constructor(private readonly llm: QaLlmConfig) {}

  async extract(input: {
    applicationName: string;
    intent: string;
    nodes: GraphNodeRow[];
    edges: GraphEdgeRow[];
    maxCandidates?: number;
  }): Promise<QaCandidate[]> {
    const { applicationName, intent, nodes, edges, maxCandidates = 6 } = input;

    const pageLines = nodes.map((n) => {
      const meta = n.meta as { intentBand?: string; loginWall?: boolean; headings?: string[] };
      const headings = (meta.headings ?? []).slice(0, 3).join(' / ');
      return `- ${n.ref}  「${n.title ?? ''}」 分档=${meta.intentBand ?? '-'}${meta.loginWall ? ' [登录墙]' : ''}${headings ? ` 栏目: ${headings}` : ''}`;
    });
    const edgeLines = edges.map((e) => `- ${e.fromRef} ──▶ ${e.toRef}`);

    const prompt = `你是资深测试架构师，为 Web 应用「${applicationName}」设计验证点。

业务意图：${intent || '（未指定，按通用业务系统风险评估）'}

已探索的页面：
${pageLines.join('\n')}

导航结构：
${edgeLines.join('\n')}

要求：
1. 从业务风险出发，提出最多 ${maxCandidates} 个最值得验证的 QA 点
2. 覆盖面尽量分布：权限越权 / 输入校验 / 边界值 / 状态流转 / 并发，不要集中在单页
3. rationale 必须引用具体页面证据（哪个页面有什么信息导致这个风险）
4. sourceUrl 必须来自上面的页面列表
5. 只提可以通过 UI 操作验证的点，不要提纯后端单元级测试`;

    const provider = createOpenAICompatible({ name: 'glm', apiKey: this.llm.apiKey, baseURL: this.llm.baseURL });
    const { object } = await generateObject({
      model: provider(this.llm.model),
      schema: QaExtractionSchema,
      prompt,
    });
    return object.candidates;
  }
}

// ---------- 落库 ----------

export class QaPointStore {
  constructor(private readonly pool: PgLike) {}

  /** 候选落 qa_point：status='discovered'（状态机起点），actor/rationale/explorationId 入 source jsonb */
  async saveCandidates(
    applicationId: number,
    candidates: QaCandidate[],
    explorationId?: number,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const c of candidates) {
      const shortId = `qa_${Math.random().toString(36).slice(2, 8)}`;
      const source = JSON.stringify({
        actor: c.actor,
        rationale: c.rationale,
        sourceUrl: c.sourceUrl,
        confidence: c.confidence,
        explorationId: explorationId ?? null,
      });
      await this.pool.query(
        `INSERT INTO qa_point(short_id, application_id, title, category, risk, status, confidence, source)
         VALUES ($1, $2, $3, $4, $5, 'discovered', $6, $7::jsonb)`,
        [shortId, applicationId, c.title, c.category, c.risk, c.confidence, source],
      );
      ids.push(shortId);
    }
    return ids;
  }

  async list(applicationId: number): Promise<
    Array<{ short_id: string; title: string; category: string | null; risk: string | null; status: string; confidence: string | null; source: Record<string, unknown> }>
  > {
    const r = await this.pool.query(
      `SELECT short_id, title, category, risk, status, confidence, source
       FROM qa_point WHERE application_id = $1 ORDER BY id`,
      [applicationId],
    );
    return r.rows as unknown as Array<{
      short_id: string;
      title: string;
      category: string | null;
      risk: string | null;
      status: string;
      confidence: string | null;
      source: Record<string, unknown>;
    }>;
  }
}
