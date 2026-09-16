/**
 * 迁移运行器（B1）：按文件名顺序应用 migrations/*.sql，_migrations 表去重，可重复执行。
 * 用法（真实 PG）：DATABASE_URL=... pnpm --filter @verifyos/server migrate
 * 冒烟测试（pg-mem）：pnpm --filter @verifyos/server db:smoke
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

export interface MigrateOptions {
  /** 冒烟测试（pg-mem）用：按文件名变换 SQL（如剥离 CREATE EXTENSION / 替换 vector 类型） */
  transform?: (sql: string, file: string) => string;
}

export async function runMigrations(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  opts: MigrateOptions = {},
) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error('no migration files');
  // to_regclass 存在性检查代替 CREATE IF NOT EXISTS（pg-mem 对已存在表重复该语句有规划器 bug；真实 PG 同样幂等）
  const hasMig = (await client.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='_migrations'",
  )) as { rows: { n: number }[] };
  if (hasMig.rows[0].n === 0) {
    await client.query('CREATE TABLE _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  }
  for (const f of files) {
    const done = await client.query('SELECT 1 FROM _migrations WHERE name=$1', [f]) as { rows: unknown[] };
    if (done.rows.length > 0) {
      console.log(`  · skip ${f}（已应用）`);
      continue;
    }
    let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    if (opts.transform) sql = opts.transform(sql, f);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES($1)', [f]);
      await client.query('COMMIT');
      console.log(`  ✓ applied ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL || 'postgresql://verifyos:verifyos@localhost:5432/verifyos';
  const pool = new pg.Pool({ connectionString: url });
  try {
    console.log(`[migrate] ${url.replace(/:[^:@]+@/, '://***@')}`);
    await runMigrations(pool);
    const t = await pool.query(
      `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'`,
    );
    console.log(`[migrate] done · public 表 ${t.rows[0].n} 张`);
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('migrate.ts');
if (isMain) main().catch((e) => { console.error('[migrate] failed:', e.message); process.exit(1); });
