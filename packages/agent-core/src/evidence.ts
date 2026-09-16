import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * EvidenceStore（C2）：证据对象存储接口。
 * v1 用 LocalDiskStore（本地磁盘，out/evidence 结构化落盘）；
 * MinIO 生产实现同名接口即可切换（put 返回对象 key，load 取回）。
 */
export interface EvidenceStore {
  /** 存二进制对象，返回存储 key（evidenceId 用） */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  exists(key: string): boolean;
  /** 列出某 run 的全部证据 key */
  list(runId: string): string[];
}

export class LocalDiskStore implements EvidenceStore {
  constructor(private readonly baseDir: string) {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private file(key: string): string {
    return path.join(this.baseDir, key);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const f = this.file(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  }

  exists(key: string): boolean {
    return fs.existsSync(this.file(key));
  }

  list(runId: string): string[] {
    const dir = path.join(this.baseDir, runId);
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    const walk = (d: string, prefix = '') => {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        if (fs.statSync(full).isDirectory()) walk(full, `${prefix}${f}/`);
        else out.push(`${prefix}${f}`);
      }
    };
    walk(dir);
    return out;
  }
}

/** 证据 key 规范：<runId>/<kind>-<stepId|run>-<rand6>.<ext> */
export function evidenceKey(runId: string, kind: string, tag: string, ext: string): string {
  const rand = crypto.randomBytes(3).toString('hex');
  return `${runId}/${kind}-${tag}-${rand}.${ext}`;
}
