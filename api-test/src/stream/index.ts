/**
 * P2.8 流式 SSE 模块入口（barrel）。
 *
 * 三个关注点分层：
 * - sse.ts：服务端协议层（SSE 头 / SseWriter / 事件协议编排）；
 * - generate-stream.ts：流式生成源（用例 / 断言 / 诊断三个 async generator，规则式核心复用 src/assertion）；
 * - client.ts：Node 端消费（手写 fetch + ReadableStream 的 SSE 解析）。
 */
export {
  SseWriter,
  createSseResponse,
  streamFromIterator,
  type StreamChunk,
  type StreamEventName,
  type StreamKind,
  type StreamOptions,
} from './sse.js';
export {
  streamGenAssertion,
  streamGenCase,
  streamDiagnose,
  type GenAssertionInput,
  type GenCaseInput,
} from './generate-stream.js';
export { consumeSse, type ConsumeSseOptions, type SseEventHandler } from './client.js';
