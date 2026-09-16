/**
 * P2.2 + P2.5 验收脚本（无 LLM 配置，纯规则式全链路验证）。
 *
 * 运行：node node_modules/.bin/tsx scripts/verify-insight.ts
 *
 * 覆盖：
 *   第一节（traffic.ts）：12 条流量 → 噪音过滤/apiCount/方法与域名分布/五层建议排序
 *                        + HAR entry 输入路径 + renderInsight 中文总结；
 *   第二节（spec-diff.ts）：old/new 两版 spec → 端点增删改/参数级（改 required、改类型、
 *                        删参数）/响应级（删字段、类型变化、枚举删值）/破坏性分级计数
 *                        + reviewDiff 中文审查报告。
 */
import type { HttpMethod, TrafficRecord } from '../src/types/models.js';
import { analyzeTraffic, analyzeHar, renderInsight } from '../src/insight/traffic.js';
import { diffSpecs, reviewDiff } from '../src/insight/spec-diff.js';
import { parseOpenApiText } from '../src/inventory/openapi.js';

let failures = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

// ============================================================
// 第一节：流量 AI 洞察（analyzeTraffic / renderInsight / analyzeHar）
// ============================================================

let seq = 0;

/** 造一条 TrafficRecord（字段尽量贴近真实录制产物） */
function rec(spec: {
  method: HttpMethod;
  path: string;
  status: number;
  host?: string;
  requestClass?: 'top_level' | 'ajax' | 'embedded';
  noise?: boolean;
  referer?: string;
}): TrafficRecord {
  seq += 1;
  const now = new Date().toISOString();
  const headers: Record<string, string> = {};
  if (spec.referer !== undefined) headers.referer = spec.referer;
  return {
    id: `rec-${seq}`,
    api_definition_id: null,
    timestamp: now,
    method: spec.method,
    path: spec.path,
    host: spec.host ?? 'https://api.example.com',
    query_params: {},
    request_headers: headers,
    status_code: spec.status,
    response_headers: {},
    latency_ms: 50,
    source: 'proxy',
    request_class: spec.requestClass ?? 'ajax',
    is_noise: spec.noise ?? false,
    noise_flag: false,
    created_at: now,
    updated_at: now,
  };
}

/** 12 条流量：覆盖五层建议来源 + 噪音 + 页面文档 + 动态段归一化 + 跨域 */
const records: TrafficRecord[] = [
  rec({ method: 'POST', path: '/api/login', status: 200 }),                              // security(login)
  rec({ method: 'POST', path: '/api/pay/order', status: 200 }),                          // security(pay/order) + 写
  rec({ method: 'POST', path: '/api/pay/order', status: 200 }),
  rec({ method: 'POST', path: '/api/cart/items', status: 201 }),                          // 写操作
  rec({ method: 'GET', path: '/api/user/42/profile', status: 200 }),                      // security(user)，动态段 → :id
  rec({ method: 'GET', path: '/api/stats/summary', status: 500 }),                        // 错误响应
  rec({ method: 'GET', path: '/api/stats/summary', status: 503 }),
  rec({ method: 'GET', path: '/api/products', status: 200, referer: 'https://app.example.com/' }), // 页面依赖
  rec({ method: 'GET', path: '/api/public/health', status: 200, host: 'https://status.partner.io' }), // 其余 + 跨域
  rec({ method: 'GET', path: '/index.html', status: 200, requestClass: 'top_level' }),    // 页面文档，不计 API
  rec({ method: 'GET', path: '/static/app.js', status: 200, requestClass: 'embedded', noise: true }), // 噪音
  rec({ method: 'GET', path: '/logo.png', status: 200, requestClass: 'embedded', noise: true }),      // 噪音
];

console.log('== 第一节：流量 AI 洞察 ==');
const insight = analyzeTraffic(records);

assert(insight.apiCount === 7, `apiCount = 7（去重 7 个 API，页面文档与噪音不计，实际 ${insight.apiCount}）`);
assert(insight.noiseCount === 2, `noiseCount = 2（实际 ${insight.noiseCount}）`);

const getStat = insight.methodDistribution.find((m) => m.method === 'GET');
const postStat = insight.methodDistribution.find((m) => m.method === 'POST');
assert(getStat?.count === 6 && postStat?.count === 4, `方法分布 GET=6 / POST=4（实际 GET=${getStat?.count} POST=${postStat?.count}）`);

assert(
  insight.domainDistribution.length === 2 &&
    insight.domainDistribution[0].domain === 'api.example.com' &&
    insight.domainDistribution[0].count === 9,
  `域名分布 top 为 api.example.com x 9（实际 ${JSON.stringify(insight.domainDistribution)}）`,
);

// 建议优先级：security > 写操作 > 错误响应 > 页面依赖 > 其余，恰好五层
assert(insight.suggestions.length === 5, `建议清单恰好 5 层（实际 ${insight.suggestions.length}）`);
assert(
  insight.suggestions[0]?.includes('security') && insight.suggestions[0]?.includes('/api/login') && insight.suggestions[0]?.includes('/api/user/:id/profile'),
  `第 1 层为 security 标注（含 login / user/:id/profile）：${insight.suggestions[0]}`,
);
assert(insight.suggestions[1]?.includes('/api/cart/items'), `第 2 层为写操作（cart/items）：${insight.suggestions[1]}`);
assert(insight.suggestions[2]?.includes('/api/stats/summary') && insight.suggestions[2]?.includes('500'), `第 3 层为错误响应（stats/summary 含 500）：${insight.suggestions[2]}`);
assert(insight.suggestions[3]?.includes('/api/products'), `第 4 层为页面依赖（products）：${insight.suggestions[3]}`);
assert(insight.suggestions[4]?.includes('/api/public/health'), `第 5 层为其余（public/health）：${insight.suggestions[4]}`);

const rendered = renderInsight(insight);
assert(rendered.includes('7 个 API') && rendered.includes('噪音流量 2 条'), 'renderInsight 总结含 apiCount 与噪音提示');
console.log('--- renderInsight 输出预览 ---');
console.log(rendered);
console.log('--- 预览结束 ---');

// HAR 输入路径：标准 HAR entry（分级复用 classifyRequest 启发式）
const harInsight = analyzeHar({
  log: {
    entries: [
      { request: { method: 'GET', url: 'https://api.example.com/api/products', headers: [{ name: 'accept', value: 'application/json' }] }, response: { status: 200, headers: [{ name: 'content-type', value: 'application/json' }] } },
      { request: { method: 'GET', url: 'https://api.example.com/static/app.js', headers: [] }, response: { status: 200, headers: [{ name: 'content-type', value: 'application/javascript' }] } },
      { request: { method: 'GET', url: 'https://api.example.com/', headers: [{ name: 'sec-fetch-dest', value: 'document' }] }, response: { status: 200, headers: [{ name: 'content-type', value: 'text/html' }] } },
    ],
  },
});
assert(harInsight.apiCount === 1 && harInsight.noiseCount === 1, `HAR 输入路径：apiCount=1 / noiseCount=1（实际 ${harInsight.apiCount}/${harInsight.noiseCount}）`);

// ============================================================
// 第二节：Spec Diff AI 审查（diffSpecs / reviewDiff）
// ============================================================

/** 旧版 spec v1.0：6 个端点 */
const SPEC_OLD_YAML = `
openapi: 3.0.3
info: { title: 订单服务, version: 1.0.0 }
servers: [{ url: 'https://api.example.com/v1' }]
paths:
  /users:
    get:
      operationId: listUsers
      summary: 用户列表
      parameters:
        - { name: page, in: query, required: false, schema: { type: integer } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: string }
                  role: { type: string, enum: [admin, member, guest] }
    post:
      operationId: createUser
      summary: 创建用户
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name: { type: string }
                email: { type: string }
              required: [name]
      responses:
        '201': { description: created }
        '400': { description: bad request }
  /users/{id}:
    put:
      operationId: updateUser
      summary: 更新用户
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: verbose, in: query, required: false, schema: { type: boolean } }
      responses:
        '200': { description: ok }
  /orders/{id}:
    get:
      operationId: getOrder
      summary: 订单详情
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  orderId: { type: string }
                  amount: { type: number }
  /health:
    get:
      operationId: health
      summary: 健康检查
      parameters:
        - { name: detailed, in: query, required: false, schema: { type: string } }
        - { name: token, in: query, required: false, schema: { type: string } }
      responses:
        '200': { description: ok }
  /sessions/{id}:
    delete:
      operationId: deleteSession
      summary: 删除会话
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '204': { description: deleted }
`;

/** 新版 spec v2.0：POST /users email 转 required；GET /users 枚举删值+加可选字段；
 * PUT verbose 转必填；GET /orders/:id 响应删字段+改类型；GET /health 删参数+改类型；
 * 删除 DELETE /sessions/:id；新增 GET /sessions。 */
const SPEC_NEW_YAML = `
openapi: 3.0.3
info: { title: 订单服务, version: 2.0.0 }
servers: [{ url: 'https://api.example.com/v1' }]
paths:
  /users:
    get:
      operationId: listUsers
      summary: 用户列表
      parameters:
        - { name: page, in: query, required: false, schema: { type: integer } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: string }
                  role: { type: string, enum: [admin, member] }
                  nickname: { type: string }
    post:
      operationId: createUser
      summary: 创建用户
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name: { type: string }
                email: { type: string }
                phone: { type: string }
              required: [name, email]
      responses:
        '201': { description: created }
        '400': { description: bad request }
  /users/{id}:
    put:
      operationId: updateUser
      summary: 更新用户
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: verbose, in: query, required: true, schema: { type: boolean } }
      responses:
        '200': { description: ok }
  /orders/{id}:
    get:
      operationId: getOrder
      summary: 订单详情
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  orderId: { type: integer }
  /health:
    get:
      operationId: health
      summary: 健康检查
      parameters:
        - { name: detailed, in: query, required: false, schema: { type: integer } }
      responses:
        '200': { description: ok }
  /sessions:
    get:
      operationId: listSessions
      summary: 会话列表
      responses:
        '200': { description: ok }
`;

console.log('\n== 第二节：Spec Diff AI 审查 ==');
const oldDoc = parseOpenApiText(SPEC_OLD_YAML);
const newDoc = parseOpenApiText(SPEC_NEW_YAML);
const diff = diffSpecs(oldDoc.operations, newDoc.operations);

const findEp = (method: string, path: string) => diff.endpoints.find((e) => e.method === method && e.path === path);

// 端点级：增 / 删 / 改 全部检出
assert(diff.endpoints.length === 7, `变更端点共 7 个（实际 ${diff.endpoints.length}）`);
assert(findEp('GET', '/sessions')?.kind === 'added' && findEp('GET', '/sessions')?.severity === 'info', '新增端点 GET /sessions → info');
assert(findEp('DELETE', '/sessions/:id')?.kind === 'removed' && findEp('DELETE', '/sessions/:id')?.severity === 'breaking', '删除端点 DELETE /sessions/:id → breaking');

// 参数级：改 required / 改类型 / 删参数
const putEp = findEp('PUT', '/users/:id');
assert(
  putEp?.changes.some((c) => c.scope === 'parameter' && c.severity === 'breaking' && c.detail.includes('verbose') && c.detail.includes('required')),
  `PUT verbose: optional → required → breaking（实际 ${JSON.stringify(putEp?.changes)}）`,
);
const healthEp = findEp('GET', '/health');
assert(
  healthEp?.changes.some((c) => c.severity === 'breaking' && c.detail.includes('detailed') && c.detail.includes('string → integer')),
  'GET /health 参数 detailed 类型 string → integer → breaking',
);
assert(healthEp?.changes.some((c) => c.severity === 'breaking' && c.detail.includes('token') && c.detail.includes('移除')), 'GET /health 参数 token 被移除 → breaking');

// 响应级：删字段 / 类型变化 / 枚举删值 / 加可选字段
const orderEp = findEp('GET', '/orders/:id');
assert(orderEp?.changes.some((c) => c.severity === 'breaking' && c.detail.includes('orderId') && c.detail.includes('string → integer')), 'GET /orders/:id 响应字段 orderId 类型变化 → breaking');
assert(orderEp?.changes.some((c) => c.severity === 'breaking' && c.detail.includes('amount') && c.detail.includes('移除')), 'GET /orders/:id 响应字段 amount 被移除 → breaking');
const usersGetEp = findEp('GET', '/users');
assert(usersGetEp?.changes.some((c) => c.severity === 'warning' && c.detail.includes('guest')), 'GET /users role 枚举删除值 guest → warning');
assert(usersGetEp?.severity === 'warning', `GET /users 端点级 severity = warning（实际 ${usersGetEp?.severity}）`);
assert(usersGetEp?.changes.some((c) => c.severity === 'info' && c.detail.includes('nickname')), 'GET /users 新增可选响应字段 nickname → info');

// 请求体字段级：optional → required / 加可选字段
const usersPostEp = findEp('POST', '/users');
assert(
  usersPostEp?.changes.some((c) => c.severity === 'breaking' && c.detail.includes('email') && c.detail.includes('required')),
  'POST /users 请求体 email: optional → required → breaking',
);
assert(usersPostEp?.changes.some((c) => c.severity === 'info' && c.detail.includes('phone')), 'POST /users 新增可选请求字段 phone → info');

// 计数与排序
assert(
  diff.counts.breaking === 7 && diff.counts.warning === 1 && diff.counts.info === 3,
  `变化点计数 breaking=7 / warning=1 / info=3（实际 ${diff.counts.breaking}/${diff.counts.warning}/${diff.counts.info}）`,
);
assert(diff.endpoints[0]?.severity === 'breaking', '端点清单 breaking 优先排序');

// 中文审查报告
const review = reviewDiff(diff);
assert(review.includes('共 11 处变更') && review.includes('破坏性 7 处'), `审查报告含变更计数（实际首行：${review.split('\n')[0]}）`);
assert(review.includes('建议更新用例') && review.includes('需要修复并重跑'), '审查报告含用例更新建议（breaking 需修复重跑）');
assert(review.includes('email'), '审查报告明细列出 email 变更');
console.log('--- reviewDiff 输出预览 ---');
console.log(review);
console.log('--- 预览结束 ---');

// ============================================================
console.log('\n---');
console.log(failures === 0 ? 'ALL PASS：P2.2 流量洞察 + P2.5 Spec Diff 审查 全部通过。' : `存在 ${failures} 项失败。`);
process.exit(failures === 0 ? 0 : 1);
