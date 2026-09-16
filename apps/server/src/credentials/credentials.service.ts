import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { CredentialCrypto } from '@verifyos/agent-core';

export interface SaveCredentialInput {
  projectId: string;
  environmentId?: string;
  name: string;
  role: string;
  kind: 'form' | 'basic' | 'token';
  values: Record<string, string>;
  createdBy?: string;
}

interface PgLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * 凭据服务（B3 server 侧）：values JSON → AES-256-GCM → credential.payload_enc。
 * Pool 由调用方注入（真实 PG 或 pg-mem 均可），便于独立测试。
 */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(Pool) private readonly pool: PgLike,
    private readonly crypto: CredentialCrypto,
  ) {}

  async save(input: SaveCredentialInput): Promise<string> {
    const payloadEnc = this.crypto.encrypt(JSON.stringify(input.values));
    const r = await this.pool.query(
      `INSERT INTO credential(project_id, environment_id, name, role, kind, payload_enc, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        input.projectId,
        input.environmentId ?? null,
        input.name,
        input.role,
        input.kind,
        payloadEnc,
        input.createdBy ?? null,
      ],
    );
    return r.rows[0].id as string;
  }

  /** 按角色+环境取凭据并解密（爬取/执行时使用） */
  async loadValues(projectId: string, role: string, environmentId?: string): Promise<Record<string, string> | null> {
    const r = await this.pool.query(
      `SELECT payload_enc FROM credential
       WHERE project_id = $1 AND role = $2
         AND (environment_id = $3 OR ($3::uuid IS NULL AND environment_id IS NULL))
       ORDER BY updated_at DESC LIMIT 1`,
      [projectId, role, environmentId ?? null],
    );
    if (r.rows.length === 0) return null;
    return JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc as string)) as Record<string, string>;
  }
}
