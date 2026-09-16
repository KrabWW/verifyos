/**
 * 失败诊断（A7 核心 2）：测试失败（实际响应 vs 期望断言不符）时给根因分类 + 失败字段 diff。
 *
 * 规则式实现（LLM 版后置）：
 * - 逐条评估期望断言，产出失败明细（失败字段 + 失败类型：status/缺失/类型不符/值不符）；
 * - 按失败模式归类根因：
 *   - contract_break 契约破坏：字段类型变化、稳定字段缺失、状态码 4xx；
 *   - business_change 业务变更：字段值变化但结构一致（稳定字段值不同）；
 *   - environment_diff 环境差异：易变（噪音）字段缺失/变化、状态码 5xx。
 * - 附带证据：请求/响应 diff 摘要（逐字段列出期望 vs 实际）。
 *
 * 对标：Postman 失败诊断。断言模型见 src/types/models.ts。
 */
import type { Assertion, JsonSchema } from '../types/models.js';
import { evaluateJsonPath, parseJsonPath } from './jsonpath.js';
import type {
  AssertionFailure,
  Diagnosis,
  DiffEvidence,
  RootCause,
} from './types.js';

/** 诊断输入 */
export interface DiagnoseInput {
  /** 期望断言列表 */
  assertions: Assertion[];
  /** 实际响应 JSON（已解析） */
  response: unknown;
  /** 实际响应状态码（可选；缺省时跳过 status 断言） */
  status_code?: number;
  /** 请求摘要（用于证据可读性，可选） */
  request?: { method?: string; path?: string };
}

/** JSON 值类型名 */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** 声明 type 与实际值是否匹配（integer 视为 number 子集） */
function typesMatch(expectedType: unknown, actual: unknown): boolean {
  if (typeof expectedType !== 'string') return true;
  const actualType = typeName(actual);
  if (expectedType === actualType) return true;
  return expectedType === 'integer' && actualType === 'number';
}

/** 深度相等（JSON 值：原始类型/数组/对象） */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** 单条断言是否标为噪音（mode=ignore） */
function isNoise(a: Assertion): boolean {
  return a.mode === 'ignore';
}

/**
 * 评估单条断言；通过返回 null，失败返回失败明细。
 * 无法评估（缺 status_code、非法 JSONPath、schema 未声明 type）时返回 null（跳过，不误报）。
 */
function evaluateAssertion(
  a: Assertion,
  response: unknown,
  statusCode: number | undefined,
): AssertionFailure | null {
  const noise = isNoise(a);
  const fail = (kind: AssertionFailure['kind'], msg: string, expected?: unknown, actual?: unknown): AssertionFailure => ({
    target: a.target,
    kind,
    expected,
    actual,
    message: msg,
    noise,
  });

  if (a.type === 'status') {
    if (statusCode === undefined) return null;
    const op = a.operator ?? 'eq';
    const exp = a.expected;
    let ok = false;
    switch (op) {
      case 'eq':
        ok = statusCode === exp;
        break;
      case 'ne':
        ok = statusCode !== exp;
        break;
      case 'lt':
        ok = typeof exp === 'number' && statusCode < exp;
        break;
      case 'gt':
        ok = typeof exp === 'number' && statusCode > exp;
        break;
      case 'in':
        ok = Array.isArray(exp) && exp.includes(statusCode);
        break;
      default:
        return null; // 未支持的操作符，跳过
    }
    return ok ? null : fail('status_mismatch', `状态码不符：期望 ${String(exp)}，实际 ${statusCode}`, exp, statusCode);
  }

  if (a.type === 'schema') {
    // 目标 schema：校验 target 处值的类型；无 target：校验根类型
    const schema = a.schema as JsonSchema | undefined;
    if (!schema || schema.type === undefined) return null;
    if (a.target) {
      const segs = parseJsonPath(a.target);
      if (!segs) return null;
      const got = evaluateJsonPath(response, segs);
      if (!got.found) {
        return fail('missing', `字段缺失：${a.target}`, schema.type, undefined);
      }
      if (!typesMatch(schema.type, got.value)) {
        return fail(
          'type_mismatch',
          `类型不符：${a.target} 期望 ${String(schema.type)}，实际 ${typeName(got.value)}`,
          schema.type,
          typeName(got.value),
        );
      }
      return null;
    }
    if (!typesMatch(schema.type, response)) {
      return fail(
        'type_mismatch',
        `响应体类型不符：期望 ${String(schema.type)}，实际 ${typeName(response)}`,
        schema.type,
        typeName(response),
      );
    }
    return null;
  }

  // jsonpath / field / header 等：统一走 JSONPath 求值
  if (!a.target) return null;
  const segs = parseJsonPath(a.target);
  if (!segs) return null;
  const got = evaluateJsonPath(response, segs);

  const op = a.operator ?? 'eq';
  if (op === 'exists') {
    return got.found ? null : fail('missing', `字段缺失：${a.target}`, 'exists', undefined);
  }
  if (!got.found) {
    return fail('missing', `字段缺失：${a.target}`, a.expected, undefined);
  }

  switch (op) {
    case 'eq':
      return deepEqual(got.value, a.expected)
        ? null
        : fail('value_mismatch', `取值不符：${a.target} 期望 ${JSON.stringify(a.expected)}，实际 ${JSON.stringify(got.value)}`, a.expected, got.value);
    case 'ne':
      return deepEqual(got.value, a.expected)
        ? fail('value_mismatch', `取值不应等于：${a.target} = ${JSON.stringify(got.value)}`, `!= ${JSON.stringify(a.expected)}`, got.value)
        : null;
    case 'contains':
      return typeof got.value === 'string' && got.value.includes(String(a.expected))
        ? null
        : fail('value_mismatch', `不包含：${a.target} 期望包含 ${JSON.stringify(a.expected)}，实际 ${JSON.stringify(got.value)}`, a.expected, got.value);
    default:
      return null; // 未支持的操作符，跳过
  }
}

/** 根因分类 + 理由 + 建议 */
function classifyRootCause(
  failures: AssertionFailure[],
  actualStatus: number | undefined,
): { root_cause: RootCause; reason: string; suggestions: string[] } {
  const has = (kind: AssertionFailure['kind'], noise?: boolean) =>
    failures.some((f) => f.kind === kind && (noise === undefined || f.noise === noise));

  // 1. 类型变化 → 契约破坏（字段类型属于接口契约，即使易变字段也不应换类型）
  if (has('type_mismatch')) {
    return {
      root_cause: 'contract_break',
      reason: '存在字段类型变化，接口契约被破坏（字段类型属于稳定契约）',
      suggestions: [
        '核对接口契约（OpenAPI/文档）是否已变更',
        '若为有意变更，更新响应 schema 并重新生成断言',
        '若为回归，回滚服务版本',
      ],
    };
  }

  // 2. 状态码变化：5xx 疑似环境/依赖故障，4xx 疑似契约破坏（接口拒绝请求）
  if (has('status_mismatch')) {
    const serverError = actualStatus !== undefined && actualStatus >= 500;
    return serverError
      ? {
          root_cause: 'environment_diff',
          reason: `状态码变为 ${actualStatus}（5xx），疑似环境/依赖服务故障而非业务变更`,
          suggestions: ['检查测试环境与下游依赖服务状态', '确认环境与基线一致后重跑', '排除服务端故障后再评估失败'],
        }
      : {
          root_cause: 'contract_break',
          reason: '状态码变化（非 5xx），接口对请求的处理结果偏离契约',
          suggestions: ['核对接口契约与鉴权/参数要求', '检查是否有破坏性变更', '更新用例期望状态码'],
        };
  }

  // 3. 稳定字段缺失 → 契约破坏
  if (has('missing', false)) {
    return {
      root_cause: 'contract_break',
      reason: '稳定字段缺失，响应结构偏离契约',
      suggestions: ['核对接口契约，确认字段是否被移除或改名', '更新响应 schema', '若字段改为可选，调整断言为 exists/ignore'],
    };
  }

  // 4. 仅易变（噪音）字段缺失 → 环境差异
  if (has('missing', true)) {
    return {
      root_cause: 'environment_diff',
      reason: '易变（噪音）字段缺失，属环境/数据差异而非契约破坏',
      suggestions: ['确认测试数据是否为空/缺失该字段', '必要时将字段从断言中剔除', '重新录制基线'],
    };
  }

  // 5. 取值变化：稳定字段值不同 → 业务变更；仅噪音字段 → 环境差异
  if (has('value_mismatch', false)) {
    return {
      root_cause: 'business_change',
      reason: '字段值变化但结构一致，疑似业务数据变更',
      suggestions: ['确认为预期业务变化后接受新断言', '检查测试数据是否已过期', '更新用例期望值'],
    };
  }
  return {
    root_cause: 'environment_diff',
    reason: '仅易变（噪音）字段取值变化，属正常环境差异',
    suggestions: ['忽略易变字段的取值变化', '必要时收紧/放宽噪音判定规则', '确认环境与基线一致'],
  };
}

/** 构建证据摘要（请求/响应 diff） */
function buildEvidence(
  input: DiagnoseInput,
  failures: AssertionFailure[],
  expectedStatus: number | undefined,
): DiffEvidence {
  const lines: string[] = [];
  const req = input.request;
  if (req?.method || req?.path) {
    lines.push(`请求: ${req.method ?? ''} ${req.path ?? ''}`.trim());
  }
  if (expectedStatus !== undefined || input.status_code !== undefined) {
    lines.push(`状态码: 期望 ${expectedStatus ?? '-'} -> 实际 ${input.status_code ?? '-'}`);
  }
  for (const f of failures) {
    const loc = f.target ?? '(status)';
    lines.push(`- ${loc}: ${f.message}`);
  }
  return {
    expected_status: expectedStatus,
    actual_status: input.status_code,
    failed_count: failures.length,
    failures,
    summary: lines.join('\n'),
  };
}

/**
 * 诊断一次测试执行：实际响应 vs 期望断言。
 * @returns Diagnosis（passed / root_cause / reason / suggestions / evidence）
 */
export function diagnoseFailure(input: DiagnoseInput): Diagnosis {
  const statusAssertions = input.assertions.filter((a) => a.type === 'status');
  const expectedStatus = statusAssertions.length === 1 ? (statusAssertions[0]!.expected as number | undefined) : undefined;

  const raw: AssertionFailure[] = [];
  for (const a of input.assertions) {
    const f = evaluateAssertion(a, input.response, input.status_code);
    if (f) raw.push(f);
  }

  // 同一字段的 exists/type/eq 断言可能对同一次失败重复报「缺失」，
  // 按 (target, kind) 去重，让 diff 摘要更干净（保留首条最明确的说明）。
  const failures: AssertionFailure[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    const key = `${f.target ?? '(status)'}|${f.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push(f);
  }

  if (failures.length === 0) {
    return {
      passed: true,
      root_cause: null,
      reason: '所有断言通过',
      suggestions: [],
      evidence: buildEvidence(input, [], expectedStatus),
    };
  }

  const { root_cause, reason, suggestions } = classifyRootCause(failures, input.status_code);
  return {
    passed: false,
    root_cause,
    reason,
    suggestions,
    evidence: buildEvidence(input, failures, expectedStatus),
  };
}
