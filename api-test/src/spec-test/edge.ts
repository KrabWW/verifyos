/**
 * 边界用例的「非法值」生成（edge-case 用）。
 *
 * 规则式：对给定 schema 推导出一组可触发的非法取值，配合「缺失必填」一起构成
 * A6 edge-case 的核心。类别（对标 ticket 验收）：
 * - empty_string   空字符串
 * - out_of_range   越界数字
 * - wrong_type     错误类型
 * - invalid_enum   非法枚举
 * - array_bounds   数组越界（条目数超限）
 * 另有 missing_required（缺失必填）在 generate.ts 按 required 字段/参数单独生成。
 */
import type { JsonSchema } from '../types/models.js';
import { sampleValue, schemaType } from './sample.js';

/** 一个非法取值及其类别 */
export interface InvalidValue {
  category: 'empty_string' | 'out_of_range' | 'wrong_type' | 'invalid_enum' | 'array_bounds';
  value: unknown;
}

/** 枚举出某 schema 适用的非法取值列表（不适用的类别自动跳过） */
export function invalidValues(schema: JsonSchema | undefined): InvalidValue[] {
  const out: InvalidValue[] = [];
  if (!schema) return out;

  const type = schemaType(schema);
  if (type === 'string') {
    out.push({ category: 'empty_string', value: '' });
    out.push({ category: 'wrong_type', value: 123 });
  }
  if (type === 'integer' || type === 'number') {
    out.push({ category: 'out_of_range', value: outOfRangeNumber(schema, type) });
    out.push({ category: 'wrong_type', value: 'not-a-number' });
  }
  if (type === 'boolean') {
    out.push({ category: 'wrong_type', value: 'true' });
  }
  if (type === 'array') {
    out.push({ category: 'array_bounds', value: oversizedArray(schema) });
    out.push({ category: 'wrong_type', value: 'not-an-array' });
  }
  if (type === 'object') {
    out.push({ category: 'wrong_type', value: 'not-an-object' });
  }

  const en = Array.isArray(schema.enum) ? schema.enum : [];
  if (en.length > 0) {
    out.push({ category: 'invalid_enum', value: valueNotInEnum(en) });
  }
  return out;
}

/** 越界数字：优先突破 maximum/minimum，无界时用远超常规的量 */
function outOfRangeNumber(schema: JsonSchema, type: string): number {
  if (typeof schema.maximum === 'number') return schema.maximum + 1;
  if (typeof schema.minimum === 'number') return schema.minimum - 1;
  return type === 'integer' ? Number.MAX_SAFE_INTEGER : Number.MAX_VALUE;
}

/** 数组越界：条目数超过 maxItems（无 maxItems 时按 6 条触发常见上限） */
function oversizedArray(schema: JsonSchema): unknown[] {
  const item = schema.items;
  const itemSchema = typeof item === 'object' && item !== null ? (item as JsonSchema) : undefined;
  const max = typeof schema.maxItems === 'number' ? Math.floor(schema.maxItems) : 5;
  const count = max + 1;
  return Array.from({ length: count }, () => sampleValue(itemSchema));
}

/** 找一个确定不在枚举里的值（尽量保持同类型） */
function valueNotInEnum(values: unknown[]): unknown {
  const first = values[0];
  if (typeof first === 'string') return '__invalid_enum_value__';
  if (typeof first === 'number') {
    let candidate = 0;
    while (values.includes(candidate)) candidate += 1;
    return candidate;
  }
  if (typeof first === 'boolean') return !first;
  return null;
}

/** 读取 object schema 的必填属性名列表 */
export function requiredPropertyNames(schema: JsonSchema | undefined): string[] {
  if (!schema) return [];
  const req = schema.required;
  if (!Array.isArray(req)) return [];
  return req.filter((name): name is string => typeof name === 'string');
}

/** 读取 object schema 的顶层属性（属性名 → schema），用于逐字段生成边界用例 */
export function objectProperties(schema: JsonSchema | undefined): Record<string, JsonSchema> {
  if (!schema) return {};
  const props = schema.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  const out: Record<string, JsonSchema> = {};
  for (const [name, raw] of Object.entries(props as Record<string, unknown>)) {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      out[name] = raw as JsonSchema;
    }
  }
  return out;
}

/* ------------------------ P1.5 嵌套对象深度 edge-case ------------------------ */

/** 数组层路径段标记（展示为 items[]，应用时对数组每个元素生效） */
export const ARRAY_SEGMENT = '[]';

/** 嵌套字段描述（JSONPath 风格路径） */
export interface NestedField {
  /** 路径段列表，如 ['data', 'user', 'email']；数组层用 '[]' 标记，如 ['data', 'items', '[]', 'name'] */
  segments: string[];
  /** 该字段的 schema */
  schema: JsonSchema;
  /** 是否必填（所在父级 required 含该字段名） */
  required: boolean;
  /** 层级深度（顶层字段 = 1） */
  depth: number;
}

/**
 * 递归枚举 schema 的全部嵌套字段（properties / items 里的字段一视同仁）。
 * 深度限制 maxDepth（默认 3）：超过后不再下钻，防爆炸。
 * 顶层字段 depth=1，data.user.email 的 depth=3。
 */
export function nestedFields(schema: JsonSchema | undefined, maxDepth = 3): NestedField[] {
  const out: NestedField[] = [];
  collect(schema, [], 1, maxDepth, out);
  return out;
}

function collect(schema: JsonSchema | undefined, base: string[], depth: number, maxDepth: number, out: NestedField[]): void {
  if (!schema || depth > maxDepth) return;
  const required = requiredPropertyNames(schema);
  for (const [name, propSchema] of Object.entries(objectProperties(schema))) {
    out.push({ segments: [...base, name], schema: propSchema, required: required.includes(name), depth });
    // 嵌套 object：继续下钻
    if (schemaType(propSchema) === 'object') {
      collect(propSchema, [...base, name], depth + 1, maxDepth, out);
    }
    // 数组里的 object 元素字段：经 '[]' 层下钻
    if (schemaType(propSchema) === 'array') {
      const item = itemSchemaOf(propSchema);
      if (item && schemaType(item) === 'object') {
        collect(item, [...base, name, ARRAY_SEGMENT], depth + 1, maxDepth, out);
      }
    }
  }
}

/** 读取 array schema 的 items 子 schema */
function itemSchemaOf(schema: JsonSchema): JsonSchema | undefined {
  const item = schema.items;
  return typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as JsonSchema) : undefined;
}

/** 嵌套路径展示形式：data.user.email / data.items[].name */
export function displayPath(segments: string[]): string {
  return segments.join('.');
}

/** 沿路径段读取嵌套值（'[]' 段取数组首元素；不存在返回 undefined） */
export function getNestedValue(target: unknown, segments: string[]): unknown {
  let cur: unknown = target;
  for (const seg of segments) {
    if (seg === ARRAY_SEGMENT) {
      if (!Array.isArray(cur) || cur.length === 0) return undefined;
      cur = cur[0];
      continue;
    }
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** 沿路径段设置嵌套值（'[]' 段对数组每个元素生效；中间层缺失则按需创建） */
export function setNestedValue(target: Record<string, unknown>, segments: string[], value: unknown): void {
  const seg = segments[0];
  if (seg === undefined) return;
  if (seg === ARRAY_SEGMENT) {
    if (Array.isArray(target)) {
      for (const item of target) {
        if (typeof item === 'object' && item !== null) setNestedValue(item as Record<string, unknown>, segments.slice(1), value);
      }
    }
    return;
  }
  if (segments.length === 1) {
    target[seg] = value;
    return;
  }
  const next = segments[1];
  if (target[seg] === undefined || target[seg] === null) {
    // 按下一路径段形态创建中间容器（'[]' 段需要数组，其余需要对象）
    target[seg] = next === ARRAY_SEGMENT ? [{}] : {};
  }
  const child = target[seg];
  if (next === ARRAY_SEGMENT && Array.isArray(child)) {
    if (child.length === 0) child.push({});
    for (const item of child) {
      if (typeof item === 'object' && item !== null) setNestedValue(item as Record<string, unknown>, segments.slice(1), value);
    }
    return;
  }
  if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
    setNestedValue(child as Record<string, unknown>, segments.slice(1), value);
  }
}

/** 沿路径段删除嵌套字段（'[]' 段对数组每个元素生效；中间层缺失则无操作） */
export function omitNestedValue(target: unknown, segments: string[]): void {
  if (segments.length === 0) return;
  if (segments.length === 1) {
    const seg = segments[0]!;
    if (typeof target === 'object' && target !== null) {
      delete (target as Record<string, unknown>)[seg];
    }
    return;
  }
  const [seg, ...rest] = segments as [string, ...string[]];
  let child: unknown;
  if (seg === ARRAY_SEGMENT) {
    if (!Array.isArray(target)) return;
    for (const item of target) omitNestedValue(item, rest);
    return;
  }
  if (typeof target !== 'object' || target === null) return;
  child = (target as Record<string, unknown>)[seg];
  if (seg === ARRAY_SEGMENT) return;
  if (rest[0] === ARRAY_SEGMENT && Array.isArray(child)) {
    for (const item of child) omitNestedValue(item, rest.slice(1));
    return;
  }
  omitNestedValue(child, rest);
}
