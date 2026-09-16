/**
 * 最小 JSONPath 取值器（A8 场景变量提取用）。
 *
 * 支持语法（覆盖场景编排的字段提取需求）：
 * - 根：$（可省略）
 * - 对象键：$.data.token、$.a.b
 * - 方括号键：$['data']、$["data"]
 * - 数组下标：$.data.items[0].id
 *
 * 诚实范围：本阶段只做「单条取值」，不支持通配符 / 过滤器 / 递归下降（$..），
 * 这是场景变量提取（登录拿 token）所需的最小集；完整 JSONPath 留待 A7 引入
 * jsonpath-plus 后由断言层统一提供。
 */

/** 按 JSONPath 取值；路径非法或节点不存在返回 undefined */
export function jsonpathGet(value: unknown, path: string): unknown {
  let node = value;
  let rest = path.trim();
  if (rest.startsWith('$')) rest = rest.slice(1);

  while (rest.length > 0) {
    let key: string;

    if (rest.startsWith('.')) {
      const m = /^\.([a-zA-Z_][a-zA-Z0-9_]*)/.exec(rest);
      if (!m) return undefined;
      key = m[1] as string;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('[')) {
      const end = rest.indexOf(']');
      if (end < 0) return undefined;
      const inner = rest.slice(1, end).trim();
      rest = rest.slice(end + 1);
      if (
        (inner.startsWith("'") && inner.endsWith("'")) ||
        (inner.startsWith('"') && inner.endsWith('"'))
      ) {
        key = inner.slice(1, -1);
      } else {
        key = inner;
      }
    } else {
      return undefined;
    }

    if (node === null || node === undefined) return undefined;

    if (Array.isArray(node)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0) return undefined;
      node = node[idx];
    } else if (typeof node === 'object') {
      node = (node as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return node;
}

/** 把 JSONPath 取到的值转成变量字符串（数字/布尔转字符串，对象/数组 JSON 序列化） */
export function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
