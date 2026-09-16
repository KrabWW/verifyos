/**
 * spec → 测试用例生成器（A6）。
 *
 * 输入：A4 产出的 `OpenApiDocument`（含 operation / 参数 / 请求体 schema / 响应码）。
 * 输出：三类用例（均复用 `TestCase` 模型，落到 `test_case` 表语义）：
 * - happy-path：按 schema 取合法样例值，断言 2xx；
 * - edge-case ：规则式边界用例，断言 4xx（缺失必填 / 空串 / 越界 / 错误类型 / 非法枚举 / 数组越界）；
 * - fuzz      ：属性测试式采样（随机+边界），断言「非 5xx」，命中 500/schema 违规即报。
 *
 * AI 增强（LLM）：本 ticket 用规则式实现；`LlmEnhancer` 接口与 `llm` 选项已预留，
 * 但 api-test 当前无 LLM 配置，`generateTestCases` 不调用它（后置接入）。
 */
import { randomUUID } from 'node:crypto';
import type { ApiDefinition, Assertion, TestCase } from '../types/models.js';
import type { OpenApiDocument, OpenApiOperation, OpenApiParameter } from '../inventory/openapi.js';
import { keyOf } from '../inventory/normalize.js';
import {
  displayPath,
  invalidValues,
  nestedFields,
  omitNestedValue,
  setNestedValue,
} from './edge.js';
import { createRng, fuzzValue } from './fuzz.js';
import { sampleValue } from './sample.js';

/** 用例类别 */
export type CaseKind = 'happy-path' | 'edge-case' | 'fuzz';

/** 生成产物：在 TestCase 基础上补充生成期元数据 */
export interface GeneratedTestCase extends TestCase {
  kind: CaseKind;
  /** edge-case 子类别（happy-path / fuzz 无） */
  edge_category?: string;
  /** 期望结果说明（可读文本，供人判断用例意图） */
  expectation: string;
}

/**
 * 预留的 LLM 增强接口（可选，本 ticket 不实现）。
 * 后续接入 LLM 时，实现该接口以基于规则用例生成「更聪明」的额外用例。
 */
export interface LlmEnhancer {
  enhance(operation: OpenApiOperation, ruleCases: GeneratedTestCase[]): Promise<GeneratedTestCase[]>;
}

/** 生成选项 */
export interface GenerateOptions {
  /** 每个 operation 的 fuzz 用例数（默认 20） */
  fuzzCount?: number;
  /** PRNG 种子（默认 1，保证可复现） */
  seed?: number;
  /** api_definition 列表，用于回填 api_definition_id（可选） */
  definitions?: ApiDefinition[];
  /** 预留：LLM 增强（当前忽略，见顶部注释） */
  llm?: LlmEnhancer;
  /** P1.5 嵌套 edge-case / fuzz 的最大下钻深度（默认 3，防组合爆炸） */
  maxDepth?: number;
}

/** 单次请求构建时的「变异」描述：一次 edge-case 只应用一种变异 */
interface RequestMutation {
  omitQuery?: string;
  omitHeader?: string;
  /** 删除请求体字段，路径段列表（如 ['data','user','email']，'[]' 表示数组层） */
  omitBodyField?: string[];
  setParam?: { param: OpenApiParameter; value: unknown };
  /** 设置请求体字段为非法值，路径段列表 */
  setBodyField?: { segments: string[]; value: unknown };
}

const CLIENT_ERROR_CODES = [400, 404, 422];

/** 生成整个文档的测试用例（happy-path + edge-case + fuzz） */
export function generateTestCases(doc: OpenApiDocument, opts: GenerateOptions = {}): GeneratedTestCase[] {
  const fuzzCount = opts.fuzzCount ?? 20;
  const seed = opts.seed ?? 1;
  const maxDepth = opts.maxDepth ?? 3;
  const byKey = new Map((opts.definitions ?? []).map((d) => [keyOf(d.method, d.path), d]));
  const now = new Date().toISOString();
  const out: GeneratedTestCase[] = [];

  doc.operations.forEach((op, index) => {
    const def = byKey.get(keyOf(op.method, op.normalized_path));
    const definitionId = def?.id ?? 'unknown';
    out.push(buildHappyCase(op, definitionId, now));
    out.push(...buildEdgeCases(op, definitionId, now, maxDepth));
    out.push(...buildFuzzCases(op, definitionId, now, { fuzzCount, seed: seed + index, maxDepth }));
  });
  return out;
}

/** 生成统计（供验收断言 / 报告） */
export interface GenerationSummary {
  total: number;
  byKind: Record<CaseKind, number>;
  edgeCategories: string[];
  operations: number;
}

export function summarize(cases: GeneratedTestCase[], operations: number): GenerationSummary {
  const byKind: Record<CaseKind, number> = { 'happy-path': 0, 'edge-case': 0, fuzz: 0 };
  const categories = new Set<string>();
  for (const c of cases) {
    byKind[c.kind] += 1;
    if (c.edge_category) categories.add(c.edge_category);
  }
  return { total: cases.length, byKind, edgeCategories: [...categories].sort(), operations };
}

/** 导出为 JSON 字符串（可回放 / 可落盘） */
export function exportCases(cases: GeneratedTestCase[]): string {
  return JSON.stringify(cases, null, 2);
}

/* ------------------------------ happy-path ------------------------------ */

function buildHappyCase(op: OpenApiOperation, definitionId: string, now: string): GeneratedTestCase {
  const status = expectedSuccessStatus(op);
  return {
    id: randomUUID(),
    api_definition_id: definitionId,
    name: `${op.method} ${op.path} happy-path`,
    description: '由 spec 生成：按参数 / 请求体 schema 取合法样例值',
    request: buildRequest(op),
    assertions: [statusEq(status)],
    variables: {},
    source: 'spec',
    tags: ['happy-path', ...op.tags],
    last_result: 'pending',
    review_status: 'pending',
    created_at: now,
    updated_at: now,
    kind: 'happy-path',
    expectation: `expect ${status}`,
  };
}

/* ------------------------------ edge-case ------------------------------- */

function buildEdgeCases(op: OpenApiOperation, definitionId: string, now: string, maxDepth: number): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const bodySchema = op.request_body?.schema;

  // 参数级
  for (const p of op.parameters) {
    if (p.required && (p.in === 'query' || p.in === 'header')) {
      const mutation: RequestMutation = p.in === 'query' ? { omitQuery: p.name } : { omitHeader: p.name };
      cases.push(makeEdgeCase(op, definitionId, now, 'missing_required', `缺失必填参数 ${p.in}.${p.name}`, mutation));
    }
    for (const iv of invalidValues(p.schema)) {
      cases.push(
        makeEdgeCase(op, definitionId, now, iv.category, `参数 ${p.in}.${p.name} 非法值(${iv.category})`, {
          setParam: { param: p, value: iv.value },
        }),
      );
    }
  }

  // 请求体级（P1.5：递归覆盖嵌套字段，路径用 JSONPath 风格展示，深度受 maxDepth 限制）
  if (bodySchema) {
    for (const field of nestedFields(bodySchema, maxDepth)) {
      const label = `body.${displayPath(field.segments)}`;
      if (field.required) {
        cases.push(
          makeEdgeCase(op, definitionId, now, 'missing_required', `缺失必填字段 ${label}`, {
            omitBodyField: field.segments,
          }),
        );
      }
      for (const iv of invalidValues(field.schema)) {
        cases.push(
          makeEdgeCase(op, definitionId, now, iv.category, `字段 ${label} 非法值(${iv.category})`, {
            setBodyField: { segments: field.segments, value: iv.value },
          }),
        );
      }
    }
  }

  return cases;
}

function makeEdgeCase(
  op: OpenApiOperation,
  definitionId: string,
  now: string,
  category: string,
  label: string,
  mutation: RequestMutation,
): GeneratedTestCase {
  return {
    id: randomUUID(),
    api_definition_id: definitionId,
    name: `${op.method} ${op.path} edge-case: ${label}`,
    description: `规则式边界用例：${label}`,
    request: buildRequest(op, mutation),
    assertions: [statusIn(CLIENT_ERROR_CODES)],
    variables: {},
    source: 'spec',
    tags: ['edge-case', category, ...op.tags],
    last_result: 'pending',
    review_status: 'pending',
    created_at: now,
    updated_at: now,
    kind: 'edge-case',
    edge_category: category,
    expectation: 'expect 4xx（违反 schema 应被拒）',
  };
}

/* -------------------------------- fuzz ---------------------------------- */

function buildFuzzCases(
  op: OpenApiOperation,
  definitionId: string,
  now: string,
  opts: { fuzzCount: number; seed: number; maxDepth: number },
): GeneratedTestCase[] {
  const rng = createRng(opts.seed);
  const out: GeneratedTestCase[] = [];
  for (let i = 0; i < opts.fuzzCount; i++) {
    out.push(makeFuzzCase(op, definitionId, now, rng, i, opts.maxDepth));
  }
  return out;
}

function makeFuzzCase(
  op: OpenApiOperation,
  definitionId: string,
  now: string,
  rng: ReturnType<typeof createRng>,
  index: number,
  maxDepth: number,
): GeneratedTestCase {
  return {
    id: randomUUID(),
    api_definition_id: definitionId,
    name: `${op.method} ${op.path} fuzz#${index}`,
    description: '属性式 fuzz：参数空间随机+边界采样，找 500/schema 违规',
    request: buildFuzzRequest(op, rng, maxDepth),
    assertions: [statusLt(500)],
    variables: {},
    source: 'spec',
    tags: ['fuzz', ...op.tags],
    last_result: 'pending',
    review_status: 'pending',
    created_at: now,
    updated_at: now,
    kind: 'fuzz',
    expectation: 'expect 非 5xx（命中 500 即报）',
  };
}

/* ---------------------------- 请求构建 ---------------------------------- */

function buildRequest(op: OpenApiOperation, mutation?: RequestMutation): TestCase['request'] {
  const query: Record<string, string[]> = {};
  const headers: Record<string, string> = {};
  let path = op.path;

  for (const p of op.parameters) {
    if (mutation?.omitQuery === p.name && p.in === 'query') continue;
    if (mutation?.omitHeader === p.name && p.in === 'header') continue;
    const value = mutation?.setParam && mutation.setParam.param === p ? mutation.setParam.value : sampleValue(p.schema);
    if (p.in === 'query') query[p.name] = [stringify(value)];
    else if (p.in === 'header') headers[p.name] = stringify(value);
    else if (p.in === 'path') path = path.replace(`{${p.name}}`, stringify(value));
  }

  let body: unknown;
  if (op.request_body?.schema) {
    body = sampleValue(op.request_body.schema);
    if (body !== null && typeof body !== 'object') body = {}; // 变异应用需要对象容器
    if (mutation?.omitBodyField) omitNestedValue(body, mutation.omitBodyField);
    if (mutation?.setBodyField) setNestedValue(body as Record<string, unknown>, mutation.setBodyField.segments, mutation.setBodyField.value);
  }

  const requestBodySchema = op.request_body?.schema;
  const bodyStr = requestBodySchema ? JSON.stringify(body) : undefined;
  if (op.request_body?.content_type) headers['content-type'] = op.request_body.content_type;

  return { method: op.method, path, query_params: query, headers, body: bodyStr };
}

function buildFuzzRequest(op: OpenApiOperation, rng: ReturnType<typeof createRng>, maxDepth: number): TestCase['request'] {
  const query: Record<string, string[]> = {};
  const headers: Record<string, string> = {};
  let path = op.path;

  for (const p of op.parameters) {
    const value = fuzzValue(p.schema, rng, maxDepth);
    if (p.in === 'query') query[p.name] = [stringify(value)];
    else if (p.in === 'header') headers[p.name] = stringify(value);
    else if (p.in === 'path') path = path.replace(`{${p.name}}`, stringify(value));
  }

  const bodySchema = op.request_body?.schema;
  const body = bodySchema ? fuzzValue(bodySchema, rng, maxDepth) : undefined;
  if (op.request_body?.content_type) headers['content-type'] = op.request_body.content_type;

  return { method: op.method, path, query_params: query, headers, body: bodySchema ? JSON.stringify(body) : undefined };
}

/* ---------------------------- 断言 / 工具 ------------------------------- */

function statusEq(code: number): Assertion {
  return { type: 'status', operator: 'eq', expected: code };
}

function statusIn(codes: number[]): Assertion {
  return { type: 'status', operator: 'in', expected: codes };
}

function statusLt(code: number): Assertion {
  return { type: 'status', operator: 'lt', expected: code };
}

function expectedSuccessStatus(op: OpenApiOperation): number {
  const ok = op.responses.find((r) => r.status_code >= 200 && r.status_code < 300);
  return ok?.status_code ?? op.responses[0]?.status_code ?? 200;
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
