/**
 * schema 级断言生成（A7 核心 1）：从真实响应 JSON 推导字段级断言。
 *
 * 规则式实现（api-test 暂无 LLM 配置，见 README）：
 * - 顶层：status 严格相等 + 响应体 schema 摘要（summarizeSchema，覆盖全字段类型）；
 * - 每个叶子字段三类断言：
 *   1. 存在性 exists（`type: jsonpath` + `operator: exists`）；
 *   2. 类型（`type: schema` + `target` + `schema: { type }`，断言该字段的 JSON 类型）；
 *   3. 取值 eq（`type: jsonpath` + `operator: eq`，仅非噪音字段；噪音字段只断言存在性）。
 *
 * 比 A3 的泛泛 status 检查更细：显式断言每个字段的「存在 + 类型 + 取值」。
 * 噪音判定复用 generator/noise.ts 的 classifyValue（时间戳/随机 ID/token 标 ignore）。
 *
 * LLM 增强：`llm()` 参数预留，本 ticket 不调用（规则式 + 说明见类型注释）。
 */
import type { Assertion, JsonSchema } from '../types/models.js';
import { classifyValue } from '../generator/noise.js';
import { buildJsonPath, summarizeSchema, walkLeaves } from '../generator/schema.js';
import type { GenerateAssertOptions } from './types.js';

/** 标量/数组 → JSON Schema type 名 */
function typeNameOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value; // string / number / boolean / object
}

/** 用已生成断言里某 target 的 mode 对齐噪音判定（保持与预期断言一致） */
function existingModeOf(
  existing: Assertion[] | undefined,
  target: string,
): 'strict' | 'ignore' | undefined {
  return existing?.find((a) => a.target === target)?.mode;
}

/**
 * 从真实响应生成 schema 级断言。
 *
 * @param response 真实响应 JSON（已解析对象/数组/标量）
 * @param opts 选项：status_code / existing（预期断言，用于对齐噪音）/ llm（预留，当前忽略）
 * @returns 断言列表（status + 顶层 schema + 每个叶子字段的 exists/type/eq）
 */
export function generateSchemaAssertions(
  response: unknown,
  opts: GenerateAssertOptions = {},
): Assertion[] {
  const assertions: Assertion[] = [];
  const statusCode = opts.status_code ?? 200;

  // 1. 状态码严格相等
  assertions.push({ type: 'status', operator: 'eq', expected: statusCode, mode: 'strict' });

  // 2. 响应体 schema 摘要（噪音字段在 schema 节点上注解 x-mode=ignore）
  assertions.push({ type: 'schema', schema: summarizeSchema(response), mode: 'strict' });

  // 3. 字段级断言：存在性 + 类型 + 取值（噪音字段仅存在性，且标 ignore）
  for (const leaf of walkLeaves(response)) {
    const target = buildJsonPath(leaf.path);
    const aligned = existingModeOf(opts.existing, target);
    const rule = classifyValue(leaf.key, leaf.value);
    const noise = aligned !== undefined ? aligned === 'ignore' : rule !== null;

    // 存在性
    assertions.push({ type: 'jsonpath', target, operator: 'exists', mode: noise ? 'ignore' : 'strict' });

    // 类型（schema 断言：target 处的值应匹配该 JSON 类型）
    const typeSchema: JsonSchema = { type: typeNameOf(leaf.value) };
    assertions.push({ type: 'schema', target, schema: typeSchema, mode: noise ? 'ignore' : 'strict' });

    // 取值：仅非噪音字段严格相等
    if (!noise) {
      assertions.push({ type: 'jsonpath', target, operator: 'eq', expected: leaf.value, mode: 'strict' });
    }
  }

  return assertions;
}
