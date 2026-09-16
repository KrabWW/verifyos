/**
 * 存储引擎（A2 轻量起步：内存 + JSON 文件持久化）。
 *
 * 选择说明：
 * - 起步不引入 SQLite/Postgres，用「内存数组 + JSON 落盘」满足「可查询 + 可持久化」；
 * - 通过 RecordStore 接口隔离，后续 A3+ 可平滑替换为 SQLite（单文件、无服务）
 *   或 Postgres（生产多会话 + 看板聚合）；
 * - 当前为单会话模型：start() 会清空旧数据，一次只保留一个活跃会话的录制结果。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TrafficRecord } from '../types/models.js';

/** 存储引擎抽象：录制层只依赖此接口，不关心底层是 JSON/SQLite/Postgres */
export interface RecordStore {
  /** 追加一条流量记录 */
  append(record: TrafficRecord): void;
  /** 读取全部流量记录 */
  list(): TrafficRecord[];
  /** 持久化到磁盘 */
  persist(): void;
  /** 清空（含持久化文件） */
  clear(): void;
}

/** JSON 文件存储实现：append 写内存，persist() 落盘，构造时从文件恢复 */
export class JsonFileRecordStore implements RecordStore {
  private records: TrafficRecord[] = [];

  constructor(private readonly filePath: string) {
    this.load();
  }

  append(record: TrafficRecord): void {
    this.records.push(record);
  }

  list(): TrafficRecord[] {
    return this.records;
  }

  persist(): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify({ records: this.records }, null, 2), 'utf-8');
  }

  clear(): void {
    this.records = [];
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify({ records: [] }, null, 2), 'utf-8');
    } catch {
      // 清空落盘失败不阻断录制（下次 persist 会重建）
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { records?: TrafficRecord[] };
      this.records = parsed.records ?? [];
    } catch {
      // 文件损坏时按空处理，避免启动失败
      this.records = [];
    }
  }
}
