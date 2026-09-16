/**
 * 执行传输层（A8）：场景运行器的「如何发请求」抽象。
 *
 * 通过 Transport 接口隔离「真实网络」与「内存 mock」：
 * - 本阶段验收用 MockTransport（内存 mock 执行器，纯数据流验证变量传递，不碰网络）；
 * - 后续可接 NodeHttpTransport 做真实 HTTP 执行，场景编排/变量/报告逻辑无需改动。
 */
import type { HttpMethod } from '../types/models.js';

/** 一次 HTTP 请求（变量已渲染完毕） */
export interface HttpRequest {
  method: HttpMethod;
  /** 完整 URL（base_url + 渲染后的 path） */
  url: string;
  /** 查询参数（值已渲染） */
  query_params: Record<string, string>;
  /** 请求头（值已渲染） */
  headers: Record<string, string>;
  /** 请求体（已渲染，可空） */
  body?: string;
}

/** 一次 HTTP 响应 */
export interface HttpResponse {
  status_code: number;
  headers: Record<string, string>;
  body: string;
}

/** 传输接口：执行一次 HTTP 调用 */
export interface Transport {
  send(req: HttpRequest): Promise<HttpResponse>;
}

/** 拼装完整 URL：base_url 去尾斜杠 + path（缺前导斜杠时补齐） */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
