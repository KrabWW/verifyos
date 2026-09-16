/**
 * A4 可跑验证 demo：
 * 1. 喂一个假 OpenAPI spec（5 个 operation）→ 生成清单（浏览/搜索/标注）；
 * 2. 录制流量聚合 → 生成清单；
 * 3. 再喂一个改过的 spec → 漂移检测标出增/删/改；
 * 4. 断言结果，全部通过则退出码 0，否则非 0。
 *
 * 运行：npm run demo:inventory（或 tsx src/inventory/demo.ts）。
 */
import type { TrafficRecord } from '../types/models.js';
import { aggregateTraffic } from './traffic.js';
import { detectDrift } from './drift.js';
import { operationsToDefinitions } from './convert.js';
import { parseOpenApiText } from './openapi.js';
import { InventoryStore } from './store.js';
import { classifyByRules, classifyDefinitions, classifyWithLLM } from './classify.js';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    failures++;
    console.error(`  FAIL  ${message}`);
  }
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

/** 假 spec A（YAML）：5 个 operation */
const SPEC_A_YAML = `
openapi: 3.0.3
info:
  title: 用户服务
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
paths:
  /users:
    get:
      operationId: listUsers
      summary: 用户列表
      tags: [users]
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: array
    post:
      operationId: createUser
      summary: 创建用户
      tags: [users]
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        '201':
          description: created
        '400':
          description: bad request
  /users/{id}:
    get:
      operationId: getUser
      summary: 用户详情
      tags: [users]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: ok
    put:
      operationId: updateUser
      summary: 更新用户
      tags: [users]
      responses:
        '200':
          description: ok
    delete:
      operationId: deleteUser
      summary: 删除用户
      tags: [users]
      responses:
        '204':
          description: no content
`;

/** 假 spec B（JSON）：删除 DELETE /users/{id}，新增 GET /users/{id}/posts，修改 GET /users/{id}（加参数 + 404） */
const SPEC_B = {
  openapi: '3.0.3',
  info: { title: '用户服务', version: '1.1.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: '用户列表',
        tags: ['users'],
        parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array' } } } },
        },
      },
      post: {
        operationId: 'createUser',
        summary: '创建用户',
        tags: ['users'],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'created' }, '400': { description: 'bad request' } },
      },
    },
    '/users/{id}': {
      get: {
        operationId: 'getUser',
        summary: '用户详情',
        tags: ['users'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'include', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'ok' }, '404': { description: 'not found' } },
      },
      put: {
        operationId: 'updateUser',
        summary: '更新用户',
        tags: ['users'],
        responses: { '200': { description: 'ok' } },
      },
    },
    '/users/{id}/posts': {
      get: {
        operationId: 'listUserPosts',
        summary: '用户文章列表',
        tags: ['posts'],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};

async function main(): Promise<void> {
  section('1. OpenAPI spec（YAML）导入 → 生成清单');
  const docA = parseOpenApiText(SPEC_A_YAML);
  assert(docA.operations.length === 5, `解析出 5 个 operation（实际 ${docA.operations.length}）`);
  assert(docA.title === '用户服务', `info.title 正确（${docA.title}）`);
  assert(docA.servers[0] === 'https://api.example.com/v1', `servers[0] 正确（${docA.servers[0]}）`);

  const defsA = operationsToDefinitions(docA);
  const store = new InventoryStore(defsA);
  assert(store.size === 5, `inventory 有 5 条 api_definition（实际 ${store.size}）`);

  const getUser = store.getByKey('GET', '/users/:id');
  assert(getUser !== undefined, '路径 `{id}` 已规范化为 `/users/:id`');
  assert(getUser?.path === '/users/:id', `GET /users/:id 路径正确（${getUser?.path}）`);
  assert(getUser?.spec_source === 'openapi', 'spec_source=openapi');

  section('2. 浏览 / 搜索 / 标注');
  if (getUser) {
    store.annotate(getUser.id, { scope: 'internal', status: 'deprecated' });
  }
  const deprecated = store.search('deprecated');
  assert(deprecated.length === 1, `搜索 deprecated 命中 1 条（实际 ${deprecated.length}）`);
  const internal = store.search('internal');
  assert(internal.length === 1, `搜索 internal 命中 1 条（实际 ${internal.length}）`);
  const getUsers = store.getByKey('GET', '/users');
  assert(getUsers !== undefined && getUsers.status === 'active' && getUsers.scope === undefined, '未标注 API 保持 active/无 scope');

  section('3. 录制流量聚合');
  const records: TrafficRecord[] = [
    makeRecord('GET', '/users/123', 200, 'application/json'),
    makeRecord('GET', '/users/456', 200, 'application/json'),
    makeRecord('POST', '/users', 201, 'application/json'),
    makeRecord('GET', '/users/3f5f3c00-0000-0000-0000-000000000001', 200, 'application/json'),
  ];
  const trafficDefs = aggregateTraffic(records);
  // 4 条流量 → 2 个 API：GET /users/:id（123/456/UUID 三段聚合）+ POST /users
  assert(trafficDefs.length === 2, `流量聚合出 2 个 API（实际 ${trafficDefs.length}）`);
  const aggGetUser = trafficDefs.find((d) => d.method === 'GET' && d.path === '/users/:id');
  assert(aggGetUser !== undefined, '`/users/123`、`/users/456`、UUID 段聚合为 `GET /users/:id`');
  assert(aggGetUser?.sample_count === 3, `GET /users/:id 样本数=3（实际 ${aggGetUser?.sample_count}）`);
  const aggPostUsers = trafficDefs.find((d) => d.method === 'POST' && d.path === '/users');
  assert(aggPostUsers?.sample_count === 1, `POST /users 样本数=1（实际 ${aggPostUsers?.sample_count}）`);

  section('4. spec 漂移检测');
  const docB = parseOpenApiText(JSON.stringify(SPEC_B));
  const report = detectDrift(docA.operations, docB.operations);
  assert(report.added.length === 1 && report.added[0]?.method === 'GET' && report.added[0]?.normalized_path === '/users/:id/posts', '新增：GET /users/:id/posts');
  assert(report.removed.length === 1 && report.removed[0]?.method === 'DELETE' && report.removed[0]?.normalized_path === '/users/:id', '删除：DELETE /users/:id');
  assert(report.changed.length === 1, `修改：1 个 operation 变化（实际 ${report.changed.length}）`);
  if (report.changed[0]) {
    const ch = report.changed[0];
    assert(ch.operation.normalized_path === '/users/:id', `修改项为 GET /users/:id（实际 ${ch.operation.normalized_path}）`);
    assert(ch.changed_fields.includes('parameters') && ch.changed_fields.includes('responses'), `变化字段含 parameters/responses（实际 [${ch.changed_fields.join(',')}]）`);
  }
  assert(report.unchanged_count === 3, `未变化 3 个（实际 ${report.unchanged_count}）`);

  section('5. P1.4 自动分类（规则式 auto_tags）');
  // 造含 login / pay / public / 外域 / deprecated 的 spec → 断言自动分类正确
  const SPEC_C = `
openapi: 3.0.3
info: { title: C, version: 1.0.0 }
servers:
  - url: https://api.example.com/v1
paths:
  /auth/login:
    post:
      operationId: login
      responses: { '200': { description: ok } }
  /payment/pay:
    post:
      operationId: pay
      responses: { '200': { description: ok } }
  /public/health:
    get:
      operationId: health
      responses: { '200': { description: ok } }
  /internal/jobs:
    get:
      operationId: jobs
      deprecated: true
      responses: { '200': { description: ok } }
  /reports/export:
    get:
      operationId: export
      responses: { '200': { description: ok } }
`;
  const docC = parseOpenApiText(SPEC_C);
  const defsC = operationsToDefinitions(docC);
  const tagged = classifyDefinitions(defsC);
  const byOp = (opId: string) => tagged.find((d) => d.path.includes(opId) || d.path.includes(opId));
  const login = tagged.find((d) => d.path === '/auth/login');
  const pay = tagged.find((d) => d.path === '/payment/pay');
  const health = tagged.find((d) => d.path === '/public/health');
  const jobs = tagged.find((d) => d.path === '/internal/jobs');
  const reportApi = tagged.find((d) => d.path === '/reports/export');
  assert(login?.auto_tags?.includes('security') === true, `/auth/login 自动标注 security（实际 [${login?.auto_tags ?? []}]）`);
  assert(pay?.auto_tags?.includes('security') === true, `/payment/pay 自动标注 security（实际 [${pay?.auto_tags ?? []}]）`);
  assert(health?.auto_tags?.includes('external') === true, `/public/health 自动标注 external（实际 [${health?.auto_tags ?? []}]）`);
  assert(jobs?.status === 'deprecated' && jobs.auto_tags?.includes('deprecated') === true, `/internal/jobs spec 标 deprecated → status+auto_tags（实际 ${jobs?.status} [${jobs?.auto_tags ?? []}]）`);
  assert(reportApi?.auto_tags?.join(',') === 'internal', `/reports/export 无命中 → 默认 internal（实际 [${reportApi?.auto_tags ?? []}]）`);
  assert(byOp('nonexistent') === undefined, '未知 path 不产生条目');
  assert(tagged.every((d) => Array.isArray(d.auto_tags) && d.auto_tags.length > 0), '所有 API 都有 auto_tags');

  section('6. P1.4 store.autoAnnotate + LLM 接口预留');
  const storeC = new InventoryStore(defsC);
  const annotated = storeC.autoAnnotate();
  assert(annotated.length === 5, `autoAnnotate 覆盖 5 条（实际 ${annotated.length}）`);
  assert(storeC.getByKey('POST', '/auth/login')?.auto_tags?.includes('security') === true, 'store 内条目已带上 auto_tags');
  // 人工 annotate 不覆盖 auto_tags（互补语义）
  const manual = storeC.getByKey('GET', '/reports/export');
  if (manual) storeC.annotate(manual.id, { scope: 'internal' });
  assert(storeC.getByKey('GET', '/reports/export')?.scope === 'internal', '人工 annotate 正常生效');
  assert(storeC.getByKey('GET', '/reports/export')?.auto_tags?.includes('internal') === true, '人工 annotate 不清掉 auto_tags');

  // 单条规则分类 + 外域判定
  const foreign = classifyByRules(
    { ...defsC[0]!, id: 'x', host: 'https://partner.other-site.com', path: '/x', auth_type: 'none', status: 'active' },
    { baseHost: 'https://api.example.com' },
  );
  assert(foreign.includes('external'), `外域 host 自动标注 external（实际 [${foreign}]）`);

  // LLM 接口：不传 llm 退回规则；传了则覆盖（模拟 LLM 返回）
  const noLlm = await classifyWithLLM(defsC);
  assert(noLlm.every((d, i) => (d.auto_tags ?? []).join(',') === (tagged[i]?.auto_tags ?? []).join(',')), '无 llm 时 classifyWithLLM 与规则式一致');
  const llmResult = await classifyWithLLM(defsC, async () =>
    JSON.stringify([{ id: defsC[0]!.id, tags: ['security', 'external'] }]),
  );
  assert(
    (llmResult[0]?.auto_tags ?? []).join(',') === 'security,external',
    `LLM 返回覆盖第一条 auto_tags（实际 [${llmResult[0]?.auto_tags ?? []}]）`,
  );
  assert(
    llmResult.slice(1).every((d, i) => (d.auto_tags ?? []).join(',') === (tagged.slice(1)[i]?.auto_tags ?? []).join(',')),
    'LLM 未覆盖的条目保持规则式结果',
  );
  const llmBroken = await classifyWithLLM(defsC, async () => 'not-json');
  assert(llmBroken.every((d, i) => (d.auto_tags ?? []).join(',') === (tagged[i]?.auto_tags ?? []).join(',')), 'LLM 输出不合法时退回规则式');

  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();

function makeRecord(method: TrafficRecord['method'], path: string, status: number, contentType: string): TrafficRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    api_definition_id: null,
    timestamp: now,
    method,
    path,
    host: 'https://api.example.com',
    query_params: {},
    request_headers: method === 'POST' ? { 'content-type': contentType } : {},
    request_body: method === 'POST' ? '{"name":"x"}' : undefined,
    status_code: status,
    response_headers: { 'content-type': contentType },
    response_body: '{}',
    latency_ms: 12,
    source: 'proxy',
    trace_id: undefined,
    noise_flag: false,
    created_at: now,
    updated_at: now,
  };
}
