// N 系示例代码插件：演示「进程内插件」扩展新能力（Cordis 式 activate(ctx) 约定）
// 这个文件由 PluginRuntime 经 tsx/cjs hook 运行时加载，默认导出 activate 函数。

interface Ctx {
  registerTool: (def: {
    name: string;
    description: string;
    permission: 'auto' | 'ask' | 'forbidden';
    run: (args: Record<string, unknown>) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  }) => void;
  db: { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };
  config: Record<string, unknown>;
  log: (...args: unknown[]) => void;
}

export default async function activate(ctx: Ctx) {
  ctx.log('订单库插件激活', JSON.stringify(ctx.config));

  // 注册一个「插件级」工具——真正通过 ctx.db 查库（只读）
  ctx.registerTool({
    name: 'order-db.count',
    description: '统计订单库当前订单数（N 系插件示例，经 ctx.db 真查 PG）',
    permission: 'auto',
    run: async (args) => {
      try {
        const r = await ctx.db.query('SELECT count(*)::int AS n FROM run');
        return { ok: true, data: { orderCount: r.rows[0]?.n ?? 0, note: '示例：查的是平台 run 表（真实多源库连接需插件自建连接）', echo: args } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  });

  return {
    onDispose: () => { ctx.log('订单库插件卸载——已撤回注册的工具'); },
  };
}
