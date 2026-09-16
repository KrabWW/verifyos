/**
 * 断言层（A3/A7）：状态码 / JSONPath / 字段 / JSON Schema 断言。
 * 选型结论：ajv(JSON Schema) + jsonpath-plus(JSONPath) + 内建断言 DSL，详见 docs/tech-selection.md。
 *
 * A7 落地三块能力（均规则式，LLM 后置）：
 * - schema 级断言生成（generateSchemaAssertions）：真实响应 → 字段存在性/类型/取值断言；
 * - 失败诊断（diagnoseFailure）：实际响应 vs 期望断言 → 根因分类 + 失败字段 diff；
 * - 断言接受/拒绝（acceptAssertions / rejectAssertions / reviewAssertions）：写入/移除用例断言。
 */
export const MODULE = 'assertion' as const;

export { generateSchemaAssertions } from './generate.js';
export { diagnoseFailure } from './diagnose.js';
export type { DiagnoseInput } from './diagnose.js';
export { acceptAssertions, rejectAssertions, reviewAssertions } from './review.js';
export { parseJsonPath, evaluateJsonPath } from './jsonpath.js';
export type { EvalResult } from './jsonpath.js';
export { parseNlAssertions, nlToAssertions, nlToAssertionsAsync } from './nl.js';
export type { NlLlmContext, NlSyncEnhancer, NlLlmEnhancer, NlParseResult, NlInvalidTarget } from './nl.js';
export { healAssertions } from './self-heal.js';
export type { HealResult, HealChange, BrokenTarget } from './self-heal.js';
export type {
  LlmAssertContext,
  LlmEnhancer,
  GenerateAssertOptions,
  RootCause,
  FailureKind,
  AssertionFailure,
  DiffEvidence,
  Diagnosis,
  AssertReviewDecision,
  AssertionReview,
} from './types.js';
