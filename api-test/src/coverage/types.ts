/**
 * 覆盖率模块专属类型（A5）。
 *
 * 与 models.ts 里四表草案的 `Coverage` 的关系：
 * - `Coverage`（models.ts）是细粒度的「覆盖事实单行」：某 API 的某个响应码是否被测；
 * - 本文件的 `CoverageRecord` 是「趋势事实」：某次跑测试时某 API 的整体覆盖快照，
 *   随每次跑测试追加，用于绘制覆盖趋势（对应 ticket 第 4 点的 coverage 表：
 *   api_key + tested_at + covered 状态）。
 *
 * 两者共存：`CoverageRecord` 由引擎从一次测试结果聚合出来，`Coverage` 可在后续接数据库时
 * 落成细粒度行。本阶段以内存实现覆盖验收。
 */
import type { HttpMethod } from '../types/models.js';

/** API 主键，复用 inventory 的 `keyOf(method, path)`，形如 `GET /users/:id` */
export type ApiKey = string;

/** 单个响应码维度的覆盖情况 */
export interface CodeCoverage {
  /** 被测响应状态码 */
  status_code: number;
  /** 该响应码是否已被测试覆盖 */
  covered: boolean;
}

/** 单个 operation 的覆盖明细 */
export interface OperationCoverage {
  /** API 主键（method + 规范化 path） */
  api_key: string;
  /** 关联 api_definition 的 id */
  api_definition_id: string;
  method: HttpMethod;
  path: string;
  /** operation 维度是否被覆盖（存在关联 test_case） */
  covered: boolean;
  /** 响应码维度明细（逐个预期响应码） */
  codes: CodeCoverage[];
  /**
   * 响应码是否全部覆盖：
   * - 有预期响应码时：所有预期码都被测才算 true；
   * - 无预期响应码时：退化为 operation 维度（covered），避免空集合恒为 false。
   */
  codes_fully_covered: boolean;
  /** 关联测试用例数 */
  test_case_count: number;
  /** 关联测试用例 id 列表 */
  test_case_ids: string[];
  /** 最近一次被测时间（无则 null） */
  last_tested_at: string | null;
}

/** 未覆盖条目（驱动补测试） */
export interface UncoveredApi {
  api_key: string;
  api_definition_id: string;
  method: HttpMethod;
  path: string;
  /** 尚未覆盖的响应码（operation 完全未测时为全部预期码；无预期码则为空数组） */
  uncovered_codes: number[];
  /** 风险分数（越大越该优先补测） */
  risk: number;
  /** 是否整 operation 未测（true）还是仅部分响应码未测（false） */
  operation_uncovered: boolean;
}

/** 覆盖率报告（看板数据源） */
export interface CoverageReport {
  /** inventory 中 API 总数 */
  total: number;
  /** 已测（operation 维度被覆盖）的 API 数 */
  covered_count: number;
  /** 未测的 API 数 */
  uncovered_count: number;
  /** 覆盖率 0-1 */
  rate: number;
  /** 全部 operation 的覆盖明细（按 api_key 排序） */
  operations: OperationCoverage[];
  /** operation 完全未覆盖的清单 */
  uncovered: UncoveredApi[];
  /** operation 已测但响应码未全覆盖的清单 */
  partially_covered: OperationCoverage[];
}

/** 覆盖趋势记录（一次跑测试的 API 级快照，随历史累积） */
export interface CoverageRecord {
  api_key: string;
  method: HttpMethod;
  path: string;
  /** 本次测试时间（ISO 8601） */
  tested_at: string;
  /** 该 API 本轮是否被覆盖 */
  covered: boolean;
  /** 本轮覆盖到的响应码 */
  covered_codes: number[];
  /** 关联的测试用例 id 列表 */
  test_case_ids: string[];
}
