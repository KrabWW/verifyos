/**
 * 覆盖率数据模型草案（纯类型定义，A1 阶段不建库）。
 *
 * 四张核心表：api_definition / traffic_record / test_case / coverage。
 * 设计目标：
 * - api_definition 是「API 资产清单」（对标 Akto inventory），一切围绕它聚合；
 * - traffic_record 是「流量事实」（对标 Keploy 录制产物），可多条映射一个 API；
 * - test_case 是「测试用例」，由录制/spec/AI/手工生成，携带断言；
 * - coverage 是「覆盖事实」，记录某 API 在某个响应维度是否被测过，支撑 A5 看板。
 *
 * 字段命名统一 snake_case，与后续可能的存储（Postgres / 文档库）对齐；
 * 时间统一 ISO 8601 字符串，ID 统一 UUID 字符串。
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

/** JSON Schema（宽松类型，仅作草案；A2+ 引入 ajv 后可用精确类型） */
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

/** 表 1：API 定义（inventory 资产） */
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
  /**
   * 自动语义标签（P1.4 规则式分类产物）：security / external / deprecated / internal。
   * 与人工 tags/scope/status 互补：自动标注是补充而非替代，人工 annotate 优先。
   */
  auto_tags?: string[];
  /** 归属范围：internal 内部接口 / external 外部开放接口（A4 标注产物，可选） */
  scope?: 'internal' | 'external';
  /** 生命周期状态：active 活跃 / deprecated 废弃 */
  status: 'active' | 'deprecated';
  /** 关联流量样本数（冗余聚合，加速 inventory 展示） */
  sample_count: number;
}

/** 表 2：流量记录（录制事实） */
export interface TrafficRecord extends AuditFields {
  /** 主键，UUID */
  id: string;
  /** 关联 API 定义（可为空，用于「未归并的新接口」） */
  api_definition_id: string | null;
  /** 录制时间戳 */
  timestamp: string;
  method: HttpMethod;
  path: string;
  host: string;
  /** 查询参数 */
  query_params: Record<string, string[]>;
  /** 请求头 */
  request_headers: Record<string, string>;
  /** 请求体（原始文本，可空） */
  request_body?: string;
  /** 响应状态码 */
  status_code: number;
  /** 响应头 */
  response_headers: Record<string, string>;
  /** 响应体（原始文本，可空） */
  response_body?: string;
  /** 延迟（毫秒） */
  latency_ms: number;
  /** 录制来源 */
  source: 'proxy' | 'ebpf' | 'sdk' | 'extension';
  /**
   * 请求分级（P1.2 录制时噪音检测前移）：
   * - top_level：导航主文档；
   * - ajax：XHR/fetch 接口调用；
   * - embedded：静态资源 / 第三方资源。
   * 可选字段，向后兼容（旧数据无此字段视为未分级）。
   */
  request_class?: 'top_level' | 'ajax' | 'embedded';
  /**
   * 是否噪音流量（静态资源等对测试生成无价值的请求）。
   * 可选字段，向后兼容；与 noise_flag（字段级噪音标记）语义不同：
   * is_noise 关注「整条请求是否值得录」，noise_flag 关注「响应字段是否易变」。
   */
  is_noise?: boolean;
  /** 链路追踪 ID（可选，便于关联） */
  trace_id?: string;
  /** 是否噪音（A3 噪音检测产物，默认 false） */
  noise_flag: boolean;
}

/** 断言字段匹配模式：strict 严格相等 / ignore 忽略（噪音字段仅断言存在性，不比对值） */
export type AssertionMode = 'strict' | 'ignore';

/** 断言类型（A2+ 断言引擎落地） */
export interface Assertion {
  /** 断言类型 */
  type: 'status' | 'jsonpath' | 'field' | 'schema' | 'header' | 'regex' | 'latency';
  /** 目标表达式：jsonpath 时是 $.. 路径；field 时是字段名；header 时是头名 */
  target?: string;
  /** 操作符：eq / ne / contains / matches / exists / in / gt / lt（schema 类断言可不填） */
  operator?: 'eq' | 'ne' | 'contains' | 'matches' | 'exists' | 'in' | 'gt' | 'lt';
  /** 期望值（可空，exists 类断言无需期望值） */
  expected?: unknown;
  /** schema 断言时的 JSON Schema */
  schema?: JsonSchema;
  /** 匹配模式（A3 噪音检测产物，默认 strict）：ignore 表示该字段易变、仅断言存在性 */
  mode?: AssertionMode;
}

/** 测试用例人工审阅状态（A3 引入：AI/录制生成仍需人审，见 README caveat） */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 表 3：测试用例 */
export interface TestCase extends AuditFields {
  /** 主键，UUID */
  id: string;
  /** 关联 API 定义 */
  api_definition_id: string;
  /** 用例名 */
  name: string;
  /** 用例描述 */
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
  /** 变量（场景编排用，A8） */
  variables: Record<string, string>;
  /** 来源：recorded / spec / ai / manual */
  source: 'recorded' | 'spec' | 'ai' | 'manual';
  /** 标签 */
  tags: string[];
  /** 最近一次执行结果 */
  last_result: 'pass' | 'fail' | 'pending';
  /** 人工审阅状态（AI/录制生成仍需人审，默认 pending） */
  review_status: ReviewStatus;
}

/** 表 4：覆盖率（覆盖事实） */
export interface Coverage extends AuditFields {
  /** 主键，UUID */
  id: string;
  /** 关联 API 定义 */
  api_definition_id: string;
  /** 被测响应状态码（覆盖维度之一） */
  status_code: number;
  /** 该维度是否已被测试覆盖 */
  covered: boolean;
  /** 覆盖该维度的测试用例 */
  test_case_id: string | null;
  /** 最近一次被测时间 */
  last_tested_at: string | null;
  /** 该 API 的整体覆盖率（0-1，冗余聚合） */
  api_coverage_rate: number;
  /** 路径/字段级覆盖率补充（spec 覆盖率，A6） */
  spec_path_coverage?: Record<string, boolean>;
}
