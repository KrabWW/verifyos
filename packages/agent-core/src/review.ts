import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { RunOutcome, StepDef } from './runner.js';

// ---------- Review 结构（对齐原型 PR 屏 / qa.tech 三段式） ----------

export const AreaSchema = z.object({
  title: z.string().describe('问题标题，中文 ≤20 字'),
  severity: z.enum(['high', 'medium', 'info']).describe('high=高风险/缺陷，medium=建议关注，info=环境类噪音'),
  related: z.enum(['pr', 'env']).describe('pr=与本 PR 改动相关，env=环境类与 PR 无关'),
  suggestion: z.string().describe('建议动作（生成 QA 点 / 关联验证 / 忽略）'),
});
export type Area = z.infer<typeof AreaSchema>;

export const ReviewReportSchema = z.object({
  summary: z.string().describe('SUMMARY：自然语言总结本次验证（覆盖了什么、结果如何、UNKNOWN 原因），≤200 字'),
  areas: z.array(AreaSchema).max(5).describe('AREAS FOR IMPROVEMENT：发现的问题与改进建议'),
});
export type ReviewReport = z.infer<typeof ReviewReportSchema>;

export interface ReviewLlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/** LLM 生成 SUMMARY + AREAS（TESTS RUN 不用 LLM——由 stepResults 确定性生成） */
export async function generateReview(input: {
  applicationName: string;
  prTitle: string;
  outcome: RunOutcome;
  steps: StepDef[];
  llm: ReviewLlmConfig;
}): Promise<ReviewReport> {
  const { applicationName, prTitle, outcome, steps, llm } = input;
  const stepLines = steps.map((s, i) => {
    const r = outcome.stepResults[i];
    return `- [${s.kind}] ${s.title}（${s.id}）→ ${r?.verdict ?? 'n/a'}${s.targetRef ? ` · 声称触达 ${s.targetRef}` : ''}`;
  });
  const reachLines = outcome.reachability.map((c) => `- ${c.stepId}: ${c.explanation}`);

  const provider = createOpenAICompatible({ name: 'glm', apiKey: llm.apiKey, baseURL: llm.baseURL });
  const { object } = await generateObject({
    model: provider(llm.model),
    schema: ReviewReportSchema,
    prompt: `你是测试平台「VerifyOS」的 Review 生成器。为 PR「${prTitle}」（应用：${applicationName}）生成验证 Review。

验证结果：verdict=${outcome.verdict}，步骤：
${stepLines.join('\n')}

触达校验（UNKNOWN ≠ PASS 防假绿）：
${reachLines.length > 0 ? reachLines.join('\n') : '（本 Run 未声明 targetRef，无触达校验）'}

失败信息：${outcome.failureSummary ?? '无'}

要求：
- summary 说清：跑了什么、结果、若有 unknown 解释为什么不能判 pass
- areas 从步骤/触达信息推断真实问题；没有实质问题就给 1 条 info 级的观察，不要编造`,
  });
  return object;
}

// ---------- TESTS RUN（确定性生成） ----------

export interface TestRunRow {
  verdict: string;
  title: string;
  kind: string;
  durationMs: number;
}

export function buildTestRuns(outcome: RunOutcome, steps: StepDef[]): TestRunRow[] {
  return steps.map((s, i) => ({
    verdict: outcome.stepResults[i]?.verdict ?? 'unknown',
    title: s.title,
    kind: s.kind,
    durationMs: outcome.stepResults[i]?.durationMs ?? 0,
  }));
}

// ---------- 合并门禁 ----------

export type GateDecision = 'allow' | 'block' | 'warn';

/**
 * 合并门禁：断言失败 → block；UNKNOWN → warn（不阻止但标记）；全 pass → allow。
 */
export function mergeGate(outcome: RunOutcome): { decision: GateDecision; reason: string } {
  if (outcome.verdict === 'fail') return { decision: 'block', reason: '存在断言失败，阻止合并' };
  if (outcome.verdict === 'unknown') return { decision: 'warn', reason: '存在无法验证步骤（UNKNOWN ≠ PASS），警告合并' };
  return { decision: 'allow', reason: '全部通过' };
}

// ---------- MR 评论 Markdown ----------

const verdictEmoji: Record<string, string> = { pass: '✅', fail: '❌', unknown: '⚠️' };

export function buildMrComment(input: {
  prTitle: string;
  report: ReviewReport;
  outcome: RunOutcome;
  testRuns: TestRunRow[];
  gate: { decision: GateDecision; reason: string };
  evidenceBase?: string;
  /** G1：非阻塞模式标注 + 分档计划（缺省按 blocking 处理，不破坏既有调用） */
  opts?: { gateMode?: 'blocking' | 'reporting'; plan?: string };
}): string {
  const { prTitle, report, outcome, testRuns, gate, evidenceBase, opts } = input;
  // G1：reporting=只评论不拦合并 → 头部「ℹ️ [非阻塞]」标注；gate 结果只影响文本
  const reporting = opts?.gateMode === 'reporting';
  const e = verdictEmoji[outcome.verdict] ?? '';
  const lines: string[] = [];

  const gateLabel = gate.decision === 'block' ? '⛔ 阻止合并' : gate.decision === 'warn' ? '⚠️ 警告合并' : '✅ 可以合并';
  lines.push(reporting
    ? `## ℹ️ [非阻塞] ${e} VerifyOS Review — ${gateLabel}`
    : `## ${e} VerifyOS Review — ${gateLabel}`);
  lines.push('');
  if (reporting) {
    lines.push('> ℹ️ 非阻塞模式（reporting）：本审查只评论不拦截合并，门禁结果仅供参考。');
    lines.push('');
  }
  const planLabel = opts?.plan === 'full' ? 'Full 全量回归档' : opts?.plan === 'smoke' ? 'PR Smoke 冒烟档' : undefined;
  lines.push(`**PR**: ${prTitle} · **verdict**: \`${outcome.verdict}\` · **耗时**: ${(outcome.durationMs / 1000).toFixed(1)}s · **LLM 调用**: ${outcome.llmCalls} 次${planLabel ? ` · **计划**: ${planLabel}` : ''}`);
  lines.push('');
  lines.push('### SUMMARY');
  lines.push(report.summary);
  lines.push('');
  lines.push(`### AREAS FOR IMPROVEMENT (${report.areas.length})`);
  for (const a of report.areas) {
    const icon = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '⚪';
    const tag = a.related === 'pr' ? '本 PR 相关' : '环境类（与 PR 无关）';
    lines.push(`- ${icon} **${a.title}**（${tag}）—— ${a.suggestion}`);
  }
  lines.push('');
  lines.push(`### TESTS RUN (${testRuns.length})`);
  lines.push('| # | 判定 | 验证 | 方式 | 耗时 |');
  lines.push('|---|---|---|---|---|');
  testRuns.forEach((t, i) => {
    const icon = t.verdict === 'pass' ? '✓' : t.verdict === 'fail' ? '✕' : '?';
    lines.push(`| ${i + 1} | ${icon} ${t.verdict} | ${t.title} | ${t.kind} | ${(t.durationMs / 1000).toFixed(1)}s |`);
  });
  lines.push('');
  if (outcome.visitedUrls.length > 0) {
    lines.push('### 触达路径');
    outcome.visitedUrls.forEach((u) => lines.push(`- ${u}`));
    lines.push('');
  }
  if (evidenceBase && outcome.evidenceKeys.length > 0) {
    lines.push(`### 证据（${outcome.evidenceKeys.length}）`);
    for (const k of outcome.evidenceKeys) lines.push(`- [${k.split('/').pop()}](${evidenceBase}/${k})`);
    lines.push('');
  }
  lines.push('> 🤖 由 VerifyOS 自动生成 · UNKNOWN ≠ PASS · 合并门禁：断言失败 → 阻止，无法验证 → 警告');
  return lines.join('\n');
}
