/**
 * A7 断言生成 + 失败诊断 专用类型。
 *
 * 两块能力（均规则式，LLM 后置）：
 * 1. schema 级断言生成：从真实响应 JSON 推导「字段存在性 / 类型 / 取值」断言，
 *    比 A3 的泛泛 status 检查更细；LLM 增强接口 `llm()` 预留（本 ticket 不调用）；
 * 2. 失败诊断：测试失败（实际响应 vs 期望断言不符）时给根因分类 + 失败字段 diff。
 *
 * 断言模型复用 src/types/models.ts 的 Assertion/TestCase（A3 已定义：
 * type/operator/target/expected/schema + mode strict/ignore，JSONPath target）。
 */
import type { Assertion } from '../types/models.js';

/** 断言生成输入上下文（供 LLM 增强使用） */
export interface LlmAssertContext {
  /** 真实响应 JSON（已解析） */
  response: unknown;
  /** 响应状态码 */
  status_code: number;
  /** 规则式已生成的断言 */
  rule_assertions: Assertion[];
}

/**
 * LLM 增强接口（预留）。
 * 本 ticket 为规则式实现，api-test 当前无 LLM 配置，generateSchemaAssertions 不调用它。
 * 后续接入 LLM 时：传入该回调，在规则断言基础上追加「更聪明」的语义断言。
 */
export type LlmEnhancer = (ctx: LlmAssertContext) => Assertion[] | Promise<Assertion[]>;

/** 断言生成选项 */
export interface GenerateAssertOptions {
  /** 响应状态码（默认 200） */
  status_code?: number;
  /**
   * 已有/预期断言（可选）：用于对齐噪音字段的 ignore 模式。
   * 例如用基线响应生成断言后再诊断新响应时，可传入基线断言保持噪音判定一致。
   */
  existing?: Assertion[];
  /** 预留：LLM 增强（当前忽略，见 LlmEnhancer 注释） */
  llm?: LlmEnhancer;
}

/** 根因分类：契约破坏 / 业务变更 / 环境差异 */
export type RootCause = 'contract_break' | 'business_change' | 'environment_diff';

/** 失败类型 */
export type FailureKind = 'status_mismatch' | 'missing' | 'type_mismatch' | 'value_mismatch';

/** 单条断言失败明细 */
export interface AssertionFailure {
  /** 断言目标（JSONPath；status 断言时为空） */
  target?: string;
  /** 失败类型 */
  kind: FailureKind;
  /** 期望值 */
  expected?: unknown;
  /** 实际值 */
  actual?: unknown;
  /** 失败说明（人读） */
  message: string;
  /** 是否命中噪音（mode=ignore）字段，供根因分类用 */
  noise: boolean;
}

/** 请求/响应 diff 证据摘要 */
export interface DiffEvidence {
  /** 期望状态码 */
  expected_status?: number;
  /** 实际状态码 */
  actual_status?: number;
  /** 失败断言数 */
  failed_count: number;
  /** 逐条失败明细 */
  failures: AssertionFailure[];
  /** 人读 diff 摘要（失败字段逐行列出期望 vs 实际） */
  summary: string;
}

/** 失败诊断结果 */
export interface Diagnosis {
  /** 是否通过 */
  passed: boolean;
  /** 根因分类（通过时为 null） */
  root_cause: RootCause | null;
  /** 分类理由（人读） */
  reason: string;
  /** 修复建议 */
  suggestions: string[];
  /** 证据（请求/响应 diff 摘要） */
  evidence: DiffEvidence;
}

/** 断言审阅决策 */
export type AssertReviewDecision = 'accept' | 'reject';

/** 单条断言审阅：accept 写入用例 / reject 丢弃 */
export interface AssertionReview {
  assertion: Assertion;
  decision: AssertReviewDecision;
}
