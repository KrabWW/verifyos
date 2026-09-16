/**
 * 覆盖趋势存储：累积每次跑测试产出的 CoverageRecord，支撑「覆盖随历史累积」。
 *
 * 本阶段为内存数组实现；record 按追加顺序即时间顺序，可通过 trend(apiKey) 读取
 * 某 API 的覆盖变化曲线。后续可平滑替换为 SQLite / Postgres（字段已在 types 里对齐）。
 */
import type { CoverageRecord } from './types.js';

export class CoverageStore {
  private readonly records: CoverageRecord[] = [];

  /** 追加一批记录（一次跑测试） */
  append(records: CoverageRecord[]): void {
    this.records.push(...records);
  }

  /** 全部记录（按追加顺序，即时间升序） */
  all(): CoverageRecord[] {
    return [...this.records];
  }

  /** 某 API 的覆盖趋势（按时间升序） */
  trend(apiKey: string): CoverageRecord[] {
    return this.records.filter((r) => r.api_key === apiKey);
  }

  /** 每个 api_key 的最近一条记录 */
  latestByApi(): Map<string, CoverageRecord> {
    const latest = new Map<string, CoverageRecord>();
    for (const record of this.records) {
      latest.set(record.api_key, record);
    }
    return latest;
  }

  get size(): number {
    return this.records.length;
  }
}
