import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { ToolDef, ToolPermission, ToolRegistry, ToolResult } from './registry.js';

/**
 * MCP 连接器（F15）：作为 MCP client 接外部 MCP server（stdio / SSE）。
 *
 * 安全模型 = 进程隔离：外部 server 以子进程 / 远程进程形式运行，与平台进程隔离，
 * 不同于进程内代码插件（PluginRuntime）。spawn → initialize 握手 → tools/list →
 * 工具转进 ToolRegistry（权限三档复用）→ tools/call 转发 → 断线自动重连。
 *
 * 传输层手写极简 JSON-RPC 2.0（NDJSON 分帧，对齐 MCP stdio 规范），不依赖
 * @modelcontextprotocol/sdk（其为 exports-only ESM，会破坏 server 端 moduleResolution=node 的类型解析）。
 */

// ---------- 配置 / 类型 ----------

/** stdio 传输：spawn 子进程，凭据走 env（沿用全局凭据体系） */
export interface McpStdioConfig {
  transport: 'stdio';
  /** 可执行命令（如 npx、node、uvx 或绝对路径二进制） */
  command: string;
  args?: string[];
  /** 注入子进程的额外环境变量（凭据等）；默认继承 process.env */
  env?: Record<string, string>;
  cwd?: string;
}

/** SSE 传输：GET 建立 SSE 流，POST 发送 JSON-RPC（旧版 MCP SSE 语义） */
export interface McpSseConfig {
  transport: 'sse';
  url: string;
  headers?: Record<string, string>;
}

/** MCP server 连接配置 = 插件 manifest 的 mcp 声明体 */
export type McpServerConfig = McpStdioConfig | McpSseConfig;

/** tools/list 返回的单个工具（已归一化） */
export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpAdapterOptions {
  /** 连接器名（审计 / 日志用） */
  name: string;
  version?: string;
  config: McpServerConfig;
  /** 工具统一默认权限档；不传默认 ask（不可信第三方从紧） */
  permission?: ToolPermission;
  /** 工具名前缀（如 "zentao."，避免多 server 工具名冲突），默认空 */
  toolPrefix?: string;
  /** 重连参数 */
  reconnect?: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number };
  logger?: (msg: string) => void;
}

// ---------- 内部：JSON-RPC 消息 ----------

type JsonRpcId = number | string;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- 内部：传输层 ----------

interface McpTransport {
  start(): Promise<void>;
  send(msg: JsonRpcRequest): Promise<void>;
  close(): Promise<void>;
  setOnMessage(cb: (msg: JsonRpcResponse) => void): void;
  setOnClose(cb: (err?: Error) => void): void;
}

/** stdio 传输：spawn 子进程，stdin/stdout 走换行分隔 JSON（NDJSON） */
class StdioMcpTransport implements McpTransport {
  private proc: ChildProcess | null = null;
  private rl: Interface | null = null;
  private onMessage?: (msg: JsonRpcResponse) => void;
  private onClose?: (err?: Error) => void;
  private closed = false;

  constructor(private readonly cfg: McpStdioConfig) {}

  setOnMessage(cb: (msg: JsonRpcResponse) => void): void {
    this.onMessage = cb;
  }
  setOnClose(cb: (err?: Error) => void): void {
    this.onClose = cb;
  }

  async start(): Promise<void> {
    const env = { ...process.env, ...(this.cfg.env ?? {}) };
    const proc = spawn(this.cfg.command, this.cfg.args ?? [], {
      env,
      cwd: this.cfg.cwd,
      stdio: ['pipe', 'pipe', 'inherit'], // stderr 透传便于诊断
    });
    this.proc = proc;
    this.closed = false;

    proc.on('error', (err) => this.emitClose(err));
    proc.on('exit', (code, signal) => {
      if (!this.closed) {
        this.emitClose(new Error(`MCP 子进程退出（code=${code} signal=${signal}）`));
      }
    });

    this.rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
    this.rl.on('line', (line) => {
      const text = line.trim();
      if (!text) return;
      try {
        const msg = JSON.parse(text) as JsonRpcResponse;
        this.onMessage?.(msg);
      } catch {
        // 非 JSON 行（如 server 调试输出误入 stdout）忽略
      }
    });
    this.rl.on('close', () => {
      if (!this.closed) this.emitClose(new Error('MCP stdout 已关闭'));
    });
  }

  async send(msg: JsonRpcRequest): Promise<void> {
    if (!this.proc || !this.proc.stdin || !this.proc.stdin.writable) {
      throw new Error('MCP stdio 连接未就绪');
    }
    const line = JSON.stringify(msg) + '\n';
    return new Promise((resolve, reject) => {
      this.proc!.stdin!.write(line, (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.rl?.close();
    const proc = this.proc;
    this.proc = null;
    if (proc && proc.exitCode === null) {
      proc.kill('SIGTERM');
      // 兜底：1s 后仍未退出则强杀
      setTimeout(() => {
        if (proc.exitCode === null) proc.kill('SIGKILL');
      }, 1000).unref();
    }
  }

  private emitClose(err?: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.(err);
  }
}

/** SSE 传输：GET 建立 SSE 流收消息，POST 发 JSON-RPC（旧版 MCP SSE：首事件 endpoint 给出 POST URL） */
class SseMcpTransport implements McpTransport {
  private onMessage?: (msg: JsonRpcResponse) => void;
  private onClose?: (err?: Error) => void;
  private postUrl: string | null = null;
  private abort = new AbortController();
  private buffer = '';
  private closed = false;

  constructor(private readonly cfg: McpSseConfig) {}

  setOnMessage(cb: (msg: JsonRpcResponse) => void): void {
    this.onMessage = cb;
  }
  setOnClose(cb: (err?: Error) => void): void {
    this.onClose = cb;
  }

  async start(): Promise<void> {
    const res = await fetch(this.cfg.url, {
      headers: { accept: 'text/event-stream', ...(this.cfg.headers ?? {}) },
      signal: this.abort.signal,
    });
    if (!res.ok || !res.body) throw new Error(`MCP SSE 连接失败（HTTP ${res.status}）`);
    this.closed = false;
    void this.pump(res.body.getReader());
    // 等待首个 endpoint 事件（决定 POST URL），最多 5s
    for (let i = 0; i < 50 && !this.postUrl && !this.closed; i++) await sleep(100);
    if (!this.postUrl) throw new Error('MCP SSE 未收到 endpoint 事件');
  }

  private async pump(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        this.parseBuffer();
      }
    } catch (err) {
      if (!this.closed) this.emitClose(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!this.closed) this.emitClose(new Error('MCP SSE 流结束'));
    }
  }

  /** 按空行切分事件块，解析 event/data 行 */
  private parseBuffer(): void {
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      this.handleBlock(block);
    }
  }

  private handleBlock(block: string): void {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    const data = dataLines.join('\n');
    if (event === 'endpoint') {
      this.postUrl = data ? new URL(data, this.cfg.url).toString() : this.cfg.url;
      return;
    }
    if (event === 'message' && data) {
      try {
        this.onMessage?.(JSON.parse(data) as JsonRpcResponse);
      } catch {
        // 忽略非 JSON message
      }
    }
  }

  async send(msg: JsonRpcRequest): Promise<void> {
    if (!this.postUrl) throw new Error('MCP SSE 尚未就绪（无 POST URL）');
    const res = await fetch(this.postUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.cfg.headers ?? {}) },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error(`MCP SSE POST 失败（HTTP ${res.status}）`);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
  }

  private emitClose(err?: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.(err);
  }
}

// ---------- 内部：JSON-RPC client ----------

class McpClient {
  private transport: McpTransport | null = null;
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingCall>();
  connected = false;

  constructor(
    private readonly name: string,
    private readonly version: string,
  ) {}

  async connect(transport: McpTransport): Promise<void> {
    this.transport = transport;
    transport.setOnMessage((msg) => this.handle(msg));
    transport.setOnClose((err) => this.handleClose(err));
    await transport.start();
    this.connected = true;
    // initialize 握手
    const init = (await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: this.name, version: this.version },
    }, 10_000)) as { serverInfo?: unknown };
    void init;
    await this.notify('notifications/initialized');
  }

  private handle(msg: JsonRpcResponse): void {
    const id = msg.id;
    if (id === null || id === undefined) return; // 服务端通知，本实现不处理
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(`MCP 错误 ${msg.error.code}：${msg.error.message}`));
    else p.resolve(msg.result);
  }

  private handleClose(err?: Error): void {
    this.connected = false;
    const e = err ?? new Error('MCP 连接关闭');
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }

  private request(method: string, params: unknown, timeoutMs = 60_000): Promise<unknown> {
    const transport = this.transport;
    if (!transport || !this.connected) return Promise.reject(new Error('MCP 未连接'));
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      transport.send(req).catch((err) => {
        const p = this.pending.get(id);
        if (p) {
          this.pending.delete(id);
          clearTimeout(p.timer);
          p.reject(err);
        }
      });
    });
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const transport = this.transport;
    if (!transport) throw new Error('MCP 未连接');
    await transport.send({ jsonrpc: '2.0', method, params });
  }

  async listTools(): Promise<McpToolInfo[]> {
    const res = (await this.request('tools/list', {}, 15_000)) as { tools?: Array<Record<string, unknown>> };
    return (res.tools ?? []).map((t) => ({
      name: String(t.name ?? ''),
      description: String(t.description ?? ''),
      inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, 120_000);
  }

  async close(): Promise<void> {
    this.connected = false;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('MCP 客户端关闭'));
    }
    this.pending.clear();
    await this.transport?.close();
    this.transport = null;
  }
}

// ---------- 对外：McpToolAdapter ----------

/**
 * MCP 连接器：管理单个外部 MCP server 的连接生命周期，并把其工具转成 ToolRegistry 条目。
 *
 * 用法：
 *   const adapter = new McpToolAdapter({ name: 'echo', config: { transport: 'stdio', command: 'node', args: ['server.mjs'] } });
 *   await adapter.start();
 *   await adapter.register(registry);       // 把 tools/list 的工具注册进 ToolRegistry
 *   await registry.invoke('echo', { text: 'hi' });  // 经 ToolRegistry 权限门控 + 审计后转发
 *   await adapter.dispose();
 */
export class McpToolAdapter {
  private client: McpClient | null = null;
  private tools: McpToolInfo[] = [];
  private registeredNames: string[] = [];
  private connecting: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly opts: McpAdapterOptions) {}

  private log(msg: string): void {
    this.opts.logger?.(`[mcp:${this.opts.name}] ${msg}`);
  }

  private createTransport(): McpTransport {
    if (this.opts.config.transport === 'sse') return new SseMcpTransport(this.opts.config);
    return new StdioMcpTransport(this.opts.config);
  }

  /** 建立连接 + 握手 + tools/list */
  private async connect(): Promise<void> {
    const client = new McpClient(this.opts.name, this.opts.version ?? '1.0.0');
    const transport = this.createTransport();
    await client.connect(transport);
    const tools = await client.listTools();
    this.client = client;
    this.tools = tools;
    this.log(`已连接，tools/list 返回 ${tools.length} 个工具`);
  }

  private async ensureConnected(): Promise<void> {
    if (this.client && this.client.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      await this.connect();
    })().finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }

  /** 断线重连：关闭旧连接 → 退避重试（重启子进程 + 重新握手 + 重新 list） */
  private async reconnect(): Promise<void> {
    if (this.disposed) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      await this.client?.close().catch(() => undefined);
      this.client = null;
      const maxRetries = this.opts.reconnect?.maxRetries ?? 5;
      const base = this.opts.reconnect?.baseDelayMs ?? 200;
      const maxDelay = this.opts.reconnect?.maxDelayMs ?? 5000;
      let lastErr: Error | null = null;
      for (let i = 0; i <= maxRetries; i++) {
        try {
          await this.connect();
          return;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          const delay = Math.min(base * Math.pow(2, i), maxDelay);
          this.log(`重连失败（第 ${i + 1} 次）：${lastErr.message}，${delay}ms 后重试`);
          await sleep(delay);
        }
      }
      throw lastErr ?? new Error('MCP 重连失败');
    })().finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }

  /** 建立连接并返回 tools/list 结果 */
  async start(): Promise<McpToolInfo[]> {
    await this.ensureConnected();
    return [...this.tools];
  }

  listTools(): McpToolInfo[] {
    return [...this.tools];
  }

  private toolName(raw: string): string {
    return `${this.opts.toolPrefix ?? ''}${raw}`;
  }

  /** 把 tools/list 的工具转成 ToolDef 并注册进 ToolRegistry（权限三档 + 审计复用） */
  async register(registry: ToolRegistry): Promise<string[]> {
    if (!this.client) await this.ensureConnected();
    const permission = this.opts.permission ?? 'ask';
    const names: string[] = [];
    for (const t of this.tools) {
      const rawName = t.name;
      const defName = this.toolName(rawName);
      const def: ToolDef = {
        name: defName,
        description: t.description || `MCP 工具 ${rawName}（来自 ${this.opts.name}）`,
        permission,
        // run 闭包捕获 rawName，转发给 MCP server 用原始工具名
        run: async (args) => this.callTool(rawName, args),
      };
      registry.register(def);
      names.push(defName);
    }
    this.registeredNames = names;
    return names;
  }

  /** 转发 tools/call 并归一化为 ToolResult；失败自动重连重试一次 */
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this.disposed) return { ok: false, error: 'MCP 连接器已释放' };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.ensureConnected();
        const raw = await this.client!.callTool(name, args);
        return this.toToolResult(name, raw);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 0) {
          this.log(`调用 ${name} 失败（${msg}），尝试重连后重试`);
          try {
            await this.reconnect();
          } catch {
            // 重连失败，进入下一轮再报错
          }
        } else {
          return { ok: false, error: `MCP 调用 ${name} 失败：${msg}`, audit: { mcpTool: name } };
        }
      }
    }
    return { ok: false, error: `MCP 调用 ${name} 失败`, audit: { mcpTool: name } };
  }

  /** MCP content 归一化：text 拼接 + structuredContent 透传 + isError → ok=false */
  private toToolResult(name: string, raw: unknown): ToolResult {
    const r = (raw ?? {}) as { content?: unknown[]; isError?: boolean; structuredContent?: unknown };
    const parts: string[] = [];
    const extra: unknown[] = [];
    for (const c of r.content ?? []) {
      const item = c as { type?: string; text?: string };
      if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text);
      else extra.push(item);
    }
    const text = parts.join('\n');
    const data: Record<string, unknown> = { text };
    if (r.structuredContent !== undefined) data.structuredContent = r.structuredContent;
    if (extra.length) data.extraContent = extra;
    return {
      ok: r.isError !== true,
      data,
      error: r.isError === true ? text || 'MCP 工具返回 isError' : undefined,
      audit: { mcpTool: name, contentParts: (r.content ?? []).length },
    };
  }

  /** 已注册进 registry 的工具名 */
  get registered(): string[] {
    return [...this.registeredNames];
  }

  /** 释放：关闭子进程 / SSE 流 */
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.client?.close().catch(() => undefined);
    this.client = null;
    this.tools = [];
  }
}

/** 便捷工厂：创建并 start + register，返回 adapter（调用方持引用以便 dispose） */
export async function mountMcpAdapter(
  registry: ToolRegistry,
  opts: McpAdapterOptions,
): Promise<McpToolAdapter> {
  const adapter = new McpToolAdapter(opts);
  await adapter.start();
  await adapter.register(registry);
  return adapter;
}
