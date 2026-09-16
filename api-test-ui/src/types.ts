/**
 * UI 端数据类型定义。
 *
 * 从后端 api-test 项目复制适配而来：
 * - src/types/models.ts：ApiDefinition / TestCase / Assertion 等四表模型；
 * - src/coverage/types.ts：CoverageReport 看板数据源；
 * - src/scenario/types.ts：Scenario / ScenarioReport 场景编排与报告。
 *
 * 字段命名保持 snake_case 与后端对齐，时间统一 ISO 8601 字符串，ID 统一 UUID 字符串。
 */

/** 通用审计字段 */
export interface AuditFields {
  created_at: string;
  updated_at: string;
}

/** HTTP 方法（CONNECT 用于代理 HTTPS 隧道元数据记录） */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'CONNECT';

/** JSON Schema（宽松类型） */
export type JsonSchema = Record<string, unknown>;

/** 认证方式 */
export type AuthType =
  | 'none'
  | 'basic'
  | 'bearer'
  | 'api_key'
  | 'oauth2'
  | 'cookie'
  | 'custom';

/** API 定义（inventory 资产） */
export interface ApiDefinition extends AuditFields {
  /** 主键，UUID */
  id: string;
  /** HTTP 方法 */
  method: HttpMethod;
  /** 规范化路径，动态段用 :param 占位，例如 /users/:id */
  path: string;
  /** 主机（含 scheme），例如 https://api.example.com */
  host: string;
  /** API 版本（若服务有版本化），例如 v1 */
  version?: string;
  /** 定义来源：openapi / recorded / manual / spec */
  spec_source: 'openapi' | 'recorded' | 'manual' | 'spec';
  /** 请求体 JSON Schema */
  request_schema?: JsonSchema;
  /** 响应体 JSON Schema */
  response_schema?: JsonSchema;
  /** 内容类型 */
  content_type?: string;
  /** 认证方式 */
  auth_type: AuthType;
  /** 标签（用于分组/看板） */
  tags: string[];
  /** 归属范围：internal 内部接口 / external 外部开放接口 */
  scope?: 'internal' | 'external';
  /** 生命周期状态：active 活跃 / deprecated 废弃 */
  status: 'active' | 'deprecated';
  /** 关联流量样本数（冗余聚合） */
  sample_count: number;
}

/** 流量记录（录制事实） */
export interface TrafficRecord extends AuditFields {
  id: string;
  /** 关联 API 定义（可为空，用于「未归并的新接口」） */
  api_definition_id: string | null;
  /** 录制时间戳 */
  timestamp: string;
  method: HttpMethod;
  path: string;
  host: string;
  query_params: Record<string, string[]>;
  request_headers: Record<string, string>;
  request_body?: string;
  status_code: number;
  response_headers: Record<string, string>;
  response_body?: string;
  /** 延迟（毫秒） */
  latency_ms: number;
  /** 录制来源 */
  source: 'proxy' | 'ebpf' | 'sdk';
  trace_id?: string;
  /** 是否噪音 */
  noise_flag: boolean;
}

/** 断言字段匹配模式：strict 严格相等 / ignore 忽略（仅断言存在性） */
export type AssertionMode = 'strict' | 'ignore';

/** 断言 */
export interface Assertion {
  /** 断言类型 */
  type: 'status' | 'jsonpath' | 'field' | 'schema' | 'header' | 'regex' | 'latency';
  /** 目标表达式：jsonpath 时是 $.. 路径；field 时是字段名；header 时是头名 */
  target?: string;
  /** 操作符 */
  operator?: 'eq' | 'ne' | 'contains' | 'matches' | 'exists' | 'in' | 'gt' | 'lt';
  /** 期望值（exists 类断言无需期望值） */
  expected?: unknown;
  /** schema 断言时的 JSON Schema */
  schema?: JsonSchema;
  /** 匹配模式，ignore 表示该字段易变、仅断言存在性 */
  mode?: AssertionMode;
}

/** 测试用例人工审阅状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 测试用例 */
export interface TestCase extends AuditFields {
  id: string;
  /** 关联 API 定义 */
  api_definition_id: string;
  name: string;
  description?: string;
  /** 请求体（method/path/headers/body/query） */
  request: {
    method: HttpMethod;
    path: string;
    query_params: Record<string, string[]>;
    headers: Record<string, string>;
    body?: string;
  };
  /** 断言列表 */
  assertions: Assertion[];
  /** 变量（场景编排用） */
  variables: Record<string, string>;
  /** 来源：recorded / spec / ai / manual */
  source: 'recorded' | 'spec' | 'ai' | 'manual';
  tags: string[];
  /** 最近一次执行结果 */
  last_result: 'pass' | 'fail' | 'pending';
  /** 人工审阅状态 */
  review_status: ReviewStatus;
}

/* ===== 覆盖率（来自 coverage/types.ts） ===== */

/** API 主键，形如 `GET /users/:id` */
export type ApiKey = string;

/** 单个响应码维度的覆盖情况 */
export interface CodeCoverage {
  status_code: number;
  covered: boolean;
}

/** 单个 operation 的覆盖明细 */
export interface OperationCoverage {
  api_key: string;
  api_definition_id: string;
  method: HttpMethod;
  path: string;
  /** operation 维度是否被覆盖（存在关联 test_case） */
  covered: boolean;
  /** 响应码维度明细 */
  codes: CodeCoverage[];
  /** 响应码是否全部覆盖 */
  codes_fully_covered: boolean;
  test_case_count: number;
  test_case_ids: string[];
  last_tested_at: string | null;
}

/** 未覆盖条目（驱动补测试） */
export interface UncoveredApi {
  api_key: string;
  api_definition_id: string;
  method: HttpMethod;
  path: string;
  uncovered_codes: number[];
  /** 风险分数（越大越该优先补测） */
  risk: number;
  /** 是否整 operation 未测 */
  operation_uncovered: boolean;
}

/** 覆盖率报告（看板数据源） */
export interface CoverageReport {
  total: number;
  covered_count: number;
  uncovered_count: number;
  /** 覆盖率 0-1 */
  rate: number;
  operations: OperationCoverage[];
  uncovered: UncoveredApi[];
  partially_covered: OperationCoverage[];
}

/* ===== 场景编排（来自 scenario/types.ts） ===== */

/** 变量提取：从前一个接口响应体按 JSONPath 取字段存为变量 */
export interface VariableExtraction {
  /** 变量名（后续用 {{name}} 引用） */
  name: string;
  /** JSONPath，如 $.data.token */
  jsonpath: string;
}

/** 场景步骤：一个接口调用 + 前置提取变量 */
export interface ScenarioStep {
  /** 复用的测试用例 */
  test_case: TestCase;
  /** 执行成功后从响应体提取的变量 */
  extract?: VariableExtraction[];
}

/** 场景：有序步骤列表 + 变量提取/传递 */
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  /** 有序步骤（按数组顺序执行） */
  steps: ScenarioStep[];
}

/** 环境：多环境切换 */
export interface Environment {
  name: string;
  /** 基础地址（含 scheme） */
  base_url: string;
  /** 变量字典 */
  vars: Record<string, string>;
}

/** 单条断言的执行结果 */
export interface AssertionOutcome {
  type: Assertion['type'];
  target?: string;
  operator?: string;
  expected?: unknown;
  actual?: unknown;
  passed: boolean;
  message: string;
}

/** 单个步骤（接口）的执行结果 */
export interface StepOutcome {
  name: string;
  method: HttpMethod;
  /** 渲染变量后的路径 */
  path: string;
  /** 完整 URL */
  url: string;
  /** 响应状态码（执行失败为 null） */
  status_code: number | null;
  latency_ms: number;
  passed: boolean;
  assertions: AssertionOutcome[];
  /** 本步骤提取到的变量 */
  extracted: Record<string, string>;
  error?: string;
}

/** 场景运行报告 */
export interface ScenarioReport {
  scenario_id: string;
  scenario_name: string;
  environment_name: string;
  base_url: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  /** 场景整体是否通过（所有步骤通过） */
  passed: boolean;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  total_assertions: number;
  passed_assertions: number;
  failed_assertions: number;
  /** 步骤明细（有序） */
  steps: StepOutcome[];
}
