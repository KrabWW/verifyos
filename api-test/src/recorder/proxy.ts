/**
 * HTTP 代理录制器（A2 代理模式核心）。
 *
 * 能力：
 * - HTTP 明文：直转请求/响应，并全量记录 method/url/headers/body/status/耗时；
 * - HTTPS：通过 CONNECT 建立隧道，报文端到端加密（TLS），代理只能看到
 *   「目标 host:port + 隧道建立耗时」等元数据，无法拿到内层 method/url/status/body。
 *   这是无 MITM 证书下代理模式的诚实限制（详见 README「HTTPS 限制」）。
 *
 * 说明：HTTPS 若需内层明文，必须走 MITM（生成自签 CA 并让客户端信任证书），
 *       属于后续增强项，A2 不引入证书管理复杂度。
 */
import { randomUUID } from 'node:crypto';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';
import type { HttpMethod, TrafficRecord } from '../types/models.js';
import { classifyRequest } from './classify.js';
import type { RecordingSession } from './session.js';

export interface ProxyOptions {
  /** 监听地址，默认 127.0.0.1 */
  host?: string;
  /** 监听端口，默认 8008 */
  port?: number;
}

/** 转发时需要剔除的 hop-by-hop 头（逐跳头不能跨代理转发） */
const HOP_BY_HOP = new Set([
  'connection',
  'proxy-connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** 将 IncomingHttpHeaders 归一化为 Record<string,string>（数组值用逗号连接） */
function normalizeHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/** 转发用头：在原始头上剔除 hop-by-hop 头，避免跨代理污染 */
function forwardHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/** URLSearchParams 转 Record<string,string[]>（同键多值聚合） */
function toQueryParams(searchParams: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    (out[key] ??= []).push(value);
  }
  return out;
}

/** Buffer 片段合并为 utf-8 文本；空 body 返回 undefined */
function bodyToString(chunks: Buffer[]): string | undefined {
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString('utf-8');
}

export class RecorderProxy {
  private server: Server | null = null;
  private readonly host: string;
  private readonly port: number;

  constructor(
    private readonly session: RecordingSession,
    options: ProxyOptions = {},
  ) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 8008;
  }

  get address(): { host: string; port: number } {
    return { host: this.host, port: this.port };
  }

  /** 启动代理监听 */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('代理已启动');
    }
    this.server = createServer((req, res) => this.handleHttp(req, res));
    // CONNECT 请求走 'connect' 事件（非 'request'）
    this.server.on('connect', (req, socket, head) => this.handleConnect(req, socket, head));

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, this.host, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
  }

  /** 停止代理监听 */
  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = null;
  }

  /** HTTP 明文：直转 + 全量记录 */
  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const startedAt = Date.now();

    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Bad proxy request URL');
      return;
    }

    const method = (req.method ?? 'GET').toUpperCase() as HttpMethod;
    const host = `${target.protocol}//${target.host}`;
    const path = target.pathname;
    const queryParams = toQueryParams(target.searchParams);

    const requestHeaders = normalizeHeaders(req.headers);
    const requestBodyChunks: Buffer[] = [];
    // 收集请求体（pipe 会同时把同一份数据转发给上游）
    req.on('data', (chunk: Buffer) => requestBodyChunks.push(chunk));

    const upstream = httpRequest(
      {
        hostname: target.hostname,
        port: target.port ? Number(target.port) : 80,
        path: target.pathname + target.search,
        method: req.method,
        headers: forwardHeaders(req.headers),
      },
      (upRes) => {
        const responseHeaders = normalizeHeaders(upRes.headers);
        const responseBodyChunks: Buffer[] = [];
        upRes.on('data', (chunk: Buffer) => responseBodyChunks.push(chunk));
        upRes.on('end', () => {
          const now = Date.now();
          // P1.2 噪音检测前移：记录时即分级（可拿到响应 Content-Type，判定更准）
          const cls = classifyRequest({
            method,
            path,
            request_headers: requestHeaders,
            response_content_type: responseHeaders['content-type'],
          });
          const record: TrafficRecord = {
            id: randomUUID(),
            api_definition_id: null,
            timestamp: new Date(startedAt).toISOString(),
            method,
            path,
            host,
            query_params: queryParams,
            request_headers: requestHeaders,
            request_body: bodyToString(requestBodyChunks),
            status_code: upRes.statusCode ?? 0,
            response_headers: responseHeaders,
            response_body: bodyToString(responseBodyChunks),
            latency_ms: now - startedAt,
            source: 'proxy',
            request_class: cls.request_class,
            is_noise: cls.is_noise,
            noise_flag: false,
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          };
          this.session.record(record);
        });

        res.writeHead(upRes.statusCode ?? 502, forwardHeaders(upRes.headers));
        upRes.pipe(res);
      },
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end(`代理转发失败: ${err.message}`);
    });

    req.pipe(upstream);
  }

  /** HTTPS：CONNECT 隧道，仅记录目标 host:port + 建立耗时等元数据 */
  private handleConnect(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const startedAt = Date.now();

    // req.url 形如 "example.com:443"
    const [hostname, portStr] = (req.url ?? '').split(':');
    const port = portStr ? Number(portStr) : 443;

    if (!hostname) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.end();
      return;
    }

    const upstreamSocket = connect(port, hostname, () => {
      const now = Date.now();
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // head 是 CONNECT 之后可能已到达的首包（如 TLS ClientHello），需先转发
      if (head.length > 0) {
        upstreamSocket.write(head);
      }
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);

      // TLS 端到端加密，代理仅能记录元数据；body 无法明文，诚实不记录
      // P1.2 分级：CONNECT 元数据视为噪音（embedded）
      const cls = classifyRequest({ method: 'CONNECT', path: '', request_headers: normalizeHeaders(req.headers) });
      const record: TrafficRecord = {
        id: randomUUID(),
        api_definition_id: null,
        timestamp: new Date(startedAt).toISOString(),
        method: 'CONNECT',
        path: '',
        host: `${hostname}:${port}`,
        query_params: {},
        request_headers: normalizeHeaders(req.headers),
        status_code: 200,
        response_headers: {},
        latency_ms: now - startedAt,
        source: 'proxy',
        request_class: cls.request_class,
        is_noise: cls.is_noise,
        noise_flag: false,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
      this.session.record(record);
    });

    upstreamSocket.on('error', () => socket.destroy());
    socket.on('error', () => upstreamSocket.destroy());
  }
}
