/**
 * A3 验收自验证脚本：真跑通「起代理 → curl 走代理发含噪音流量的请求 → 导出 → 生成测试用例 → 断言」。
 *
 * 运行：npm run verify:record-to-test
 * 覆盖：
 *   - 录制 → 用例生成（每个 API 一组 happy-path）；
 *   - 噪音检测：时间戳（ISO8601/数字）/ 随机 ID（UUID/长hex/自增）/ token（header/body）标为「忽略」；
 *   - 非噪音字段严格相等断言；
 *   - token 类 header/body 脱敏；
 *   - 依赖 mock 生成。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecorderProxy } from '../src/recorder/proxy.js';
import { RecordingSession } from '../src/recorder/session.js';
import { JsonFileRecordStore } from '../src/recorder/storage.js';
import { convertSessionToCases } from '../src/generator/convert.js';
import type { GeneratedTestCase } from '../src/generator/types.js';

const TARGET_PORT = 29009;
const PROXY_PORT = 28008;
const DATA_FILE = join(tmpdir(), `api-test-gen-verify-${Date.now()}.json`);

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

/** 按 target 查找断言 */
function findAssertion(c: GeneratedTestCase, target: string) {
  return c.test_case.assertions.find((a) => a.target === target);
}

/** 目标服务：/users/* 返回含噪音字段的 JSON，其余回显 body */
function createTargetServer() {
  return createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      const body = Buffer.concat(chunks).toString('utf-8');
      if ((req.url ?? '').startsWith('/users')) {
        res.end(
          JSON.stringify({
            id: 42,
            name: 'alice',
            created_at: '2024-01-01T12:00:00.000Z',
            request_id: '550e8400-e29b-41d4-a716-446655440000',
            trace_id: 'a1b2c3d4e5f6a7b8c9d0e1f2',
            access_token: 'sk-live-abc123def456ghi789',
            score: 88,
            nested: { count: 1, updated_at: '2024-01-01T00:00:00Z' },
          }),
        );
      } else {
        res.end(JSON.stringify({ ok: true, received: body || null }));
      }
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

  const base = `http://127.0.0.1:${TARGET_PORT}`;
  const proxyArg = `http://127.0.0.1:${PROXY_PORT}`;

  await curl(['-x', proxyArg, '-H', 'Authorization: Bearer secret-token-123', `${base}/users/1`]);
  await curl([
    '-x', proxyArg, '-X', 'POST',
    '-d', '{"token":"sk-request-xyz","amount":99}',
    '-H', 'Content-Type: application/json',
    '-H', 'Authorization: Bearer secret-token-123',
    `${base}/orders`,
  ]);

  session.stop();
  await proxy.stop();
  await new Promise<void>((resolve) => target.close(() => resolve()));

  const exported = session.export();
  const result = convertSessionToCases(exported);

  console.log('--- 录制 → 测试用例生成断言 ---');
  assert(result.summary.total_cases === 2, `生成用例数 = 2（实际 ${result.summary.total_cases}）`);

  const users = result.cases.find((c) => c.test_case.name.startsWith('GET /users/1'));
  const orders = result.cases.find((c) => c.test_case.name.startsWith('POST /orders'));
  assert(!!users, '存在用例 GET /users/1');
  assert(!!orders, '存在用例 POST /orders');

  if (users) {
    const tc = users.test_case;

    // status 断言
    const statusAssertion = tc.assertions.find((a) => a.type === 'status');
    assert(statusAssertion?.operator === 'eq' && statusAssertion.expected === 200, 'status 断言 = 200 严格相等');

    // 噪音字段标 ignore
    assert(findAssertion(users, '$.created_at')?.mode === 'ignore', 'created_at(ISO 时间戳) 标为 ignore');
    assert(findAssertion(users, '$.id')?.mode === 'ignore', 'id(自增整数) 标为 ignore');
    assert(findAssertion(users, '$.request_id')?.mode === 'ignore', 'request_id(UUID) 标为 ignore');
    assert(findAssertion(users, '$.trace_id')?.mode === 'ignore', 'trace_id(长 hex) 标为 ignore');
    assert(findAssertion(users, '$.access_token')?.mode === 'ignore', 'access_token(token 字段) 标为 ignore');
    assert(findAssertion(users, '$.nested.updated_at')?.mode === 'ignore', 'nested.updated_at 标为 ignore');

    // 非噪音字段严格相等
    const name = findAssertion(users, '$.name');
    assert(name?.mode !== 'ignore' && name?.operator === 'eq' && name?.expected === 'alice', 'name 非噪音严格相等 = alice');
    const score = findAssertion(users, '$.score');
    assert(score?.operator === 'eq' && score?.expected === 88, 'score 非噪音严格相等 = 88');
    const count = findAssertion(users, '$.nested.count');
    assert(count?.operator === 'eq' && count?.expected === 1, 'nested.count 非噪音严格相等 = 1');

    // 忽略断言用 exists 操作符（仅断言存在性）
    assert(findAssertion(users, '$.created_at')?.operator === 'exists', 'ignore 字段使用 exists 操作符');

    // 请求头 token 脱敏
    assert(tc.request.headers['authorization'] === '<REDACTED>', '请求头 authorization 已脱敏');

    // schema 摘要存在
    assert(tc.assertions.some((a) => a.type === 'schema'), '生成响应体 schema 摘要断言');

    // mock 生成
    assert(users.mocks.length >= 1, `GET /users/1 生成依赖 mock >= 1（实际 ${users.mocks.length}）`);
  }

  if (orders) {
    // 请求体 token 字段脱敏
    const body = orders.test_case.request.body ?? '';
    assert(body.includes('<REDACTED>') && !body.includes('sk-request-xyz'), 'POST 请求体 token 字段已脱敏');
    const tokenFinding = orders.noise_findings.find((f) => f.location === 'request_body' && f.rule === 'token_field');
    assert(!!tokenFinding, 'POST 请求体 token 字段命中噪音明细(request_body/token_field)');
    assert(orders.mocks.length >= 1, `POST /orders 生成依赖 mock >= 1（实际 ${orders.mocks.length}）`);
  }

  // 汇总：噪音命中 > 0
  assert(result.summary.total_noise_ignored > 0, `噪音字段忽略总数 > 0（实际 ${result.summary.total_noise_ignored}）`);
  assert(result.summary.total_mocks >= 2, `依赖 mock 总数 >= 2（实际 ${result.summary.total_mocks}）`);

  console.log('---');
  console.log(failures === 0 ? 'ALL PASS：录制 → 用例生成（噪音检测命中）闭环跑通。' : `存在 ${failures} 项失败。`);
  console.log(`会话 ${result.session_id}，生成时间 ${result.generated_at}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
