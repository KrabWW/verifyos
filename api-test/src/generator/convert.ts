/**
 * 录制 → 测试用例 转换（A3 主逻辑）。
 *
 * 输入：RecordingSession.export() 的产物（SessionExport：records + 按 method+path 归组的 apis）。
 * 输出：GenerationResult（每 API 一组 happy-path 用例 + 噪音明细 + 依赖 mock）。
 *
 * 流程：
 * 1. 每个 API 组选一条 happy-path 样本（优先 2xx）；
 * 2. 请求快照脱敏：token 类 header/body/query 字段打码，不把真实凭据写进用例；
 * 3. 断言生成：status 严格相等 + 响应体 schema 摘要 + 字段级断言（噪音字段标 ignore，非噪音严格相等）；
 * 4. 依赖 mock：目标服务响应快照 + body 中指向其它 host 的下游引用。
 *
 * caveat：AI/录制自动生成仍需人工审阅，生成的 TestCase.review_status 恒为 'pending'。
 */
import { randomUUID } from 'node:crypto';
import type { Assertion, TestCase, TrafficRecord } from '../types/models.js';
import type { SessionExport } from '../recorder/types.js';
import { classifyValue, describeRule, isTokenHeader, isTokenKey, redactSample } from './noise.js';
import { buildJsonPath, parseJson, summarizeSchema, walkLeaves, type PathSegment } from './schema.js';
import { generateMocks } from './mock.js';
import type { GenerationResult, GeneratedTestCase, NoiseFinding } from './types.js';

/** 脱敏占位符 */
const REDACTED = '<REDACTED>';

/** 选中某 API 组的 happy-path 样本：优先 2xx，否则首条 */
function pickHappyPath(samples: TrafficRecord[]): TrafficRecord | undefined {
  return samples.find((r) => r.status_code >= 200 && r.status_code < 300) ?? samples[0];
}

/** token 类 header 脱敏（返回新 headers + 噪音明细） */
function redactTokenHeaders(
  headers: Record<string, string>,
  findings: NoiseFinding[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isTokenHeader(key)) {
      findings.push({
        location: 'request_header',
        path: key,
        rule: 'token_header',
        reason: describeRule('token_header'),
        sample: redactSample(value, 'token_header'),
      });
      out[key] = REDACTED;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** 深度脱敏 JSON 节点（仅按 shouldRedact 命中规则打码），返回脱敏后的新节点 */
function redactNode(
  node: unknown,
  segments: PathSegment[],
  location: NoiseFinding['location'],
  findings: NoiseFinding[],
  shouldRedact: (rule: NonNullable<ReturnType<typeof classifyValue>>) => boolean,
): unknown {
  if (Array.isArray(node)) {
    return node.map((item, index) => redactNode(item, [...segments, index], location, findings, shouldRedact));
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      out[key] = redactNode(child, [...segments, key], location, findings, shouldRedact);
    }
    return out;
  }
  const key = String(segments[segments.length - 1] ?? '$');
  const rule = classifyValue(key, node);
  if (rule && shouldRedact(rule)) {
    findings.push({
      location,
      path: buildJsonPath(segments),
      rule,
      reason: describeRule(rule),
      sample: redactSample(node, rule),
    });
    return REDACTED;
  }
  return node;
}

/** 请求体 token 字段脱敏；非 JSON 原样返回 */
function redactBodyTokens(
  body: string | undefined,
  findings: NoiseFinding[],
): string | undefined {
  const json = parseJson(body);
  if (json === undefined) return body;
  const redacted = redactNode(json, [], 'request_body', findings, (rule) => rule === 'token_field');
  return JSON.stringify(redacted);
}

/** 请求 query token 字段脱敏 */
function redactQueryTokens(
  query: Record<string, string[]>,
  findings: NoiseFinding[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(query)) {
    if (isTokenKey(key)) {
      findings.push({
        location: 'request_query',
        path: key,
        rule: 'token_field',
        reason: describeRule('token_field'),
        sample: redactSample(values.join(','), 'token_field'),
      });
      out[key] = [REDACTED];
    } else {
      out[key] = [...values];
    }
  }
  return out;
}

/** 构建请求快照（脱敏后） */
function buildRequestSnapshot(
  record: TrafficRecord,
  findings: NoiseFinding[],
): TestCase['request'] {
  return {
    method: record.method,
    path: record.path,
    query_params: redactQueryTokens(record.query_params, findings),
    headers: redactTokenHeaders(record.request_headers, findings),
    body: redactBodyTokens(record.request_body, findings),
  };
}

/** 构建断言列表：status + schema 摘要 + 字段级（噪音标 ignore / 非噪音 strict） */
function buildAssertions(record: TrafficRecord, findings: NoiseFinding[]): Assertion[] {
  const assertions: Assertion[] = [];

  // 1. 状态码严格相等
  assertions.push({ type: 'status', operator: 'eq', expected: record.status_code, mode: 'strict' });

  const body = parseJson(record.response_body);
  if (body === undefined) {
    // 非 JSON 响应体：不产出字段级断言，仅保 status（诚实：无法稳定断言原始文本）
    return assertions;
  }

  // 2. 响应体 schema 摘要（噪音字段在 schema 节点上注解 x-mode=ignore）
  assertions.push({ type: 'schema', schema: summarizeSchema(body), mode: 'strict' });

  // 3. 字段级断言：噪音字段标 ignore（仅断言存在性），非噪音字段严格相等
  for (const leaf of walkLeaves(body)) {
    const target = buildJsonPath(leaf.path);
    const rule = classifyValue(leaf.key, leaf.value);
    if (rule) {
      findings.push({
        location: 'response_body',
        path: target,
        rule,
        reason: describeRule(rule),
        sample: redactSample(leaf.value, rule),
      });
      assertions.push({ type: 'jsonpath', target, operator: 'exists', mode: 'ignore' });
    } else {
      assertions.push({ type: 'jsonpath', target, operator: 'eq', expected: leaf.value, mode: 'strict' });
    }
  }

  return assertions;
}

/** 把一条录制样本转成一条 GeneratedTestCase */
function recordToCase(record: TrafficRecord, apiKey: string, now: string): GeneratedTestCase {
  const findings: NoiseFinding[] = [];
  const testCase: TestCase = {
    id: randomUUID(),
    // A4 inventory 未关联（当前从 SessionExport 直接生成，无 api_definition_id），留空待回填
    api_definition_id: '',
    name: `${apiKey}（happy-path）`,
    description: `由录制流量自动生成（记录 ${record.id}）。AI 生成仍需人审。`,
    request: buildRequestSnapshot(record, findings),
    assertions: buildAssertions(record, findings),
    variables: {},
    source: 'recorded',
    tags: ['recorded', 'auto-generated'],
    last_result: 'pending',
    review_status: 'pending',
    created_at: now,
    updated_at: now,
  };

  return {
    test_case: testCase,
    noise_findings: findings,
    mocks: generateMocks(record),
  };
}

/** 录制会话 → 测试用例生成结果 */
export function convertSessionToCases(exported: SessionExport): GenerationResult {
  const byId = new Map(exported.records.map((r) => [r.id, r]));
  const now = new Date().toISOString();
  const cases: GeneratedTestCase[] = [];

  for (const api of exported.apis) {
    const samples = api.sample_ids
      .map((id) => byId.get(id))
      .filter((r): r is TrafficRecord => r !== undefined);
    const record = pickHappyPath(samples);
    if (!record) continue;
    cases.push(recordToCase(record, `${api.method} ${api.path}`, now));
  }

  const totalAssertions = cases.reduce((sum, c) => sum + c.test_case.assertions.length, 0);
  const totalNoise = cases.reduce((sum, c) => sum + c.noise_findings.length, 0);
  const totalMocks = cases.reduce((sum, c) => sum + c.mocks.length, 0);

  return {
    session_id: exported.session.id,
    generated_at: now,
    cases,
    summary: {
      total_cases: cases.length,
      total_assertions: totalAssertions,
      total_noise_ignored: totalNoise,
      total_mocks: totalMocks,
    },
  };
}
