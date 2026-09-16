/**
 * JSON Schema → 合法样例值（happy-path 用）。
 *
 * 规则式生成，不依赖 LLM：按 schema 的 example / default / enum / format / type 依次取一个
 * 「大概率合法」的值。这是 A6 happy-path 用例、以及 edge-case / fuzz 里「合法基准」的取值来源。
 *
 * 与 A4 的 `JsonSchema`（`Record<string, unknown>` 宽松类型）对齐，仅识别常见子集：
 * type / enum / format / minimum / maximum / minLength / maxLength / minItems / maxItems /
 * properties / required / items / anyOf / oneOf / allOf。
 */
import type { JsonSchema } from '../types/models.js';

/** 宽松取值：object 非数组 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** 宽松取值：数组 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 读取 schema 的主类型（type 可能是字符串或数组，取第一个可识别的字符串） */
export function schemaType(schema: JsonSchema | undefined): string | undefined {
  if (!schema) return undefined;
  const t = schema.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) {
    for (const item of t) {
      if (typeof item === 'string') return item;
    }
  }
  return undefined;
}

/** 生成一个合法样例值 */
export function sampleValue(schema: JsonSchema | undefined): unknown {
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  const en = asArray(schema.enum);
  if (en.length > 0) return en[0];

  switch (schemaType(schema)) {
    case 'string':
      return sampleString(schema);
    case 'integer':
      return sampleInteger(schema);
    case 'number':
      return sampleNumber(schema);
    case 'boolean':
      return true;
    case 'array':
      return sampleArray(schema);
    case 'object':
      return sampleObject(schema);
    default:
      return sampleFromCombinator(schema);
  }
}

function sampleString(schema: JsonSchema): string {
  const format = typeof schema.format === 'string' ? schema.format : '';
  switch (format) {
    case 'uuid':
      return '00000000-0000-4000-8000-000000000000';
    case 'date':
      return '2026-01-01';
    case 'date-time':
      return '2026-01-01T00:00:00Z';
    case 'email':
      return 'user@example.com';
    case 'hostname':
      return 'example.com';
    case 'ipv4':
      return '192.0.2.1';
    case 'uri':
      return 'https://example.com/resource';
    default:
      break;
  }
  const min = typeof schema.minLength === 'number' && schema.minLength > 0 ? schema.minLength : 0;
  return min > 0 ? 'a'.repeat(min) : 'string';
}

function sampleInteger(schema: JsonSchema): number {
  if (typeof schema.minimum === 'number') return Math.ceil(schema.minimum);
  if (typeof schema.maximum === 'number') return Math.floor(schema.maximum);
  return 0;
}

function sampleNumber(schema: JsonSchema): number {
  if (typeof schema.minimum === 'number') return schema.minimum;
  if (typeof schema.maximum === 'number') return schema.maximum;
  return 0;
}

function sampleArray(schema: JsonSchema): unknown[] {
  const item = asRecord(schema.items);
  const minItems = typeof schema.minItems === 'number' && schema.minItems > 0 ? schema.minItems : 1;
  const count = Math.max(1, Math.floor(minItems));
  return Array.from({ length: count }, () => sampleValue(item));
}

function sampleObject(schema: JsonSchema): Record<string, unknown> {
  const props = asRecord(schema.properties) ?? {};
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(props)) {
    out[name] = sampleValue(asRecord(raw));
  }
  return out;
}

/** anyOf / oneOf / allOf：取第一个子 schema 的样例（深度受限的近似） */
function sampleFromCombinator(schema: JsonSchema): unknown {
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const subs = asArray(schema[key]);
    if (subs.length > 0) return sampleValue(asRecord(subs[0]));
  }
  return null;
}
