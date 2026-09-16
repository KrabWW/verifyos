/**
 * 流式生成源（P2.8）：三个 async generator，把规则式生成过程逐段吐出，
 * 模拟真实 LLM 的 token 流节奏（每段间隔 20-50ms）。
 *
 * 规则式核心复用现有模块（import 而非复制）：
 * - streamGenCase：用例生成——过程文本（分析请求→提取参数→生成断言→用例标题）+ 每条断言块；
 *   断言来自 src/assertion/generate.ts 的 generateSchemaAssertions；
 * - streamGenAssertion：断言生成——逐条吐断言，同样基于 generateSchemaAssertions；
 * - streamDiagnose：失败诊断——逐段吐诊断结论（失败明细→根因分类→修复建议），
 *   结论来自 src/assertion/diagnose.ts 的 diagnoseFailure。
 *
 * 每个生成器：
 * - yield 项：{ text, meta? }（StreamChunk，meta 携带结构化对象如单条断言/失败明细）；
 * - return 值：完整结果对象（TestCase / 断言汇总 / Diagnosis），
 *   由 streamFromIterator 放进 done 事件的 result 字段。
 */
import { randomUUID } from 'node:crypto';
import type { Assertion, HttpMethod, TestCase } from '../types/models.js';
import { generateSchemaAssertions } from '../assertion/generate.js';
import { diagnoseFailure, type DiagnoseInput } from '../assertion/diagnose.js';
import type { Diagnosis } from '../assertion/types.js';
import type { StreamChunk } from './sse.js';

/** 流式吐字间隔（ms），模拟 token 流节奏 */
const CHUNK_DELAY_MS = 25;

/** sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 用例生成输入上下文 */
export interface GenCaseInput {
  /** HTTP 方法 */
  method: HttpMethod;
  /** 请求路径（可带 query，如 /api/users?page=1） */
  path: string;
  /** 真实响应 JSON（已解析对象/数组/标量） */
  response: unknown;
  /** 响应状态码（默认 200） */
  status_code?: number;
}

/** 断言生成输入上下文（用例生成的子集：只需响应即可推导断言） */
export interface GenAssertionInput {
  /** 真实响应 JSON */
  response: unknown;
  /** 响应状态码（默认 200） */
  status_code?: number;
}

/** 单条断言的人读描述（流式文本 + meta 共用） */
function describeAssertion(a: Assertion, index: number): string {
  const no = `断言 ${index}`;
  if (a.type === 'status') {
    return `${no}：[status] 状态码 ${a.operator ?? 'eq'} ${String(a.expected)}`;
  }
  if (a.type === 'schema') {
    const target = a.target ?? '(根)';
    return `${no}：[schema] ${target} 类型 ${String((a.schema as { type?: string } | undefined)?.type)}`;
  }
  const target = a.target ?? '';
  if (a.operator === 'exists') {
    return `${no}：[jsonpath] ${target} 存在（${a.mode === 'ignore' ? '噪音字段，仅存在性' : '严格'}）`;
  }
  return `${no}：[jsonpath] ${target} ${a.operator ?? 'eq'} ${JSON.stringify(a.expected)}`;
}

/** 从路径解析 query 参数（无 query 返回空对象） */
function parseQuery(path: string): Record<string, string[]> {
  const qIndex = path.indexOf('?');
  if (qIndex === -1) return {};
  const out: Record<string, string[]> = {};
  for (const pair of path.slice(qIndex + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = decodeURIComponent(pair.slice(0, eq));
    const val = decodeURIComponent(pair.slice(eq + 1));
    (out[key] ??= []).push(val);
  }
  return out;
}

/**
 * 流式生成测试用例：逐段吐「分析请求 → 提取参数 → 生成断言 → 用例标题」过程。
 * 断言复用 generateSchemaAssertions（规则式），逐条以 delta + meta 推送。
 *
 * @returns 完整 TestCase（source='ai'，review_status='pending'，人审后入库）
 */
export async function* streamGenCase(input: GenCaseInput): AsyncGenerator<StreamChunk, TestCase> {
  const statusCode = input.status_code ?? 200;
  const cleanPath = input.path.split('?')[0] ?? input.path;
  const title = `${input.method} ${cleanPath} 正常返回`;

  // 阶段 1：分析请求
  yield* withDelay([
    { text: `分析请求：${input.method} ${input.path}…\n`, progress: 10 },
    { text: `响应状态码 ${statusCode}，开始解析响应体…\n`, progress: 20 },
  ]);

  // 阶段 2：提取参数（路径段 + query）
  const segments = cleanPath.split('/').filter((s) => s.length > 0);
  const query = parseQuery(input.path);
  const paramLines =
    Object.keys(query).length > 0
      ? `query 参数：${Object.entries(query).map(([k, v]) => `${k}=${v.join(',')}`).join('、')}\n`
      : 'query 参数：无\n';
  yield* withDelay([
    { text: `路径分段：/${segments.join(' / ')}\n`, progress: 30 },
    { text: paramLines, progress: 40 },
  ]);

  // 阶段 3：生成断言（规则式 schema 断言，逐条推送）
  const assertions = generateSchemaAssertions(input.response, { status_code: statusCode });
  const total = assertions.length;
  yield { text: `生成断言：从响应推导 ${total} 条字段级断言…\n`, progress: 50 };
  await sleep(CHUNK_DELAY_MS);
  for (let i = 0; i < total; i += 1) {
    const a = assertions[i]!;
    yield {
      text: `  ${describeAssertion(a, i + 1)}\n`,
      meta: { assertion: a },
      progress: 50 + Math.round(((i + 1) / total) * 40),
    };
    await sleep(CHUNK_DELAY_MS);
  }

  // 阶段 4：用例标题（完成）
  yield { text: `用例 1 标题：${title}\n`, progress: 100 };
  await sleep(CHUNK_DELAY_MS);

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    api_definition_id: '',
    name: title,
    description: `AI 从真实响应流式生成的用例（${input.method} ${input.path}）`,
    request: {
      method: input.method,
      path: cleanPath,
      query_params: query,
      headers: {},
    },
    assertions,
    variables: {},
    source: 'ai',
    tags: ['ai-generated', 'streamed'],
    last_result: 'pending',
    review_status: 'pending',
  };
}

/**
 * 流式生成断言：逐条吐断言（每条一个 delta，meta 携带断言对象）。
 * 规则式核心复用 generateSchemaAssertions。
 *
 * @returns 完整断言汇总 { assertions, count }
 */
export async function* streamGenAssertion(
  input: GenAssertionInput,
): AsyncGenerator<StreamChunk, { assertions: Assertion[]; count: number }> {
  const statusCode = input.status_code ?? 200;
  const assertions = generateSchemaAssertions(input.response, { status_code: statusCode });
  const total = assertions.length;

  yield { text: `基于响应（status ${statusCode}）推导断言，共 ${total} 条：\n`, progress: 5 };
  await sleep(CHUNK_DELAY_MS);

  for (let i = 0; i < total; i += 1) {
    const a = assertions[i]!;
    yield {
      text: `${describeAssertion(a, i + 1)}\n`,
      meta: { assertion: a },
      progress: Math.round(((i + 1) / total) * 100),
    };
    await sleep(CHUNK_DELAY_MS);
  }

  return { assertions, count: total };
}

/**
 * 流式失败诊断：逐段吐诊断结论（评估 → 失败明细 → 根因分类 → 修复建议）。
 * 结论复用 diagnoseFailure（规则式根因分类 + diff 证据）。
 *
 * @returns 完整 Diagnosis（passed / root_cause / reason / suggestions / evidence）
 */
export async function* streamDiagnose(input: DiagnoseInput): AsyncGenerator<StreamChunk, Diagnosis> {
  const req = input.request;
  const reqLine = req?.method || req?.path ? `${req.method ?? ''} ${req.path ?? ''}`.trim() : '未知请求';

  yield { text: `开始诊断：${reqLine}\n`, progress: 10 };
  await sleep(CHUNK_DELAY_MS);
  yield { text: `逐条评估 ${input.assertions.length} 条期望断言 vs 实际响应…\n`, progress: 30 };
  await sleep(CHUNK_DELAY_MS);

  // 规则式诊断（复用，不复制）
  const diagnosis = diagnoseFailure(input);

  if (diagnosis.passed) {
    yield { text: '所有断言通过，无需诊断。\n', progress: 100 };
    await sleep(CHUNK_DELAY_MS);
    return diagnosis;
  }

  // 失败明细（逐条）
  const failures = diagnosis.evidence.failures;
  yield { text: `发现 ${failures.length} 处失败：\n`, progress: 50 };
  await sleep(CHUNK_DELAY_MS);
  for (let i = 0; i < failures.length; i += 1) {
    const f = failures[i]!;
    yield {
      text: `  - ${f.target ?? '(status)'}：${f.message}\n`,
      meta: { failure: f },
      progress: 50 + Math.round(((i + 1) / failures.length) * 20),
    };
    await sleep(CHUNK_DELAY_MS);
  }

  // 根因分类 + 理由 + 建议
  const causeLabel: Record<string, string> = {
    contract_break: '契约破坏（contract_break）',
    business_change: '业务变更（business_change）',
    environment_diff: '环境差异（environment_diff）',
  };
  yield { text: `根因分类：${causeLabel[diagnosis.root_cause ?? ''] ?? diagnosis.root_cause}\n`, progress: 75 };
  await sleep(CHUNK_DELAY_MS);
  yield { text: `理由：${diagnosis.reason}\n`, progress: 85 };
  await sleep(CHUNK_DELAY_MS);
  for (const s of diagnosis.suggestions) {
    yield { text: `建议：${s}\n`, meta: { suggestion: s }, progress: 95 };
    await sleep(CHUNK_DELAY_MS);
  }
  yield { text: '诊断完成。\n', progress: 100 };
  await sleep(CHUNK_DELAY_MS);

  return diagnosis;
}

/** 批量延迟吐出（工具：给已有 chunk 数组统一加节奏） */
async function* withDelay(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const c of chunks) {
    yield c;
    await sleep(CHUNK_DELAY_MS);
  }
}
