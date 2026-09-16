import crypto from 'node:crypto';

interface PgLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface PreviewInput {
  applicationId: number;
  /** Preview 环境 URL（CI 部署产物 / Vercel preview 等） */
  url: string;
  branch: string;
  prNumber?: number;
  name?: string;
}

export interface PreviewEnv {
  environmentId: number;
  shortId: string;
  isPreview: true;
  reused: boolean;
}

/**
 * D2：Preview Environment（qa.tech 语义——PR 验证没有独立流水线，
 * 只是 Run 请求带 environment.url override → 自动落 is_preview 记录 + branch/PR metadata）。
 * 同 (application_id, branch, pr_number) 已存在则复用并刷新 URL（同一 PR 多次 Run 不堆记录）。
 */
export async function savePreviewEnvironment(pool: PgLike, input: PreviewInput): Promise<PreviewEnv> {
  const existing = await pool.query(
    `SELECT id, short_id FROM environment
     WHERE application_id = $1 AND is_preview = true AND branch = $2
       AND (pr_number = $3 OR ($3::int IS NULL AND pr_number IS NULL))
     LIMIT 1`,
    [input.applicationId, input.branch, input.prNumber ?? null],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    await pool.query(`UPDATE environment SET url = $1 WHERE id = $2`, [input.url, row.id]);
    return { environmentId: row.id as number, shortId: row.short_id as string, isPreview: true, reused: true };
  }

  const shortId = `env_prev_${crypto.randomBytes(4).toString('hex')}`;
  const name = input.name ?? `Preview · ${input.branch}${input.prNumber ? ` !${input.prNumber}` : ''}`;
  const r = await pool.query(
    `INSERT INTO environment(short_id, application_id, name, url, is_preview, branch, pr_number)
     VALUES ($1, $2, $3, $4, true, $5, $6) RETURNING id`,
    [shortId, input.applicationId, name, input.url, input.branch, input.prNumber ?? null],
  );
  return { environmentId: r.rows[0].id as number, shortId, isPreview: true, reused: false };
}
