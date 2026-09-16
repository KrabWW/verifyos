// 极简 MCP stdio server（用于 F15 端到端验证）：
// 实现 initialize / tools/list / tools/call，暴露 echo 与 add 两个工具。
// 协议：stdin/stdout 换行分隔 JSON（NDJSON）。
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

const TOOLS = [
  {
    name: 'echo',
    description: '把 text 原样回显（MCP echo 工具）',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
  },
  {
    name: 'add',
    description: '两数相加',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'crash',
    description: '立即退出进程（用于测试断线重连）',
    inputSchema: { type: 'object', properties: {} },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'echo-server', version: '1.0.0' },
      },
    });
  } else if (method === 'notifications/initialized') {
    // 无响应
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (name === 'echo') {
      const text = String(args.text ?? '');
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `echo: ${text}` }] } });
    } else if (name === 'add') {
      const sum = Number(args.a) + Number(args.b);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(sum) }], structuredContent: { sum } } });
    } else if (name === 'crash') {
      process.stderr.write('[echo-server] crashing\n');
      process.exit(1);
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具 ${name}` } });
    }
  } else if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
  }
});

process.stderr.write('[echo-server] ready\n');
