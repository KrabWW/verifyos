/**
 * P1.3 验收单测：结构化 mock——复杂嵌套 JSON → schema 提取 → 回放生成。
 *
 * 运行：npm run test:mock-schema
 * 覆盖：
 *   - schema 提取：嵌套对象/数组/标量的类型与结构完整保留；
 *   - 动态字段：时间戳/UUID/token 命中 noise_rule，不存原值（敏感值不入 mock）；
 *   - 稳定字段：样例值保留，回放时类型一致；
 *   - 回放生成：generateMockValue 结构/类型与 schema 一致，动态字段占位；
 *   - 向后兼容：旧格式死值快照 materializeMockResponse 原样回放；
 *   - 端到端：generateMocks 产物 → materializeMockResponse → 类型校验。
 */
import {
  extractSchemaTree,
  generateMockValue,
  generateMocks,
  materializeMockResponse,
  type MockSchemaNode,
} from '../src/generator/mock.js';
import type { TrafficRecord } from '../src/types/models.js';

let failures = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

/** 深取值：按路径段数组从生成结果里取值（不存在返回 undefined） */
function pick(value: unknown, path: (string | number)[]): unknown {
  let cur: unknown = value;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function makeRecord(responseBody: string): TrafficRecord {
  const now = new Date().toISOString();
  return {
    id: 'test-record',
    api_definition_id: null,
    timestamp: now,
    method: 'GET',
    path: '/users/1',
    host: 'https://api.example.com',
    query_params: {},
    request_headers: {},
    status_code: 200,
    response_headers: { 'content-type': 'application/json' },
    response_body: responseBody,
    latency_ms: 5,
    source: 'proxy',
    noise_flag: false,
    created_at: now,
    updated_at: now,
  };
}

/** 复杂嵌套样例：对象 + 数组 + 嵌套对象数组 + 各类标量 + 动态字段 */
const COMPLEX_BODY = JSON.stringify({
  user: {
    id: 42,
    name: 'alice',
    email: 'alice@example.com',
    created_at: '2024-06-01T12:30:00.000Z',
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    api_token: 'sk-live-super-secret-value',
    score: 88.5,
    active: true,
    avatar: null,
  },
  orders: [
    {
      order_id: 1001,
      status: 'paid',
      amount: 199.99,
      paid_at: '2024-06-02T08:00:00Z',
      items: [
        { sku: 'SKU-001', quantity: 2, price: 59.99 },
        { sku: 'SKU-002', quantity: 1, price: 80.01 },
      ],
    },
  ],
  total: 1,
});

function schemaChecks(): void {
  console.log('--- schema 提取 ---');
  const schema = extractSchemaTree(JSON.parse(COMPLEX_BODY));

  // 顶层结构
  assert(schema.type === 'object', `顶层 type=object（实际 ${schema.type}）`);
  assert(
    Object.keys(schema.properties ?? {}).join(',') === 'user,orders,total',
    `顶层字段保留 user/orders/order 顺序（实际 ${Object.keys(schema.properties ?? {}).join(',')}）`,
  );

  // 嵌套对象：稳定字段类型 + 样例
  const name = pick(schema, ['properties', 'user', 'properties', 'name']) as MockSchemaNode | undefined;
  assert(name?.type === 'string' && name?.sample === 'alice', 'user.name → string + 样例值 alice');

  // 数字类型拆分：整数 vs 浮点
  const userId = pick(schema, ['properties', 'user', 'properties', 'id']) as MockSchemaNode | undefined;
  assert(userId?.type === 'integer' && userId?.dynamic === true && userId.noise_rule === 'integer_id', 'user.id → integer + dynamic(integer_id)（自增 ID 不存原值）');
  assert(userId?.sample === 42, 'user.id 动态但整数样例保留（回放仅占位用不到）');

  const score = pick(schema, ['properties', 'user', 'properties', 'score']) as MockSchemaNode | undefined;
  assert(score?.type === 'number' && score?.dynamic === undefined, 'user.score → number 非动态');

  // boolean / null
  const active = pick(schema, ['properties', 'user', 'properties', 'active']) as MockSchemaNode | undefined;
  assert(active?.type === 'boolean' && active?.sample === true, 'user.active → boolean 样例 true');
  const avatar = pick(schema, ['properties', 'user', 'properties', 'avatar']) as MockSchemaNode | undefined;
  assert(avatar?.type === 'null', 'user.avatar → null');

  // 动态字符串：不存原值
  const createdAt = pick(schema, ['properties', 'user', 'properties', 'created_at']) as MockSchemaNode | undefined;
  assert(createdAt?.type === 'string' && createdAt?.dynamic === true && createdAt.noise_rule === 'iso_timestamp', 'user.created_at → string + dynamic(iso_timestamp)');
  assert(createdAt?.sample === undefined, 'user.created_at 动态字段不保存原值');

  const uuid = pick(schema, ['properties', 'user', 'properties', 'uuid']) as MockSchemaNode | undefined;
  assert(uuid?.dynamic === true && uuid.noise_rule === 'uuid' && uuid.sample === undefined, 'user.uuid → dynamic(uuid) 原值不入 mock');

  const token = pick(schema, ['properties', 'user', 'properties', 'api_token']) as MockSchemaNode | undefined;
  assert(token?.dynamic === true && token.noise_rule === 'token_field' && token.sample === undefined, 'user.api_token → dynamic(token_field) 敏感原值不入 mock');

  // 数组：items 取首元素 schema（含二级嵌套数组）
  const orders = pick(schema, ['properties', 'orders']) as MockSchemaNode | undefined;
  assert(orders?.type === 'array', 'orders → array');
  const orderStatus = pick(orders, ['items', 'properties', 'status']) as MockSchemaNode | undefined;
  assert(orderStatus?.type === 'string' && orderStatus?.sample === 'paid', 'orders[0].status → string 样例 paid');
  const items = pick(orders, ['items', 'properties', 'items']) as MockSchemaNode | undefined;
  assert(items?.type === 'array', 'orders[0].items → array（二级数组）');
  const sku = pick(items, ['items', 'properties', 'sku']) as MockSchemaNode | undefined;
  assert(sku?.type === 'string' && sku?.sample === 'SKU-001', 'orders[0].items[0].sku → string 样例 SKU-001');
}

function replayChecks(): void {
  console.log('--- 回放生成 ---');
  const schema = extractSchemaTree(JSON.parse(COMPLEX_BODY));
  const replay = generateMockValue(schema) as Record<string, unknown>;

  // 结构一致
  assert(!!replay.user && !!replay.orders && replay.total === 1, '回放顶层结构完整（user/orders/total）');

  // 稳定字段：样例值原样复用 + 类型一致
  const user = replay.user as Record<string, unknown>;
  assert(user.name === 'alice' && typeof user.name === 'string', '回放 user.name = alice (string)');
  assert(user.score === 88.5 && typeof user.score === 'number', '回放 user.score = 88.5 (number)');
  assert(user.active === true && typeof user.active === 'boolean', '回放 user.active = true (boolean)');
  assert(user.avatar === null, '回放 user.avatar = null');

  // 动态字段：类型一致 + 占位（值不等于录制原值）
  assert(typeof user.created_at === 'string' && user.created_at === '1970-01-01T00:00:00.000Z', `回放 created_at 为 ISO 形态占位（实际 ${String(user.created_at)}）`);
  assert(user.uuid === '00000000-0000-0000-0000-000000000000', '回放 uuid 为 UUID 形态占位');
  assert(user.api_token === '<MOCK-TOKEN>', '回放 api_token 为 token 占位（真实值不出现在回放中）');
  assert(user.id === 0 && typeof user.id === 'number', '回放 user.id = 0 (number，动态整数占位)');

  // 数组：单元素 + 嵌套结构保留
  const orders = replay.orders as Record<string, unknown>[];
  assert(Array.isArray(orders) && orders.length === 1, '回放 orders 为单元素数组');
  const order = orders[0] as Record<string, unknown>;
  assert(order.status === 'paid', '回放 orders[0].status = paid（稳定值复用）');
  assert(typeof order.paid_at === 'string' && order.paid_at !== '2024-06-02T08:00:00Z', '回放 orders[0].paid_at 动态占位（非录制原值）');
  const innerItems = order.items as Record<string, unknown>[];
  assert(Array.isArray(innerItems) && innerItems.length === 1, '回放二级数组 items 单元素');
  const inner = innerItems[0] as Record<string, unknown>;
  assert(inner.sku === 'SKU-001' && inner.quantity === 2 && inner.price === 59.99, '回放 orders[0].items[0] 稳定字段复用');
}

function compatibilityChecks(): void {
  console.log('--- 向后兼容 + 端到端 ---');

  // 旧格式死值快照（A3 原样：{ status_code, body } 无 format 字段）
  const legacy = materializeMockResponse({ status_code: 201, body: { ok: true, ts: '2024-01-01T00:00:00Z' } });
  assert(legacy.status_code === 201 && JSON.stringify(legacy.body) === JSON.stringify({ ok: true, ts: '2024-01-01T00:00:00Z' }), '旧格式死值快照原样回放（不转 schema）');

  // 端到端：generateMocks → materializeMockResponse
  const record = makeRecord(COMPLEX_BODY);
  const mocks = generateMocks(record);
  assert(mocks.length >= 1, `generateMocks 产出 >= 1 条（实际 ${mocks.length}）`);

  const target = mocks.find((m) => m.kind === 'http_downstream');
  assert(!!target, '存在目标服务 http_downstream mock');
  const snap = target?.response_snapshot as Record<string, unknown>;
  assert(snap.format === 'schema' && !!snap.schema_tree, '响应快照 format=schema 且含 schema_tree');

  const materialized = materializeMockResponse(snap);
  assert(materialized.status_code === 200, `物化后 status_code = 200（实际 ${materialized.status_code}）`);
  const body = materialized.body as Record<string, unknown>;
  const u = body.user as Record<string, unknown>;
  assert(u.name === 'alice' && u.api_token === '<MOCK-TOKEN>', '物化 body：稳定字段复用 + 动态字段占位');

  // 敏感值不落 mock JSON
  const mockJson = JSON.stringify(mocks);
  assert(!mockJson.includes('sk-live-super-secret-value'), 'token 原值不出现在 mock 产物 JSON 中');
  assert(!mockJson.includes('550e8400-e29b'), 'UUID 原值不出现在 mock 产物 JSON 中');

  // 非 JSON 响应：format=raw 原文
  const rawRecord = makeRecord('plain text response');
  rawRecord.response_headers['content-type'] = 'text/plain';
  const rawMocks = generateMocks(rawRecord);
  const rawSnap = rawMocks[0]?.response_snapshot as Record<string, unknown>;
  assert(rawSnap.format === 'raw' && rawSnap.body === 'plain text response', '非 JSON 响应存原文（format=raw）');
}

function main(): void {
  schemaChecks();
  replayChecks();
  compatibilityChecks();
  console.log('---');
  console.log(failures === 0 ? 'ALL PASS：结构化 mock（schema 提取 → 回放生成 + 向后兼容）跑通。' : `存在 ${failures} 项失败。`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
