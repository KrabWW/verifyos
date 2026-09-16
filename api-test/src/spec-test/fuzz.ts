/**
 * 属性测试式 fuzz：对参数空间做「随机 + 边界」采样。
 *
 * 目的（对标 Schemathesis）：用合法值 / 边界值 / 同类型随机值 / 错误类型的组合去探测，
 * 命中 500 或 schema 违规即报。为可复现，使用带种子的确定性 PRNG（mulberry32），
 * 同一 seed 生成同一批用例。
 */
import type { JsonSchema } from '../types/models.js';
import { sampleValue, schemaType } from './sample.js';

/** 伪随机数生成器：返回 [0,1) 的浮点数 */
export type Rng = () => number;

/** mulberry32：确定性 PRNG，同 seed 同序列 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 采样一个参数值，概率分配：
 * - ~45% 合法样例值；
 * - ~25% 边界值（min/max/exclusive、长度、条目数）；
 * - ~20% 同类型随机值；
 * - ~10% 错误类型值。
 *
 * P1.5：object 类型按 schema 递归采样（受 maxDepth 限制，默认 3，防爆炸）；
 * array 的元素同样递归采样。
 */
export function fuzzValue(schema: JsonSchema | undefined, rng: Rng, maxDepth = 3): unknown {
  const type = schemaType(schema);
  if (type === 'object') return fuzzObject(schema, rng, maxDepth);
  const roll = rng();
  if (roll < 0.45) return sampleValue(schema);
  if (roll < 0.7) return boundaryValue(schema, type, rng, maxDepth);
  if (roll < 0.9) return randomForType(type, rng);
  return wrongTypeValue(type, rng);
}

/** object 递归采样：每个属性按概率决定合法/非法取值，嵌套 object 受深度限制 */
function fuzzObject(schema: JsonSchema | undefined, rng: Rng, maxDepth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!schema) return out;
  const props = schema.properties;
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return out;
  for (const [name, raw] of Object.entries(props as Record<string, unknown>)) {
    const propSchema = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as JsonSchema) : undefined;
    out[name] = maxDepth > 1 ? fuzzValue(propSchema, rng, maxDepth - 1) : sampleValue(propSchema);
  }
  return out;
}

/** 边界值：优先取 min/max 及其相邻，其次长度/条目边界（array 元素递归采样） */
function boundaryValue(schema: JsonSchema | undefined, type: string | undefined, rng: Rng, maxDepth: number): unknown {
  if (!schema) return null;
  if (type === 'integer' || type === 'number') {
    const candidates: number[] = [];
    if (typeof schema.minimum === 'number') {
      candidates.push(schema.minimum, schema.minimum + 1);
    }
    if (typeof schema.maximum === 'number') {
      candidates.push(schema.maximum, schema.maximum - 1);
    }
    if (candidates.length === 0) candidates.push(0, 1, -1);
    const idx = Math.floor(rng() * candidates.length) % candidates.length;
    return candidates[idx];
  }
  if (type === 'string') {
    const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
    const max = typeof schema.maxLength === 'number' ? schema.maxLength : min + 1;
    return 'a'.repeat(Math.max(0, max));
  }
  if (type === 'array') {
    const min = typeof schema.minItems === 'number' ? schema.minItems : 0;
    const max = typeof schema.maxItems === 'number' ? schema.maxItems : min + 1;
    const itemSchema = typeof schema.items === 'object' && schema.items !== null ? (schema.items as JsonSchema) : undefined;
    const count = rng() < 0.5 ? Math.max(0, min) : max;
    // 元素也走 fuzz 采样（受深度限制），保证嵌套数组内的字段同样被探测
    return Array.from({ length: count }, () =>
      maxDepth > 1 ? fuzzValue(itemSchema, rng, maxDepth - 1) : sampleValue(itemSchema),
    );
  }
  return sampleValue(schema);
}

/** 同类型随机值 */
function randomForType(type: string | undefined, rng: Rng): unknown {
  switch (type) {
    case 'string':
      return randomString(rng);
    case 'integer':
      return Math.floor(rng() * 200) - 100;
    case 'number':
      return rng() * 200 - 100;
    case 'boolean':
      return rng() < 0.5;
    case 'array':
      return [randomString(rng)];
    case 'object':
      return {};
    default:
      return null;
  }
}

/** 错误类型值：故意给一个与 schema type 不匹配的值 */
function wrongTypeValue(type: string | undefined, rng: Rng): unknown {
  switch (type) {
    case 'string':
      return Math.floor(rng() * 100);
    case 'integer':
    case 'number':
      return 'not-a-number';
    case 'boolean':
      return 'true';
    case 'array':
      return 'not-an-array';
    case 'object':
      return 'not-an-object';
    default:
      return null;
  }
}

function randomString(rng: Rng): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const len = 1 + Math.floor(rng() * 12);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(rng() * chars.length));
  }
  return out;
}
