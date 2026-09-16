/**
 * JSONPath 解析 / 求值（A7 失败诊断用）。
 *
 * 本项目断言用 JSONPath 定位字段（格式由 generator/schema.ts 的 buildJsonPath 产出）：
 * - `$`：根；
 * - `.name`：点记法（标识符键）；
 * - `[0]`：数组下标；
 * - `['a-b']`：括号记法（非常规键，含 `\'` 转义）。
 *
 * 这里只解析/求值 buildJsonPath 产出的子集，不追求完整 JSONPath 规范（数组通配/过滤
 * 等不在范围），保持与生成端一致即可。
 */
import type { PathSegment } from '../generator/schema.js';

/** 解析 JSONPath 字符串为路径段；非法或非本项目格式返回 null */
export function parseJsonPath(path: string): PathSegment[] | null {
  if (!path.startsWith('$')) return null;

  const segments: PathSegment[] = [];
  let i = 1;
  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      const m = /^\.([a-zA-Z_][a-zA-Z0-9_]*)/.exec(path.slice(i));
      if (!m) return null;
      segments.push(m[1]!);
      i += m[0].length;
    } else if (ch === '[') {
      const close = path.indexOf(']', i);
      if (close === -1) return null;
      const inner = path.slice(i + 1, close);
      if (/^\d+$/.test(inner)) {
        segments.push(Number(inner));
      } else if (inner.length >= 2 && inner.startsWith("'") && inner.endsWith("'")) {
        segments.push(inner.slice(1, -1).replace(/\\'/g, "'"));
      } else {
        return null;
      }
      i = close + 1;
    } else {
      return null;
    }
  }
  return segments;
}

/** 求值结果：字段是否存在 + 值 */
export interface EvalResult {
  found: boolean;
  value: unknown;
}

/** 按路径段从根取值；中间不匹配时返回 found=false */
export function evaluateJsonPath(root: unknown, segments: PathSegment[]): EvalResult {
  let cur: unknown = root;
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      if (typeof seg !== 'number' || seg < 0 || seg >= cur.length) {
        return { found: false, value: undefined };
      }
      cur = cur[seg];
    } else if (cur !== null && typeof cur === 'object') {
      if (typeof seg !== 'string' || !(seg in (cur as Record<string, unknown>))) {
        return { found: false, value: undefined };
      }
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}
