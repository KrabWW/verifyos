/**
 * 变量模板渲染（A8）：把字符串里的 {{name}} 占位替换为变量值。
 *
 * - 支持在 path / headers / body / query 中使用 {{name}}；
 * - 未定义变量保留原占位（不抛错），这样「变量传递失败」会体现在最终请求里，
 *   便于在报告中暴露，而不是静默吞掉。
 */

/** 渲染模板字符串；未定义变量保留原文 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : value;
  });
}

/** 渲染一个 key → value 字典里的所有值（不改变 key） */
export function renderRecord(
  record: Record<string, string>,
  vars: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = renderTemplate(value, vars);
  }
  return out;
}
