import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// ---------- D3：影响分析（Diff → Intent → 定向回归建议） ----------

export const ImpactAnalysisSchema = z.object({
  affectedAreas: z
    .array(
      z.object({
        area: z.string().describe('受影响的业务域，如：退款流程 / 登录会话 / 员工表单'),
        reason: z.string().describe('为什么受影响（引用 diff 证据）'),
        risk: z.enum(['high', 'medium', 'low']).describe('回归风险等级'),
      }),
    )
    .min(1)
    .max(5),
  regressionSuggestions: z
    .array(
      z.object({
        title: z.string().describe('定向回归验证点标题（动词开头，中文 ≤25 字）'),
        targetUrlHint: z.string().optional().describe('建议触达的页面/路径片段（如 refund.html、/orders、/login）'),
        rationale: z.string().describe('为什么测它（关联变更点）'),
      }),
    )
    .min(1)
    .max(6),
  summary: z.string().describe('一句话总结本次变更的测试影响（≤80 字）'),
});
export type ImpactAnalysis = z.infer<typeof ImpactAnalysisSchema>;

export interface ImpactLlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * analyzeImpact（D3）：PR 变更 → 受影响业务域 + 定向回归建议。
 * diffText 为首选输入；没有 diff 时用 changedFiles + prTitle 推断（精度较低）。
 */
export async function analyzeImpact(input: {
  prTitle: string;
  diffText?: string;
  changedFiles?: string[];
  applicationContext?: string;
  llm: ImpactLlmConfig;
}): Promise<ImpactAnalysis> {
  const { prTitle, diffText, changedFiles, applicationContext, llm } = input;

  const contextBlock = diffText
    ? `代码 Diff：\n\`\`\`diff\n${diffText.slice(0, 6000)}\n\`\`\``
    : `变更文件列表：\n${(changedFiles ?? []).map((f) => `- ${f}`).join('\n')}`;

  const provider = createOpenAICompatible({ name: 'glm', apiKey: llm.apiKey, baseURL: llm.baseURL });
  const { object } = await generateObject({
    model: provider(llm.model),
    schema: ImpactAnalysisSchema,
    prompt: `你是测试平台「VerifyOS」的影响分析引擎。为 PR 分析变更影响并给出定向回归建议。

PR 标题：${prTitle}
${applicationContext ? `应用背景：${applicationContext}` : ''}

${contextBlock}

要求：
- affectedAreas 聚焦业务域（不是文件名），reason 引用 diff 中的具体变更点
- regressionSuggestions 是可以用 UI 验证的定向回归点；targetUrlHint 给出应触达的页面/路径片段
- 若 diff 仅样式/文档/配置变更，affectedAreas 给 1 条 low 并说明`,
  });
  return object;
}
