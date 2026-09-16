/**
 * A2 验收自验证脚本：真跑通「起代理 → curl 走代理发请求 → 停止 → 导出 → 归组去重断言」。
 *
 * 运行：npm run verify:record   （等价于 tsx scripts/verify-record.ts）
 * 覆盖：
 *   - HTTP 明文全量记录（method/path/query/headers/body/status/latency）；
 *   - 同 method+path 去重归组（含「查询参数不同但 path 相同」归为同一 API）；
 *   - JSON 文件持久化。
 * 注意：HTTPS 因 CONNECT 隧道端到端加密，body 无法明文（限制见 README）。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecorderProxy } from '../src/recorder/proxy.js';
import { RecordingSession } from '../src/recorder/session.js';
import { JsonFileRecordStore } from '../src/recorder/storage.js';

const TARGET_PORT = 19009;
const PROXY_PORT = 18008;
const DATA_FILE = join(tmpdir(), `api-test-verify-${Date.now()}.json`);

let failures = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

function curl(args: string[]): Promise<string> {
  // 注意：必须用异步 spawn，spawnSync 会阻塞事件循环导致代理无法响应
  return new Promise((resolve, reject) => {
    const child = spawn('curl', ['-s', '-g', ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`curl 退出码 ${code}: ${stderr}`));
    });
  });
}

async function main(): Promise<void> {
  // 1. 起目标 echo 服务（curl 的真实访问对象）
  const target = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          echo_body: Buffer.concat(chunks).toString('utf-8'),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => target.listen(TARGET_PORT, '127.0.0.1', resolve));

  // 2. 起录制代理
  const store = new JsonFileRecordStore(DATA_FILE);
  const session = new RecordingSession(store);
  const proxy = new RecorderProxy(session, { host: '127.0.0.1', port: PROXY_PORT });
  session.start();
  await proxy.start();

  const base = `http://127.0.0.1:${TARGET_PORT}`;
  const proxyArg = `http://127.0.0.1:${PROXY_PORT}`;

  // 3. curl 走代理发请求（含重复与同 path 不同 query）
  await curl(['-x', proxyArg, `${base}/users/1`]);
  await curl(['-x', proxyArg, `${base}/users/1`]);
  await curl(['-x', proxyArg, `${base}/users/1?foo=bar&foo=baz`]);
  await curl(['-x', proxyArg, '-X', 'POST', '-d', '{"a":1}', '-H', 'Content-Type: application/json', `${base}/orders`]);

  // 4. 停止 + 导出
  session.stop();
  await proxy.stop();
  await new Promise<void>((resolve) => target.close(() => resolve()));

  const result = session.export();

  // 5. 断言
  console.log('--- 录制闭环断言 ---');
  assert(result.session.record_count === 4, `会话记录数 = 4（实际 ${result.session.record_count}）`);
  assert(result.records.length === 4, `导出记录数 = 4（实际 ${result.records.length}）`);
  assert(result.apis.length === 2, `去重后 API 数 = 2（实际 ${result.apis.length}）`);

  const users = result.apis.find((a) => a.method === 'GET' && a.path === '/users/1');
  assert(!!users, '存在 API 组 GET /users/1');
  assert(users?.count === 3, `GET /users/1 归组 count = 3（实际 ${users?.count}）`);
  assert(
    JSON.stringify(users?.status_codes) === JSON.stringify([200]),
    `GET /users/1 status_codes = [200]（实际 ${JSON.stringify(users?.status_codes)}）`,
  );

  const orders = result.apis.find((a) => a.method === 'POST' && a.path === '/orders');
  assert(!!orders, '存在 API 组 POST /orders');
  assert(orders?.count === 1, `POST /orders 归组 count = 1（实际 ${orders?.count}）`);

  const postRecord = result.records.find((r) => r.method === 'POST' && r.path === '/orders');
  assert(postRecord?.request_body === '{"a":1}', `POST 请求体被记录 = '{"a":1}'（实际 ${JSON.stringify(postRecord?.request_body)}）`);
  assert(postRecord?.status_code === 200, `POST 响应码 = 200（实际 ${postRecord?.status_code}）`);
  assert(
    typeof postRecord?.latency_ms === 'number' && (postRecord?.latency_ms ?? -1) >= 0,
    `POST 耗时已记录且 >= 0（实际 ${postRecord?.latency_ms}）`,
  );
  assert(
    typeof postRecord?.response_body === 'string' && (postRecord?.response_body ?? '').includes('/orders'),
    '响应体已记录且含路径回显',
  );

  const queryRecord = result.records.find((r) => r.method === 'GET' && r.path === '/users/1' && r.query_params.foo);
  assert(
    JSON.stringify(queryRecord?.query_params.foo) === JSON.stringify(['bar', 'baz']),
    `查询参数多值已记录 foo=['bar','baz']（实际 ${JSON.stringify(queryRecord?.query_params)}）`,
  );

  assert(result.records.every((r) => r.source === 'proxy'), '所有记录 source = proxy');
  assert(result.records.every((r) => !!r.id && !!r.timestamp), '所有记录含 id + timestamp');

  // 6. 持久化校验：重新从文件加载，记录数一致
  const reloaded = new JsonFileRecordStore(DATA_FILE);
  assert(reloaded.list().length === 4, `持久化文件可重载，记录数 = 4（实际 ${reloaded.list().length}）`);

  console.log('---');
  console.log(failures === 0 ? 'ALL PASS：代理录制闭环跑通。' : `存在 ${failures} 项失败。`);
  console.log(`持久化文件：${DATA_FILE}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
