/**
 * SSE（Server-Sent Events）服务端核心（P2.8）：AI 生成用例/断言/诊断的流式输出通道。
 *
 * 零依赖实现（仅 node:http 的 ServerResponse）：
 * - createSseResponse(res)：写 SSE 响应头并返回 SseWriter；
 * - SseWriter：send(event, data) 按 SSE 帧格式写出（id 自增 + event + data JSON），
 *   close() 结束响应，heartbeat() 发注释行保活；
 * - streamFromIterator(writer, iterable)：通用 helper——把异步生成器逐项推成 delta 流，
 *   并按统一事件协议编排 start/delta/progress/done/error。
 *
 * 事件协议（事件名统一，data 均为 JSON）：
 * - start：任务开始，data = { kind: 'gen-case' | 'gen-assertion' | 'diagnose', ...上下文 }；
 * - delta：增量内容，data = { text, meta? }（LLM/规则式的 token 流逐段推送）；
 * - progress：进度百分比（可选），data = { percent: 0-100 }；
 * - done：完成，data = { kind, result }（result 为生成器 return 的完整结果对象）；
 * - error：失败，data = { message }，发完必须 close()。
 *
 * 帧格式（SSE 标准，见 MDN / WHATWG HTML 规范）：
 *   id: 1\n
 *   event: delta\n
 *   data: {"text":"..."}\n
 *   \n
 */
import type { ServerResponse } from 'node:http';

/** 流式任务类型（start 事件的 kind 字段） */
export type StreamKind = 'gen-case' | 'gen-assertion' | 'diagnose';

/** 统一事件名（协议见模块头注释） */
export type StreamEventName = 'start' | 'delta' | 'progress' | 'done' | 'error';

/** 流式生成的单个内容块（生成器逐项 yield 的结构） */
export interface StreamChunk {
  /** 增量文本（token 流片段或一行进度说明） */
  text: string;
  /** 附带结构化元数据（如已生成的断言对象、失败字段等，可选） */
  meta?: Record<string, unknown>;
  /** 进度百分比 0-100（可选；提供时额外推一条 progress 事件） */
  progress?: number;
}

/**
 * SSE 响应写出器：绑定一个已写头的 HTTP 响应，按帧写出事件。
 * 帧内 id 自增（客户端可据此断言顺序）。
 */
export class SseWriter {
  private readonly res: ServerResponse;
  private nextId = 1;
  private closed = false;

  constructor(res: ServerResponse) {
    this.res = res;
  }

  /** 是否已 close（close 后 send 静默忽略，防止毁坏已结束的响应） */
  get isClosed(): boolean {
    return this.closed;
  }

  /** 写出一条 SSE 事件：id 自增 + event 名 + data JSON 序列化 */
  send(event: StreamEventName | string, data: unknown): void {
    if (this.closed || this.res.writableEnded || this.res.destroyed) return;
    const frame = `id: ${this.nextId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.nextId += 1;
    this.res.write(frame);
  }

  /** 注释心跳行（`: ping\n\n`）——不产生事件，仅供中间层/浏览器保活 */
  heartbeat(): void {
    if (this.closed || this.res.writableEnded || this.res.destroyed) return;
    this.res.write(': ping\n\n');
  }

  /** 结束响应（幂等） */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.res.writableEnded) this.res.end();
  }
}

/**
 * 把一个普通 HTTP 响应升级为 SSE 响应：写标准 SSE 头，返回 SseWriter。
 * 头部说明：
 * - Content-Type: text/event-stream（SSE 必需）；
 * - Cache-Control: no-cache + X-Accel-Buffering: no（禁代理/网关缓冲，保证逐帧到达）；
 * - Connection: keep-alive（长连接）。
 */
export function createSseResponse(res: ServerResponse): SseWriter {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  return new SseWriter(res);
}

/** streamFromIterator 选项 */
export interface StreamOptions {
  /** 任务类型（start 事件的 kind）；缺省不发送 start（调用方自行编排时用） */
  kind?: StreamKind;
  /** start 事件的额外上下文字段（并入 data，如请求摘要） */
  startContext?: Record<string, unknown>;
  /**
   * 生成器 return 的完整结果对象之外的汇总兜底：
   * 未提供时 done.result 取生成器 return 值。
   */
}

/**
 * 通用流式编排 helper：把异步生成器逐项推成 delta 流。
 *
 * 完整生命周期（统一事件协议）：
 * 1. 发 start（opts.kind 提供时）；
 * 2. 逐项消费 iterable：每项发 delta（{ text, meta }），项带 progress 时先发 progress；
 * 3. 正常结束发 done（result = 生成器 return 的完整结果对象）并 close；
 * 4. 生成器抛错发 error（{ message }）并 close——error 后必须 close，连接不悬挂。
 *
 * 生成器用 return 值携带完整结果（for-await 会丢弃 return，故这里手动 next() 循环）。
 */
export async function streamFromIterator(
  writer: SseWriter,
  iterable: AsyncIterable<StreamChunk>,
  opts: StreamOptions = {},
): Promise<void> {
  if (opts.kind !== undefined) {
    writer.send('start', { kind: opts.kind, ...opts.startContext });
  }

  const iterator = iterable[Symbol.asyncIterator]();
  try {
    // 手动 next() 循环：done 时的 value 即生成器 return 的完整结果对象
    for (;;) {
      const step = await iterator.next();
      if (step.done) {
        writer.send('done', { kind: opts.kind ?? null, result: step.value ?? null });
        break;
      }
      const chunk: StreamChunk = step.value;
      if (chunk.progress !== undefined) {
        writer.send('progress', { percent: chunk.progress });
      }
      writer.send('delta', { text: chunk.text, meta: chunk.meta });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writer.send('error', { message });
  } finally {
    // 无论成败都收尾（error 发完必须 close；正常路径 done 后同样 close）
    writer.close();
  }
}
