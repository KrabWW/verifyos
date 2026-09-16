/**
 * 测试生成层（A3 录制→测试）专用类型。
 *
 * 把 A2 录制的流量（RecordingSession.export() 产物）转成可回放的测试用例：
 * - 每条生成结果 = 一个 TestCase（请求快照 + 断言列表） + 噪音明细 + 依赖 mock + 审阅元数据；
 * - 噪音检测命中 volatile 字段（时间戳/随机 ID/token）→ 断言标为「忽略」而非「严格相等」；
 * - 依赖 mock 记录「该用例依赖的下游响应快照」，供离线回放参考。
 */
import type { TestCase } from '../types/models.js';

/** 噪音规则（volatile 字段命中的规则类型） */
export type NoiseRule =
  | 'iso_timestamp'
  | 'numeric_timestamp'
  | 'uuid'
  | 'hex_id'
  | 'integer_id'
  | 'token_field'
  | 'token_header';

/** 单个字段的噪音命中明细 */
export interface NoiseFinding {
  /** 命中位置：请求头 / 请求体 / 请求 query / 响应体 / 响应头 */
  location: 'request_header' | 'request_body' | 'request_query' | 'response_body' | 'response_header';
  /** 字段定位：header 名 / query 键 / body JSONPath（如 $.data.items[0].id） */
  path: string;
  /** 命中规则 */
  rule: NoiseRule;
  /** 人读说明 */
  reason: string;
  /** 脱敏后的样例（token 类只给长度/前缀，不落原文） */
  sample?: string;
}

/** 依赖 mock 描述（该用例离线回放时依赖的下游快照） */
export interface DependencyMock {
  /** mock 名（下游标识） */
  name: string;
  /** 依赖类型 */
  kind: 'http_downstream' | 'db' | 'cache' | 'external';
  /** 下游目标（host / 资源标识 / URL） */
  target: string;
  /** 匹配该依赖的请求快照（脱敏后） */
  request_snapshot?: unknown;
  /** 该依赖的下游响应快照（脱敏后，离线回放用） */
  response_snapshot?: unknown;
  /** 说明 */
  note: string;
}

/** 单条生成结果：一个测试用例 + 噪音明细 + 依赖 mock */
export interface GeneratedTestCase {
  /** 生成的测试用例（request + assertions + review_status） */
  test_case: TestCase;
  /** 噪音字段明细（被标为忽略的字段） */
  noise_findings: NoiseFinding[];
  /** 依赖 mock 描述（离线回放参考） */
  mocks: DependencyMock[];
}

/** 会话整体生成结果汇总 */
export interface GenerationSummary {
  /** 生成用例总数（每个 API 一组） */
  total_cases: number;
  /** 断言总数 */
  total_assertions: number;
  /** 被标为忽略的噪音字段总数 */
  total_noise_ignored: number;
  /** 依赖 mock 总数 */
  total_mocks: number;
}

/** 录制会话 → 测试用例的生成结果 */
export interface GenerationResult {
  session_id: string;
  /** 生成时间（ISO 8601） */
  generated_at: string;
  /** 生成的用例列表 */
  cases: GeneratedTestCase[];
  /** 汇总统计 */
  summary: GenerationSummary;
}
