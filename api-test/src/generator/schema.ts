/**
 * JSON 解析 / schema 摘要 / JSONPath / 叶子遍历 工具（A3 断言生成用）。
 *
 * - parseJson：安全解析 body 文本，非 JSON 返回 undefined；
 * - summarizeSchema：从响应体产出一份「宽松 schema 摘要」（type + properties + 噪音注解）；
 * - walkLeaves：递归产出每个叶子（key + value + JSONPath 段），供字段级断言生成；
 * - buildJsonPath：路径段拼成 JSONPath（如 $.data.items[0].id）。
 */
import type { JsonSchema } from '../types/models.js';
import { classifyValue } from './noise.js';

/** 安全解析 JSON 文本；失败或空返回 undefined */
export function parseJson(body: string | undefined): unknown {
  if (body === undefined || body.trim() === '') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** JSONPath 路径段（对象键为 string，数组下标为 number） */
export type PathSegment = string | number;

/** 叶子节点：key + 原始值 + 完整 JSONPath 段 */
export interface Leaf {
  /** 该叶子自身的 key（数组元素时 key 为其下标） */
  key: string;
  /** 叶子值 */
  value: unknown;
  /** 从根到叶子的路径段（含自身） */
  path: PathSegment[];
}

/** 递归产出对象/数组的所有叶子节点 */
export function walkLeaves(value: unknown): Leaf[] {
  const out: Leaf[] = [];

  const visit = (node: unknown, segments: PathSegment[]): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...segments, index]));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        visit(child, [...segments, key]);
      }
      return;
    }
    // 标量叶子（含 null）：key 取最后一段
    const last = segments[segments.length - 1];
    out.push({ key: String(last ?? '$'), value: node, path: segments });
  };

  visit(value, []);
  return out;
}

/** 路径段 → JSONPath 字符串：$.data.items[0].id */
export function buildJsonPath(segments: PathSegment[]): string {
  let out = '$';
  for (const seg of segments) {
    if (typeof seg === 'number') {
      out += `[${seg}]`;
    } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(seg)) {
      out += `.${seg}`;
    } else {
      out += `['${seg.replace(/'/g, "\\'")}']`;
    }
  }
  return out;
}

/**
 * 响应体 → 宽松 schema 摘要。
 * - 对象 → { type: 'object', properties: {...} }；
 * - 数组 → { type: 'array', items: <首个元素 schema> }；
 * - 标量 → { type: 'string'|'number'|'boolean'|'null' }。
 * 噪音叶子在其 schema 节点上注解 x-mode='ignore' + x-noise-rule，供人审/断言引擎识别。
 */
export function summarizeSchema(value: unknown): JsonSchema {
  if (Array.isArray(value)) {
    const item = value.length > 0 ? value[0] : undefined;
    return {
      type: 'array',
      items: item === undefined ? {} : summarizeSchema(item),
    };
  }

  if (value === null) {
    return { type: 'null' };
  }

  if (typeof value === 'object') {
    const properties: Record<string, JsonSchema> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const rule = classifyValue(key, child);
      const childSchema = summarizeSchema(child);
      if (rule) {
        childSchema['x-mode'] = 'ignore';
        childSchema['x-noise-rule'] = rule;
      }
      properties[key] = childSchema;
    }
    return { type: 'object', properties };
  }

  switch (typeof value) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    default:
      return { type: typeof value };
  }
}
