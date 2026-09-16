/**
 * 录制层（A2 代理模式）专用类型。
 * 与核心数据模型（src/types/models.ts 的 TrafficRecord）配合：
 * - 会话（session）负责「启停 + 导出」的生命周期；
 * - 归组（ApiGroup）是「同 method+path 去重」后的 API 集合，供导出与后续 inventory 消费。
 */
import type { HttpMethod, TrafficRecord } from '../types/models.js';

/** 录制会话状态机 */
export type SessionStatus = 'idle' | 'recording' | 'stopped';

/** 归组后的 API（同 method+path 去重，构成「API 集合」） */
export interface ApiGroup {
  /** HTTP 方法 */
  method: HttpMethod;
  /** 规范化路径（保留原始 path，动态段归一化在 A4 inventory 阶段做） */
  path: string;
  /** 该 API 在本次会话中出现的样本数 */
  count: number;
  /** 样本记录 ID 列表 */
  sample_ids: string[];
  /** 观察到的响应状态码（去重） */
  status_codes: number[];
  /** 最近一次被录到的时间（ISO 8601） */
  last_seen_at: string;
}

/** 录制会话元数据 */
export interface SessionMeta {
  /** 会话 ID */
  id: string;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  /** 会话内流量样本数 */
  record_count: number;
}

/** 会话导出结果（开始/停止录制后导出） */
export interface SessionExport {
  session: SessionMeta;
  /** 本次会话的流量记录 */
  records: TrafficRecord[];
  /** 归组去重后的 API 集合 */
  apis: ApiGroup[];
}
