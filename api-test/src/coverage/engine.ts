/**
 * 覆盖率计算引擎（A5 核心）。
 *
 * 输入：
 * - A4 的 InventoryStore（api_definition 清单）；
 * - 测试用例列表（TestCase，A3 将产出，本阶段先用假数据验证）；
 * - 可选「预期响应码」映射（api_key -> 状态码[]），来自 OpenAPI spec 的 responses，
 *   用于按 response code 维度判定某 API 是否「部分覆盖」。
 *
 * 已测判定：
 * - operation 维度：某 API（method+path）存在关联 test_case（api_definition_id 或 method+path 匹配）；
 * - response code 维度：test_case 的 status 断言（type='status' 且 expected 为数字）命中了哪个状态码。
 */
import type { ApiDefinition, TestCase } from '../types/models.js';
import type { OpenApiOperation } from '../inventory/openapi.js';
import { InventoryStore } from '../inventory/store.js';
import { keyOf, normalizeTrafficPath } from '../inventory/normalize.js';
import type {
  CodeCoverage,
  CoverageRecord,
  CoverageReport,
  OperationCoverage,
  UncoveredApi,
} from './types.js';

/** 覆盖率计算引擎 */
export class CoverageEngine {
  constructor(
    private readonly store: InventoryStore,
    private readonly testCases: TestCase[],
    private readonly expectedCodes: Map<string, number[]> = new Map(),
  ) {}

  /** 计算覆盖率报告 */
  report(): CoverageReport {
    const apis = this.store.list();
    const operations: OperationCoverage[] = [];
    const uncovered: UncoveredApi[] = [];
    const partiallyCovered: OperationCoverage[] = [];

    for (const api of apis) {
      const operation = this.operationCoverage(api);
      operations.push(operation);
      if (!operation.covered) {
        uncovered.push(this.toUncoveredApi(api, operation));
      } else if (!operation.codes_fully_covered) {
        partiallyCovered.push(operation);
      }
    }

    const total = operations.length;
    const coveredCount = operations.filter((o) => o.covered).length;
    const uncoveredCount = total - coveredCount;

    return {
      total,
      covered_count: coveredCount,
      uncovered_count: uncoveredCount,
      rate: total === 0 ? 0 : coveredCount / total,
      operations,
      uncovered,
      partially_covered: partiallyCovered,
    };
  }

  /** 未覆盖清单，支持按 path 或按 risk 排序 */
  listUncovered(sortBy: 'path' | 'risk' = 'path'): UncoveredApi[] {
    return sortUncovered(this.report().uncovered, sortBy);
  }

  /** 把当前覆盖状态转成趋势记录（一次跑测试追加一批） */
  toCoverageRecords(testedAt: string): CoverageRecord[] {
    return this.report().operations.map((o) => ({
      api_key: o.api_key,
      method: o.method,
      path: o.path,
      tested_at: testedAt,
      covered: o.covered,
      covered_codes: o.codes.filter((c) => c.covered).map((c) => c.status_code),
      test_case_ids: o.test_case_ids,
    }));
  }

  private operationCoverage(api: ApiDefinition): OperationCoverage {
    const tcs = this.associatedTestCases(api);
    const covered = tcs.length > 0;

    const coveredCodes = new Set<number>();
    for (const tc of tcs) {
      for (const code of coveredCodesOf(tc)) coveredCodes.add(code);
    }

    const expected = this.expectedCodes.get(keyOf(api.method, api.path)) ?? [];
    const codes: CodeCoverage[] = expected.map((code) => ({
      status_code: code,
      covered: coveredCodes.has(code),
    }));
    const codesFullyCovered = expected.length === 0 ? covered : codes.every((c) => c.covered);

    return {
      api_key: keyOf(api.method, api.path),
      api_definition_id: api.id,
      method: api.method,
      path: api.path,
      covered,
      codes,
      codes_fully_covered: codesFullyCovered,
      test_case_count: tcs.length,
      test_case_ids: tcs.map((tc) => tc.id),
      last_tested_at: latestTestedAt(tcs),
    };
  }

  private associatedTestCases(api: ApiDefinition): TestCase[] {
    return this.testCases.filter((tc) => matchesApi(tc, api));
  }

  private toUncoveredApi(api: ApiDefinition, operation: OperationCoverage): UncoveredApi {
    const uncoveredCodes = operation.codes.map((c) => c.status_code);
    return {
      api_key: operation.api_key,
      api_definition_id: api.id,
      method: api.method,
      path: api.path,
      uncovered_codes: uncoveredCodes,
      risk: riskOf(api, operation),
      operation_uncovered: true,
    };
  }
}

/** 从 test_case 的 status 断言提取被覆盖的响应码 */
export function coveredCodesOf(tc: TestCase): number[] {
  const codes = new Set<number>();
  for (const assertion of tc.assertions) {
    if (assertion.type === 'status' && typeof assertion.expected === 'number') {
      codes.add(assertion.expected);
    }
  }
  return [...codes];
}

/** 从 A4 解析出的 OpenAPI operation 提取「预期响应码」映射（api_key -> codes[]） */
export function expectedCodesFromOperations(ops: OpenApiOperation[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const op of ops) {
    const codes = [...new Set(op.responses.map((r) => r.status_code))].sort((a, b) => a - b);
    if (codes.length > 0) map.set(keyOf(op.method, op.normalized_path), codes);
  }
  return map;
}

/** test_case 是否命中某个 api_definition */
export function matchesApi(tc: TestCase, api: ApiDefinition): boolean {
  // 明确指定了 api_definition_id 时以它为准
  if (tc.api_definition_id) {
    return tc.api_definition_id === api.id;
  }
  // 否则回退到 method + 规范化 path 匹配
  const path = normalizeTrafficPath(tc.request.path);
  return tc.request.method === api.method && path === api.path;
}

/** 最近被测时间：取关联用例里最新的 updated_at */
function latestTestedAt(tcs: TestCase[]): string | null {
  let latest: string | null = null;
  for (const tc of tcs) {
    if (latest === null || tc.updated_at > latest) latest = tc.updated_at;
  }
  return latest;
}

/** 风险启发式：认证接口、大流量、响应码多的 API 优先补测，废弃接口降权 */
export function riskOf(api: ApiDefinition, operation: OperationCoverage): number {
  let risk = 1;
  if (api.auth_type !== 'none') risk += 2;
  if (api.sample_count > 0) risk += Math.min(api.sample_count, 3);
  risk += operation.codes.length;
  if (api.status === 'deprecated') risk -= 2;
  return risk;
}

/** 未覆盖清单排序：path（字典序）或 risk（降序，风险相同按 path） */
export function sortUncovered(list: UncoveredApi[], by: 'path' | 'risk'): UncoveredApi[] {
  const sorted = [...list];
  if (by === 'risk') {
    sorted.sort((a, b) => b.risk - a.risk || a.path.localeCompare(b.path));
  } else {
    sorted.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  }
  return sorted;
}
