/**
 * Node 端 SSE 消费 helper（P2.8）：consumeSse(url, onEvent)。
 *
 * Node 22 无全局 EventSource，这里用原生 fetch + ReadableStream 手写 SSE 解析：
 * - 按 `\n\n` 分帧（兼容 `\r\n` 行尾，逐行剥 `\r`）；
 * - 每帧解析 `event:` / `data:` / `id:` 行（`:` 开头为注释行，忽略；多行 data 以 `\n` join）；
 * - data 尝试 JSON.parse，失败则原样传字符串（协议 data 均为 JSON，正常不会走到）；
 * - 连接建立后回调 onOpen(response)（可检查 status / content-type）；
 * - 每条事件回调 onEvent(event, data, id)；
 * - 非 200 响应抛清晰错误；流被对端关闭则正常 resolve；
 * - 支持 AbortSignal：客户端中止时 fetch 抛 AbortError（调用方 catch 即可）。
 *
 * 零依赖（仅 Node 22 全局 fetch / TextDecoder）。
 */

/** consumeSse 选项 */
export interface ConsumeSseOptions {
  /** 中止信号（客户端主动停止：AbortController.abort()） */
  signal?: AbortSignal;
  /** 连接建立后回调（拿到原始 Response，可检查头） */
  onOpen?: (response: Response) => void;
  /** 请求头（如鉴权） */
  headers?: Record<string, string>;
}

/** 单条 SSE 事件回调：事件名 + 解析后的 data + 帧 id */
export type SseEventHandler = (event: string, data: unknown, id: number | null) => void;

/**
 * 消费一个 SSE 端点直到对端关闭（或 abort）。
 *
 * @param url SSE 端点地址
 * @param onEvent 每条事件的回调（event 名缺省为 'message'）
 * @param opts 选项：signal / onOpen / headers
 * @throws 非 200 响应、网络错误、abort（AbortError）
 */
export async function consumeSse(
  url: string,
  onEvent: SseEventHandler,
  opts: ConsumeSseOptions = {},
): Promise<void> {
  const res = await fetch(url, {
    headers: { accept: 'text/event-stream', ...opts.headers },
    signal: opts.signal,
  });

  if (!res.ok) {
    res.body?.cancel().catch(() => undefined);
    throw new Error(`SSE 连接失败：HTTP ${res.status} ${res.statusText}（${url}）`);
  }
  opts.onOpen?.(res);

  const body = res.body;
  if (!body) {
    throw new Error(`SSE 连接失败：响应无 body（${url}）`);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break; // 对端关闭（done/error 事件后 close），正常结束
      buffer += decoder.decode(value, { stream: true });

      // 按 \n\n 分帧（可能一次 read 含多帧）
      for (;;) {
        const sep = buffer.indexOf('\n\n');
        if (sep === -1) break;
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseFrame(frame);
        if (parsed) onEvent(parsed.event, parsed.data, parsed.id);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 解析单个 SSE 帧：event/data/id 行（注释行忽略，多行 data 以 \n join）。空帧返回 null。 */
function parseFrame(frame: string): { event: string; data: unknown; id: number | null } | null {
  let event = 'message';
  let id: number | null = null;
  const dataLines: string[] = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '' || line.startsWith(':')) continue; // 空行/注释行
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    } else if (line.startsWith('id:')) {
      const n = Number.parseInt(line.slice(3).trim(), 10);
      if (Number.isFinite(n)) id = n;
    }
    // 其余字段（retry: 等）忽略
  }

  if (dataLines.length === 0 && id === null) return null; // 无内容帧
  const raw = dataLines.join('\n');
  let data: unknown = raw;
  if (raw !== '') {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw; // 非 JSON 原样透传
    }
  }
  return { event, data, id };
}
