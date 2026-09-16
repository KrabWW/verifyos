/**
 * 内存 mock 执行器（A8 验收用）。
 *
 * 按「METHOD + pathname」路由到处理器，不碰真实网络：
 * - 处理器可返回同步或异步的 HttpResponse；
 * - 处理器间可通过闭包共享状态（如登录接口签发的 token，供后续接口校验），
 *   从而在纯数据流层面验证「前置提取变量传递」是否真跑通；
 * - 未命中路由返回 404。
 */
import type { HttpMethod } from '../types/models.js';
import type { HttpRequest, HttpResponse, Transport } from './transport.js';

/** 单个 mock 处理器 */
export type MockHandler = (req: HttpRequest) => HttpResponse | Promise<HttpResponse>;

/** 从 URL 提取 pathname（去 query），用于路由 */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** 路由键：`METHOD /path` */
function routeKey(method: HttpMethod, path: string): string {
  return `${method} ${path}`;
}

/** 内存 mock 传输实现 */
export class MockTransport implements Transport {
  private readonly routes = new Map<string, MockHandler>();

  /** 注册一条路由（同 key 覆盖旧值） */
  on(method: HttpMethod, path: string, handler: MockHandler): void {
    this.routes.set(routeKey(method, path), handler);
  }

  async send(req: HttpRequest): Promise<HttpResponse> {
    const handler = this.routes.get(routeKey(req.method, pathnameOf(req.url)));
    if (!handler) {
      return { status_code: 404, headers: { 'content-type': 'text/plain' }, body: 'not found' };
    }
    return handler(req);
  }
}
