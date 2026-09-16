/**
 * 录制时噪音检测前移（P1.2）：每条流量入 session 前即做请求分级。
 *
 * 分级目标（对标 Keploy / Akto 的 traffic filter）：
 * - top_level：导航主文档（HTML 页面请求，浏览器地址栏导航触发）；
 * - ajax：XHR/fetch 接口调用（业务 API，测试生成的核心对象）；
 * - embedded：静态资源 / 第三方资源（图片/样式/脚本/字体等，对测试生成无价值）。
 *
 * 判定依据（代理层可见的请求特征，诚实说明：代理拿不到浏览器内部的
 * Initiator/ResourceType，只能用 headers 形态启发式推断）：
 * - sec-fetch-dest / sec-fetch-mode（Chromium 系浏览器会带，最可靠）；
 * - accept 头形态（text/html → 文档；application/json → 接口）；
 * - X-Requested-With: XMLHttpRequest（传统 XHR 标记）；
 * - 路径/Content-Type 后缀（.js/.css/.png 等静态资源特征）。
 */
import type { HttpMethod, TrafficRecord } from '../types/models.js';

/** 请求分级结果 */
export interface RequestClassification {
  /** 请求级别 */
  request_class: 'top_level' | 'ajax' | 'embedded';
  /** 是否噪音（embedded 静态资源视为噪音，不参与测试生成） */
  is_noise: boolean;
  /** 命中原因（人读说明，便于排查误判） */
  reason: string;
}

/** 静态资源扩展名（embedded 判定依据之一） */
const STATIC_EXT_RE =
  /\.(js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|map|txt|xml|pdf|zip|gz|mp4|webm|mp3|wasm)(\?|$)/i;

/** 静态资源 Content-Type 前缀 */
const STATIC_MIME_RE = /^(image\/|font\/|text\/css|application\/javascript|text\/javascript|application\/x-javascript)/i;

/** 从 headers 取值（大小写不敏感；代理层已归一化为小写键，这里兜底） */
function header(headers: Record<string, string>, name: string): string | undefined {
  const key = name.toLowerCase();
  const direct = headers[key];
  if (direct !== undefined) return direct;
  const found = Object.entries(headers).find(([k]) => k.toLowerCase() === key);
  return found?.[1];
}

/**
 * 对单条流量的请求特征做分级。
 * 输入为 TrafficRecord 的构造材料（method/path/headers），proxy.ts 在组装
 * record 时调用，故不做整条 record 依赖，便于复用与测试。
 */
export function classifyRequest(input: {
  method: HttpMethod;
  path: string;
  request_headers: Record<string, string>;
  /** 响应 Content-Type（响应完成后可补判，可选） */
  response_content_type?: string;
}): RequestClassification {
  const { method, path, request_headers } = input;

  // 0. CONNECT 隧道元数据：无 path 无明文，视为噪音（不参与测试生成）
  if (method === 'CONNECT') {
    return { request_class: 'embedded', is_noise: true, reason: 'CONNECT 隧道元数据，无明文内容' };
  }

  // 1. sec-fetch-dest（Chromium 系浏览器导航/资源标记，最优先）
  const secFetchDest = header(request_headers, 'sec-fetch-dest');
  if (secFetchDest === 'document') {
    return { request_class: 'top_level', is_noise: false, reason: 'sec-fetch-dest=document 导航主文档' };
  }
  if (secFetchDest === 'script' || secFetchDest === 'style' || secFetchDest === 'image' || secFetchDest === 'font') {
    return { request_class: 'embedded', is_noise: true, reason: `sec-fetch-dest=${secFetchDest} 静态资源` };
  }
  if (secFetchDest === 'empty') {
    // sec-fetch-dest=empty 是 XHR/fetch 的标志（不受同源限制影响都会带）
    return { request_class: 'ajax', is_noise: false, reason: 'sec-fetch-dest=empty XHR/fetch 调用' };
  }

  // 2. X-Requested-With: XMLHttpRequest（传统 XHR 标记）
  const xrw = header(request_headers, 'x-requested-with');
  if (xrw && /xmlhttprequest/i.test(xrw)) {
    return { request_class: 'ajax', is_noise: false, reason: 'X-Requested-With=XMLHttpRequest' };
  }

  // 3. accept 形态：text/html → 文档；application/json → 接口
  const accept = header(request_headers, 'accept') ?? '';
  if (/text\/html/i.test(accept) && !/application\/json/i.test(accept)) {
    // html 但带 sec-fetch-mode=navigate 之外的情况已由 1 处理；curl 直接请求也常见 text/html
    return { request_class: 'top_level', is_noise: false, reason: 'accept 含 text/html 主文档' };
  }
  if (/application\/json/i.test(accept)) {
    return { request_class: 'ajax', is_noise: false, reason: 'accept 含 application/json 接口调用' };
  }

  // 4. 静态资源路径后缀 / 响应 Content-Type
  if (STATIC_EXT_RE.test(path)) {
    return { request_class: 'embedded', is_noise: true, reason: '路径命中静态资源扩展名' };
  }
  const contentType = input.response_content_type ?? header(request_headers, 'content-type') ?? '';
  if (STATIC_MIME_RE.test(contentType)) {
    return { request_class: 'embedded', is_noise: true, reason: `Content-Type=${contentType.split(';')[0]} 静态资源` };
  }

  // 5. 兜底：无任何特征时按接口对待（宁多录不漏录，误判由人审兜底）
  return { request_class: 'ajax', is_noise: false, reason: '无显著特征，按接口调用兜底' };
}

/**
 * 便捷封装：直接对一条已组装的 TrafficRecord 特征做分级（供导入器/测试复用）。
 * 只读 method/path/request_headers/response_headers，不修改原对象。
 */
export function classifyRecord(record: TrafficRecord): RequestClassification {
  return classifyRequest({
    method: record.method,
    path: record.path,
    request_headers: record.request_headers,
    response_content_type: record.response_headers['content-type'],
  });
}
