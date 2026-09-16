/**
 * P1.2 验收 demo：噪音检测前移到录制时——3 类请求 → 分级正确。
 *
 * 运行：npm run demo:classify
 * 覆盖：
 *   - top_level：带 sec-fetch-dest=document 的导航主文档请求；
 *   - ajax：X-Requested-With=XMLHttpRequest / accept=application/json 的接口请求；
 *   - embedded：静态资源（.js/.png 路径、image/* Content-Type、CONNECT 隧道元数据）；
 *   - 端到端：curl 走代理 → TrafficRecord 上 request_class / is_noise 已落库。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecorderProxy } from '../src/recorder/proxy.js';
import { RecordingSession } from '../src/recorder/session.js';
import { JsonFileRecordStore } from '../src/recorder/storage.js';
import { classifyRequest } from '../src/recorder/classify.js';

const TARGET_PORT = 19019;
const PROXY_PORT = 18018;
const DATA_FILE = join(tmpdir(), `api-test-classify-demo-${Date.now()}.json`);

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
  return new Promise((resolve, reject) => {
    const child = spawn('curl', ['-s', '-g', ...args]);
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve('');
      else reject(new Error(`curl 退出码 ${code}: ${stderr}`));
    });
  });
}

/** 单元级：classifyRequest 直接分级 3 类请求特征 */
function unitChecks(): void {
  console.log('--- 单元级：classifyRequest 3 类请求分级 ---');

  // 1. top_level：导航主文档（sec-fetch-dest=document）
  const nav = classifyRequest({
    method: 'GET',
    path: '/',
    request_headers: { 'sec-fetch-dest': 'document', accept: 'text/html,application/xhtml+xml' },
  });
  assert(nav.request_class === 'top_level' && nav.is_noise === false, `导航请求 → top_level 非噪音（实际 ${nav.request_class}，${nav.reason}）`);

  // 2. ajax：XHR/fetch（sec-fetch-dest=empty）
  const fetch = classifyRequest({
    method: 'GET',
    path: '/api/users',
    request_headers: { 'sec-fetch-dest': 'empty', accept: 'application/json' },
  });
  assert(fetch.request_class === 'ajax' && fetch.is_noise === false, `fetch 请求 → ajax 非噪音（实际 ${fetch.request_class}，${fetch.reason}）`);

  // 3. ajax：传统 XHR 标记
  const xhr = classifyRequest({
    method: 'POST',
    path: '/api/orders',
    request_headers: { 'x-requested-with': 'XMLHttpRequest' },
  });
  assert(xhr.request_class === 'ajax', `XHR 标记请求 → ajax（实际 ${xhr.request_class}，${xhr.reason}）`);

  // 4. embedded：静态资源扩展名
  const js = classifyRequest({
    method: 'GET',
    path: '/static/app.js',
    request_headers: { accept: '*/*' },
  });
  assert(js.request_class === 'embedded' && js.is_noise === true, `静态 .js → embedded 噪音（实际 ${js.request_class}，${js.reason}）`);

  // 5. embedded：响应 Content-Type 为图片
  const img = classifyRequest({
    method: 'GET',
    path: '/avatar',
    request_headers: { accept: '*/*' },
    response_content_type: 'image/webp',
  });
  assert(img.request_class === 'embedded' && img.is_noise === true, `image/webp 响应 → embedded 噪音（实际 ${img.request_class}，${img.reason}）`);

  // 6. embedded：CONNECT 隧道元数据
  const tunnel = classifyRequest({ method: 'CONNECT', path: '', request_headers: {} });
  assert(tunnel.request_class === 'embedded' && tunnel.is_noise === true, `CONNECT 隧道 → embedded 噪音（实际 ${tunnel.request_class}，${tunnel.reason}）`);

  // 7. 兜底：无特征按接口
  const bare = classifyRequest({ method: 'GET', path: '/api/items', request_headers: {} });
  assert(bare.request_class === 'ajax' && bare.is_noise === false, `无特征请求兜底 → ajax 非噪音（实际 ${bare.request_class}，${bare.reason}）`);
}

/** 端到端：curl 走代理 → record 上 request_class / is_noise */
async function e2eChecks(): Promise<void> {
  console.log('--- 端到端：代理录制时分级落库 ---');

  // 目标服务：按路径返回不同 Content-Type，模拟「接口 + 静态资源」混合站点
  const target = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/static/')) {
      res.writeHead(200, { 'content-type': url.endsWith('.css') ? 'text/css' : 'application/javascript' });
      res.end('body{}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, url }));
  });
  await new Promise<void>((resolve) => target.listen(TARGET_PORT, '127.0.0.1', resolve));

  const store = new JsonFileRecordStore(DATA_FILE);
  const session = new RecordingSession(store);
  const proxy = new RecorderProxy(session, { host: '127.0.0.1', port: PROXY_PORT });
  session.start();
  await proxy.start();

  const base = `http://127.0.0.1:${TARGET_PORT}`;
  const proxyArg = `http://127.0.0.1:${PROXY_PORT}`;

  // ajax：curl 显式带 json accept（curl 默认 accept 是 */*，会走兜底也判 ajax）
  await curl(['-x', proxyArg, '-H', 'accept: application/json', `${base}/api/users`]);
  // top_level：带导航头
  await curl(['-x', proxyArg, '-H', 'sec-fetch-dest: document', '-H', 'accept: text/html', `${base}/index.html`]);
  // embedded：静态资源
  await curl(['-x', proxyArg, `${base}/static/app.js`]);

  session.stop();
  await proxy.stop();
  await new Promise<void>((resolve) => target.close(() => resolve()));

  const result = session.export();
  const users = result.records.find((r) => r.path === '/api/users');
  assert(users?.request_class === 'ajax' && users?.is_noise === false, `代理记录 /api/users → request_class=ajax is_noise=false（实际 ${users?.request_class}/${users?.is_noise}）`);

  const index = result.records.find((r) => r.path === '/index.html');
  assert(index?.request_class === 'top_level' && index?.is_noise === false, `代理记录 /index.html → request_class=top_level is_noise=false（实际 ${index?.request_class}/${index?.is_noise}）`);

  const js = result.records.find((r) => r.path === '/static/app.js');
  assert(js?.request_class === 'embedded' && js?.is_noise === true, `代理记录 /static/app.js → request_class=embedded is_noise=true（实际 ${js?.request_class}/${js?.is_noise}）`);
}

async function main(): Promise<void> {
  unitChecks();
  await e2eChecks();
  console.log('---');
  console.log(failures === 0 ? 'ALL PASS：录制时分级（top_level/ajax/embedded）闭环跑通。' : `存在 ${failures} 项失败。`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
