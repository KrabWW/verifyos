/**
 * F15 冒烟：MCP 连接器（McpToolAdapter）端到端
 *   [1] spawn 外部 MCP server（stdio）→ initialize 握手 → tools/list
 *   [2] 工具转 ToolRegistry（权限三档 + 审计）
 *   [3] invoke 转发 → tools/call → 返回 content 拼接
 *   [4] 断线重连（子进程退出后重试 respawn + 重新握手）
 *   [5] dispose 释放
 *
 * 运行：npx tsx src/mcp.smoke.ts（fixture: fixtures/mcp-echo-server.mjs）
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ToolRegistry } from './registry.js';
import { McpToolAdapter, type McpToolInfo } from './mcp.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
    failures++;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '../fixtures/mcp-echo-server.mjs');

async function main() {
  console.log('[F15] McpToolAdapter 端到端（stdio）');
  console.log(`  fixture: ${serverPath}`);

  const registry = new ToolRegistry();
  const logs: string[] = [];
  const adapter = new McpToolAdapter({
    name: 'echo',
    config: { transport: 'stdio', command: process.execPath, args: [serverPath] },
    permission: 'auto',
    logger: (m) => logs.push(m),
  });

  // [1] 连接 + tools/list
  const tools = await adapter.start();
  check('tools/list 返回 3 个工具（echo/add/crash）', tools.length === 3, `实际 ${tools.length}`);
  check('含 echo 工具', tools.some((t: McpToolInfo) => t.name === 'echo'));
  check('inputSchema 透传', (tools[0]?.inputSchema?.type ?? '') === 'object');

  // [2] 注册进 ToolRegistry
  const names = await adapter.register(registry);
  check('注册 3 个工具', names.length === 3, `实际 ${names.length}`);
  const list = registry.list();
  check('registry 可见 echo（auto 档）', list.find((t) => t.name === 'echo')?.permission === 'auto');

  // [3] invoke 转发
  const r1 = await registry.invoke('echo', { text: 'hello-mcp' });
  check('echo 转发返回 ok', r1.ok, r1.error);
  check('echo content 拼接', (r1.data as { text?: string } | undefined)?.text === 'echo: hello-mcp', JSON.stringify(r1.data));

  const r2 = await registry.invoke('add', { a: 3, b: 4 });
  check('add 转发返回 ok', r2.ok, r2.error);
  check('add 结果 = 7', (r2.data as { text?: string } | undefined)?.text === '7', JSON.stringify(r2.data));
  check('structuredContent 透传', (r2.data as { structuredContent?: { sum?: number } } | undefined)?.structuredContent?.sum === 7);

  // [4] 断线重连：crash 令子进程退出，随后 echo 应能重新连上
  const rc = await registry.invoke('crash', {});
  check('crash 触发调用失败', !rc.ok, rc.error);
  await new Promise((r) => setTimeout(r, 300));
  const r3 = await registry.invoke('echo', { text: 'after-reconnect' });
  check('断线后重连成功（echo 恢复）', r3.ok && (r3.data as { text?: string } | undefined)?.text === 'echo: after-reconnect', r3.error ?? JSON.stringify(r3.data));
  check('重连日志存在', logs.some((l) => l.includes('重连') || l.includes('已连接')));

  // 审计
  const audit = registry.audit();
  check('审计含 auto via', audit.some((a) => a.via === 'auto'));
  check('审计含 mcpTool 字段', audit.some((a) => (a.args && (a as unknown as { args: Record<string, unknown> }).args) !== undefined));

  // [5] dispose
  await adapter.dispose();
  check('dispose 后调用报已释放', (await adapter.callTool('echo', { text: 'x' })).ok === false);

  console.log(failures === 0 ? '\n✅ F15 MCP 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
