/**
 * 场景断言评估（A8 最小实现，场景内用）。
 *
 * 跑场景时给每个 Assertion 打 pass/fail，产出报告所需的断言明细。
 * 覆盖断言类型：status / jsonpath / field / header / schema（轻量类型检查）/ regex。
 *
 * 诚实范围：这是「跑场景出报告」所需的最小评估器，不含 ajv / jsonpath-plus；
 * A7 引入完整断言引擎后，本模块可改为复用其能力（见 src/assertion/ 占位说明）。
 */
import type { Assertion, JsonSchema } from '../types/models.js';
import { parseJson } from '../generator/schema.js';
import { jsonpathGet } from './jsonpath.js';
import type { HttpResponse } from './transport.js';
import type { AssertionOutcome } from './types.js';

/** 取响应体解析出的 JSON（非 JSON 返回 undefined） */
function bodyJson(response: HttpResponse): unknown {
  return parseJson(response.body);
}

/** 大小写不敏感取响应头 */
function headerOf(response: HttpResponse, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/** 递归深比较（对象键序无关，数组按序） */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function isPlainObject(v: unknown): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? Number.NaN : n;
}

/** 按操作符比较 actual 与 expected */
function compare(operator: string | undefined, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case 'ne':
      return !deepEqual(actual, expected);
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected);
      if (Array.isArray(actual)) return actual.some((item) => deepEqual(item, expected));
      return false;
    case 'matches':
      return typeof actual === 'string' && new RegExp(String(expected)).test(actual);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'in':
      return Array.isArray(expected) && expected.some((item) => deepEqual(actual, item));
    case 'gt':
      return toNumber(actual) > toNumber(expected);
    case 'lt':
      return toNumber(actual) < toNumber(expected);
    case 'eq':
    default:
      return deepEqual(actual, expected);
  }
}

/** 轻量 schema 类型检查：仅比对外层 type，诚实声明未引入 ajv 完整校验 */
function checkSchema(actual: unknown, schema: JsonSchema | undefined): { passed: boolean; message: string } {
  if (!schema) {
    return { passed: true, message: 'schema 断言无 schema 定义，跳过' };
  }
  const expectedType = schema['type'];
  if (expectedType === undefined) {
    return { passed: true, message: 'schema 断言未声明 type，跳过' };
  }
  const actualType = actual === null ? 'null' : Array.isArray(actual) ? 'array' : typeof actual;
  const passed = actualType === expectedType;
  return {
    passed,
    message: passed
      ? `schema 类型匹配（${String(expectedType)}）`
      : `schema 类型不匹配：期望 ${String(expectedType)}，实际 ${actualType}`,
  };
}

/** 评估单条断言 */
export function evaluateAssertion(assertion: Assertion, response: HttpResponse): AssertionOutcome {
  const { type, target, operator, expected, mode } = assertion;

  // ignore 模式：仅断言存在性（噪音字段），覆盖任意操作符
  if (mode === 'ignore') {
    let actual: unknown;
    if (type === 'status') actual = response.status_code;
    else if (type === 'header') actual = headerOf(response, target ?? '');
    else if (type === 'jsonpath') actual = jsonpathGet(bodyJson(response), target ?? '');
    else if (type === 'field') {
      const body = bodyJson(response);
      actual = isPlainObject(body) ? (body as Record<string, unknown>)[target ?? ''] : undefined;
    } else {
      actual = jsonpathGet(bodyJson(response), target ?? '');
    }
    const passed = actual !== undefined && actual !== null;
    return {
      type, target, operator, expected, actual,
      passed,
      message: passed ? '字段存在（ignore 模式）' : '字段缺失（ignore 模式期望存在）',
    };
  }

  switch (type) {
    case 'status': {
      const actual = response.status_code;
      const passed = compare(operator, actual, expected);
      return { type, target, operator, expected, actual, passed, message: describe(operator, actual, expected) };
    }
    case 'header': {
      const actual = headerOf(response, target ?? '');
      const passed = compare(operator, actual, expected);
      return { type, target, operator, expected, actual, passed, message: describe(operator, actual, expected) };
    }
    case 'jsonpath': {
      const actual = jsonpathGet(bodyJson(response), target ?? '');
      const passed = compare(operator, actual, expected);
      return { type, target, operator, expected, actual, passed, message: describe(operator, actual, expected) };
    }
    case 'field': {
      const body = bodyJson(response);
      const actual = isPlainObject(body) ? (body as Record<string, unknown>)[target ?? ''] : undefined;
      const passed = compare(operator, actual, expected);
      return { type, target, operator, expected, actual, passed, message: describe(operator, actual, expected) };
    }
    case 'schema': {
      const actual = bodyJson(response);
      const { passed, message } = checkSchema(actual, assertion.schema);
      return { type, target, operator, expected, actual, passed, message };
    }
    case 'regex': {
      const pattern = target ?? String(expected ?? '');
      const passed = new RegExp(pattern).test(response.body);
      return { type, target, operator, expected, actual: response.body, passed, message: describe(operator, response.body, pattern) };
    }
    default:
      return { type, target, operator, expected, passed: false, message: `不支持的断言类型：${String(type)}` };
  }
}

/** 评估断言列表 */
export function evaluateAssertions(assertions: Assertion[], response: HttpResponse): AssertionOutcome[] {
  return assertions.map((a) => evaluateAssertion(a, response));
}

/** 人读的比较结果说明 */
function describe(operator: string | undefined, actual: unknown, expected: unknown): string {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  switch (operator) {
    case 'ne':
      return `期望 != ${e}，实际 ${a}`;
    case 'contains':
      return `期望包含 ${e}，实际 ${a}`;
    case 'matches':
      return `期望匹配 /${String(expected)}/，实际 ${a}`;
    case 'exists':
      return actual === undefined ? '期望字段存在' : '字段存在';
    case 'in':
      return `期望属于 ${e}，实际 ${a}`;
    case 'gt':
      return `期望 > ${e}，实际 ${a}`;
    case 'lt':
      return `期望 < ${e}，实际 ${a}`;
    case 'eq':
    default:
      return `期望 = ${e}，实际 ${a}`;
  }
}
