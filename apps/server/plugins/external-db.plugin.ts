// N4 示例代码插件：外部数据库连接插件
// 演示「代码插件」能真正连接外部数据库（非平台 PG）——自带代码、进程内运行、连任意外部服务。
// 加载方式同 sample-echo：PluginRuntime 经 tsx/cjs hook 运行时 require 本文件，默认导出 activate。

interface Ctx {
  registerTool: (def: {
    name: string;
    description: string;
    permission: 'auto' | 'ask' | 'forbidden';
    run: (args: Record<string, unknown>) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  }) => void;
  llm: (prompt: string) => Promise<string>;
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
  config: Record<string, unknown>;
  log: (...args: unknown[]) => void;
}

export default async function activate(ctx: Ctx) {
  // 1. 连接串来自 manifest.config（插件作者在创建向导里填），动态 import pg 建立外部库连接。
  //    动态 import 放在 activate 内，仅在插件被加载时解析 pg，失败会被下方 try/catch 兜住。
  const { Pool } = await import('pg');
  const connectionString = String(ctx.config.connectionString ?? '').trim();
  if (!connectionString) {
    ctx.log('外部库插件：manifest.config 缺少 connectionString，跳过建连（工具不可用）');
    return {
      onDispose: () => { ctx.log('外部库插件卸载（未建立连接，无需回滚）'); },
    };
  }

  // 2. Pool 建在 activate 闭包：下面两个工具的 run 都引用它，onDispose 里统一关闭。
  //    注意：这里只 new Pool 不立即 query，连接失败会延迟到首次 run 时才暴露，run 内已 catch。
  const pool = new Pool({ connectionString });

  // 3. 只读查询工具（permission='ask'：写操作/高危 SQL 前人工批准；强制只读 + LIMIT 100 防全表扫）。
  ctx.registerTool({
    name: 'ext-db.query',
    description: '对外部数据库执行只读 SQL 查询（仅 SELECT/WITH，自动补 LIMIT 100，最多 100 行）',
    permission: 'ask',
    run: async (args) => {
      try {
        const raw = String(args.sql ?? '').trim().replace(/;\s*$/, '');
        if (!raw) return { ok: false, error: 'sql 参数为空' };
        // 强制只读：只放行 SELECT / WITH(CTE)，拒绝 INSERT/UPDATE/DELETE/DDL 等写操作
        if (!/^(select|with)\b/i.test(raw)) {
          return { ok: false, error: 'ext-db.query 仅支持只读查询（SELECT / WITH）' };
        }
        // 强制 LIMIT：已带 LIMIT 则沿用，否则补 LIMIT 100
        const safeSql = /limit\s+\d+/i.test(raw) ? raw : `${raw} LIMIT 100`;
        const r = await pool.query(safeSql);
        return { ok: true, data: { rows: r.rows, count: r.rows.length } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  });

  // 4. 表计数工具（permission='auto'：只读统计自动执行，结果直接入证据链）。
  ctx.registerTool({
    name: 'ext-db.count',
    description: '统计外部数据库某张表（可带 schema）的行数',
    permission: 'auto',
    run: async (args) => {
      try {
        const table = String(args.table ?? '').trim();
        if (!table) return { ok: false, error: 'table 参数为空' };
        // 表名无法参数化：白名单校验 + 双引号包裹防 SQL 注入
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(table)) {
          return { ok: false, error: 'table 仅允许 [schema.]表名（字母/数字/下划线）' };
        }
        const quoted = table.split('.').map((p) => `"${p}"`).join('.');
        const r = await pool.query(`SELECT count(*)::int AS n FROM ${quoted}`);
        return { ok: true, data: { table, count: r.rows[0]?.n ?? 0 } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  });

  ctx.log('外部库插件激活', JSON.stringify({ host: connectionString }));

  // 5. 卸载回滚：关闭外部连接池（时间可组合性——卸载即撤回工具、回收连接）。
  return {
    onDispose: async () => {
      ctx.log('外部库插件卸载——关闭外部连接池');
      await pool.end();
    },
  };
}
