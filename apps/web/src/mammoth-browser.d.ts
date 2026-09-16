// mammoth 浏览器版 bundle（mammoth.browser.js 为自包含 UMD）无子路径类型声明——手动补
declare module 'mammoth/mammoth.browser' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  const _default: { extractRawText: typeof extractRawText; convertToHtml: typeof convertToHtml };
  export default _default;
}
