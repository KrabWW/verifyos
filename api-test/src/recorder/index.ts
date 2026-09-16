/**
 * 录制层（A2 代理模式流量录制）。
 * 选型结论：代理起步 / eBPF 后置，详见 docs/tech-selection.md。
 *
 * 对外导出：
 * - RecorderProxy：HTTP 代理录制器（HTTP 明文全量记录 + HTTPS CONNECT 隧道元数据）；
 * - RecordingSession：录制会话（开始/停止/导出/归组去重）；
 * - JsonFileRecordStore：轻量存储（内存 + JSON 落盘）。
 */
export const MODULE = 'recorder' as const;

export { RecorderProxy } from './proxy.js';
export type { ProxyOptions } from './proxy.js';
export { RecordingSession } from './session.js';
export { JsonFileRecordStore } from './storage.js';
export type { RecordStore } from './storage.js';
export type { ApiGroup, SessionExport, SessionMeta, SessionStatus } from './types.js';
