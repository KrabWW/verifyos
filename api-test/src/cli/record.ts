/**
 * 录制器手动 CLI：起代理 + 演示目标服务 → 录制 → Ctrl+C 停止 → 导出。
 *
 * 用法：
 *   npm run record -- --port 8008
 *   # 另开终端用 curl 走代理：
 *   curl -x http://127.0.0.1:8008 http://127.0.0.1:9009/users/1
 *   curl -x http://127.0.0.1:8008 -d '{"a":1}' http://127.0.0.1:9009/orders
 *   # 回到本终端按 Ctrl+C，导出到 data/recording-<sessionId>.json
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { RecorderProxy } from '../recorder/proxy.js';
import { RecordingSession } from '../recorder/session.js';
import { JsonFileRecordStore } from '../recorder/storage.js';

const PROXY_PORT = parsePort(process.argv, 8008);
const TARGET_PORT = 9009;
const DATA_FILE = 'data/recording.json';

function parsePort(argv: string[], fallback: number): number {
  const idx = argv.indexOf('--port');
  if (idx !== -1 && argv[idx + 1]) {
    const n = Number(argv[idx + 1]);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return fallback;
}

/** 演示目标服务：回显 method/url/headers/body，供 curl 经代理访问 */
function createTargetServer(): ReturnType<typeof createServer> {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          echo_body: body || null,
        }),
      );
    });
  });
}

async function main(): Promise<void> {
  const target = createTargetServer();
  await new Promise<void>((resolve) => target.listen(TARGET_PORT, '127.0.0.1', resolve));

  const store = new JsonFileRecordStore(DATA_FILE);
  const session = new RecordingSession(store);
  const proxy = new RecorderProxy(session, { host: '127.0.0.1', port: PROXY_PORT });

  session.start();
  await proxy.start();

  console.log('='.repeat(60));
  console.log(`录制代理已启动: http://127.0.0.1:${PROXY_PORT}`);
  console.log(`演示目标服务  : http://127.0.0.1:${TARGET_PORT}`);
  console.log('示例（另开终端）:');
  console.log(`  curl -x http://127.0.0.1:${PROXY_PORT} http://127.0.0.1:${TARGET_PORT}/users/1`);
  console.log(`  curl -x http://127.0.0.1:${PROXY_PORT} -d '{"a":1}' http://127.0.0.1:${TARGET_PORT}/orders`);
  console.log('录制中... 按 Ctrl+C 停止并导出。');
  console.log('='.repeat(60));

  const shutdown = async (): Promise<void> => {
    console.log('\n停止录制并导出...');
    session.stop();
    await proxy.stop();
    await new Promise<void>((resolve) => target.close(() => resolve()));

    const result = session.export();
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(result, null, 2), 'utf-8');

    console.log(`\n会话 ${result.session.id}`);
    console.log(`流量记录数: ${result.records.length}`);
    console.log(`归组 API 数（去重后）: ${result.apis.length}`);
    for (const api of result.apis) {
      console.log(`  - ${api.method} ${api.path}  x${api.count}  status=${api.status_codes.join('/')}`);
    }
    console.log(`\n已导出到 ${DATA_FILE}`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
