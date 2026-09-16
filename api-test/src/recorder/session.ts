/**
 * 录制会话：开始/停止录制 + 导出录制结果。
 *
 * 生命周期：idle --start()--> recording --stop()--> stopped。
 * - start()：开启新会话（清空旧数据，单会话模型）；
 * - record()：录制期间采集流量；
 * - stop()：结束录制并落盘；
 * - export()：导出本次会话的流量记录 + 按 method+path 归组去重后的 API 集合。
 */
import { randomUUID } from 'node:crypto';
import type { TrafficRecord } from '../types/models.js';
import type { RecordStore } from './storage.js';
import type { ApiGroup, SessionExport, SessionMeta, SessionStatus } from './types.js';

export class RecordingSession {
  readonly id: string = randomUUID();

  private status: SessionStatus = 'idle';
  private startedAt: string | null = null;
  private endedAt: string | null = null;
  private records: TrafficRecord[] = [];

  constructor(private readonly store: RecordStore) {}

  get isRecording(): boolean {
    return this.status === 'recording';
  }

  /** 开启新会话（单会话模型：清空历史） */
  start(): void {
    if (this.status === 'recording') {
      throw new Error('录制会话已在进行中，请先 stop() 再 start()');
    }
    this.store.clear();
    this.records = [];
    this.status = 'recording';
    this.startedAt = new Date().toISOString();
    this.endedAt = null;
  }

  /** 采集一条流量（仅在 recording 状态写入） */
  record(record: TrafficRecord): void {
    if (this.status !== 'recording') return;
    this.records.push(record);
    this.store.append(record);
  }

  /** 停止录制并落盘，返回会话元数据 */
  stop(): SessionMeta {
    if (this.status === 'recording') {
      this.status = 'stopped';
      this.endedAt = new Date().toISOString();
      this.store.persist();
    }
    return this.meta();
  }

  /** 导出本次会话结果（记录 + 归组去重的 API 集合） */
  export(): SessionExport {
    return {
      session: this.meta(),
      records: [...this.records],
      apis: this.groupByApi(),
    };
  }

  /** 会话元数据快照 */
  meta(): SessionMeta {
    return {
      id: this.id,
      status: this.status,
      started_at: this.startedAt,
      ended_at: this.endedAt,
      record_count: this.records.length,
    };
  }

  /** 同 method+path 归组去重，产出「API 集合」 */
  private groupByApi(): ApiGroup[] {
    const map = new Map<string, ApiGroup>();

    for (const r of this.records) {
      const key = `${r.method} ${r.path}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.sample_ids.push(r.id);
        if (!existing.status_codes.includes(r.status_code)) {
          existing.status_codes.push(r.status_code);
        }
        if (r.timestamp > existing.last_seen_at) {
          existing.last_seen_at = r.timestamp;
        }
      } else {
        map.set(key, {
          method: r.method,
          path: r.path,
          count: 1,
          sample_ids: [r.id],
          status_codes: [r.status_code],
          last_seen_at: r.timestamp,
        });
      }
    }

    // 按 method+path 稳定排序，便于输出与断言
    return [...map.values()].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
  }
}
