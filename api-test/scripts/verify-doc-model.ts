/**
 * P2.6 + P2.7 验收脚本。
 *
 * 运行：node node_modules/.bin/tsx scripts/verify-doc-model.ts
 * 覆盖（≥14 条断言）：
 *   - P2.6 文档结构：分组 / 简介语义 / 参数表 / 响应码 / 响应示例 / 断言摘要 /
 *     用例列表 / 空态 / 混合输入 / polishWithLlm 参数预留不炸；
 *   - P2.7 配置：预设加载 / 无配置时 ready=false / 双层合并优先级（key+model+base_url）/
 *     自定义 provider / maskKey 脱敏 / active 解析与 null 兜底 / 持久化重载一致 /
 *     对外结构不含明文 key。
 *
 * 持久化测试使用临时目录，结束后清理，不污染真实 .verifyos/。
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiDefinition, Assertion, TestCase } from '../src/types/models.js';
import { generateApiDoc, inferSummary } from '../src/docs-gen/generate.js';
import {
  maskKey,
  loadUserLayer,
  loadModelConfig,
  saveUserLayer,
  listProviders,
  getActiveLlmConfig,
} from '../src/config/model-config.js';
import { PROVIDER_PRESETS } from '../src/config/presets.js';

let failures = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

const now = new Date().toISOString();

/** 造一条 ApiDefinition */
function makeDef(over: Partial<ApiDefinition> & Pick<ApiDefinition, 'method' | 'path'>): ApiDefinition {
  return {
    id: crypto.randomUUID(),
    host: 'https://api.example.com',
    version: undefined,
    spec_source: 'openapi',
    content_type: 'application/json',
    auth_type: 'none',
    tags: [],
    scope: undefined,
    status: 'active',
    sample_count: 0,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

/** 造一条 TestCase */
function makeCase(
  apiId: string,
  over: Partial<TestCase> & Pick<TestCase, 'name' | 'request'>,
): TestCase {
  return {
    id: crypto.randomUUID(),
    api_definition_id: apiId,
    assertions: [],
    variables: {},
    source: 'recorded',
    tags: [],
    last_result: 'pending',
    review_status: 'pending',
    created_at: now,
    updated_at: now,
    ...over,
  };
}

function statusAssertion(expected: number): Assertion {
  return { type: 'status', operator: 'eq', expected };
}

function fieldAssertion(target: string, expected: unknown): Assertion {
  return { type: 'field', target, operator: 'eq', expected };
}

/** 测试数据：一个含 users / auth / orders 的 collection */
function buildCollection(): { defs: ApiDefinition[]; cases: TestCase[] } {
  const defPostUsers = makeDef({
    method: 'POST',
    path: '/users',
    tags: ['users'],
    auto_tags: ['internal'],
    request_schema: {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name: { type: 'string', description: '用户名' },
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', description: '年龄' },
      },
    },
    response_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
    },
  });
  const defGetUsers = makeDef({
    method: 'GET',
    path: '/users',
    tags: ['users'],
    auto_tags: ['internal'],
  });
  const defGetOrder = makeDef({
    method: 'GET',
    path: '/orders/:id',
    tags: ['orders'],
  });
  const defPostLogin = makeDef({
    method: 'POST',
    path: '/auth/login',
    tags: ['auth'],
    auto_tags: ['security'],
  });

  const casePostUsers1 = makeCase(defPostUsers.id, {
    name: '创建用户-正常',
    request: {
      method: 'POST',
      path: '/users',
      query_params: {},
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '张三', email: 'zhangsan@example.com', age: 28 }),
    },
    assertions: [statusAssertion(201), fieldAssertion('id', 1001), fieldAssertion('name', '张三')],
    last_result: 'pass',
  });
  const casePostUsers2 = makeCase(defPostUsers.id, {
    name: '创建用户-缺邮箱',
    request: {
      method: 'POST',
      path: '/users',
      query_params: {},
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '李四' }),
    },
    assertions: [statusAssertion(400)],
    last_result: 'fail',
  });
  const caseGetUsers = makeCase(defGetUsers.id, {
    name: '用户列表-带分页',
    request: {
      method: 'GET',
      path: '/users',
      query_params: { page: ['1'], limit: ['20'] },
      headers: {},
    },
    assertions: [statusAssertion(200)],
  });
  // 真实路径 /orders/9001 应归一到 /orders/:id 分组（与定义合并）
  const caseGetOrder = makeCase(defGetOrder.id, {
    name: '查询订单详情',
    request: {
      method: 'GET',
      path: '/orders/9001',
      query_params: {},
      headers: { 'x-request-id': 'abc-123' },
    },
    assertions: [statusAssertion(200), fieldAssertion('orderId', 'A001')],
  });
  // 登录用例：真实路径含动作段
  const casePostLogin = makeCase(defPostLogin.id, {
    name: '登录-正确密码',
    request: {
      method: 'POST',
      path: '/auth/login',
      query_params: {},
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'secret' }),
    },
    assertions: [statusAssertion(200), fieldAssertion('token', 'jwt-xyz')],
    source: 'ai',
  });

  return {
    defs: [defPostUsers, defGetUsers, defGetOrder, defPostLogin],
    cases: [casePostUsers1, casePostUsers2, caseGetUsers, caseGetOrder, casePostLogin],
  };
}

async function verifyDocs(): Promise<string> {
  const { defs, cases } = buildCollection();

  section('P2.6 文档生成');

  // 1. 空态：诚实说明
  const empty = generateApiDoc([]);
  assert(empty.includes('暂无可生成文档的内容') && empty.includes('为空'), '空 collection 输出诚实空态说明');
  assert(!empty.includes('## GET') && !empty.includes('## POST'), '空态不产出任何 API 分组');

  // 2. 混合输入 → 按 method+path 分组（4 个 API）
  const doc = generateApiDoc([...defs, ...cases]);
  assert(doc.startsWith('# API 接口文档'), '文档有中文大标题');
  assert(doc.includes('## POST /users') && doc.includes('## GET /users') && doc.includes('## GET /orders/:id') && doc.includes('## POST /auth/login'), '按 method+path 分组出 4 个 API 段');
  assert(!doc.includes('/orders/9001'), '用例真实路径 /orders/9001 归一合入 /orders/:id 分组');
  assert((doc.match(/^## (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /gm) ?? []).length === 4, `API 分组数 = 4（实际 ${(doc.match(/^## (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /gm) ?? []).length}）`);

  // 3. 简介语义：规则式一句话
  const postUsersSection = doc.split('## POST /users')[1] ?? '';
  assert(postUsersSection.includes('创建用户'), 'POST /users 简介含「创建用户」');
  assert((doc.split('## GET /users')[1] ?? '').includes('查询用户列表'), 'GET /users 简介含「查询用户列表」');
  assert((doc.split('## GET /orders/:id')[1] ?? '').includes('查询订单详情'), 'GET /orders/:id 简介含「查询订单详情」');
  assert((doc.split('## POST /auth/login')[1] ?? '').includes('登录'), 'POST /auth/login 简介命中动作词「登录」');
  assert(inferSummary('DELETE', '/users/:id') === '删除用户', 'inferSummary DELETE /users/:id → 删除用户');

  // 4. 参数表：path/query/header/body 四路来源
  assert(postUsersSection.includes('| 参数 | 位置 | 类型 | 必填 | 说明 | 示例 |'), 'POST /users 有参数表表头');
  assert(postUsersSection.includes('| name | body | string | 是 | 用户名 | 张三 |'), 'body 参数行含 schema 描述 + 用例示例值');
  assert(postUsersSection.includes('| email | body | string | 是 |') && postUsersSection.includes('zhangsan@example.com'), '必填 email 字段标记为「是」且带示例');
  assert((doc.split('## GET /users')[1] ?? '').includes('| page | query | integer | 否 |') === true, 'query 参数 page 进参数表（integer 类型推断）');
  assert((doc.split('## GET /orders/:id')[1] ?? '').includes('| id | path | string | 是 |'), 'path 参数 :id 进参数表且必填为「是」');

  // 5. 响应码 + 响应示例
  assert(postUsersSection.includes('### 响应码'), '有响应码小节');
  assert(postUsersSection.includes('| 201 |') && postUsersSection.includes('| 400 |'), '响应码表含用例断言的 201/400');
  assert(postUsersSection.includes('### 响应示例'), '有响应示例小节');
  assert(postUsersSection.includes('"email": "user@example.com"'), '响应示例从 response_schema 规则式渲染（email format 占位）');

  // 6. 断言摘要 + 用例列表
  assert(postUsersSection.includes('### 断言覆盖摘要') && postUsersSection.includes('- status：2 条') && postUsersSection.includes('- field：2 条'), '断言摘要按类型计数（status 2 / field 2）');
  assert(postUsersSection.includes('### 相关用例') && postUsersSection.includes('| 创建用户-正常 | recorded | pass |'), '相关用例列表含名称/来源/结果');
  assert((doc.split('## POST /auth/login')[1] ?? '').includes('| 登录-正确密码 | ai |'), 'AI 来源用例正确展示');

  // 7. 纯 ApiDefinition 输入（无用例）不炸，且给出「暂无用例」诚实说明
  const defOnly = generateApiDoc(defs);
  assert(defOnly.includes('## POST /users') && defOnly.includes('> 暂无用例'), '仅 API 定义时仍生成分组并标注暂无用例');

  // 8. polishWithLlm 预留参数传入不炸（本票不实现调用）
  const withLlm = generateApiDoc([...defs, ...cases], {
    title: '自定义标题',
    polishWithLlm: async () => '应不会被调用',
  });
  assert(withLlm.includes('# 自定义标题'), '自定义标题生效且 polishWithLlm 参数不报错');

  return doc;
}

function verifyConfig(): void {
  section('P2.7 模型双层配置');

  // 临时目录做持久化，结束后清理
  const dir = mkdtempSync(join(tmpdir(), 'verifyos-doc-model-'));

  // 9. 四家预设存在且字段齐全
  assert(PROVIDER_PRESETS.length >= 4, `内置预设 >= 4 家（实际 ${PROVIDER_PRESETS.length}）`);
  assert(
    ['zhipu', 'deepseek', 'openai', 'ollama'].every((id) => PROVIDER_PRESETS.some((p) => p.id === id)),
    '预设含 zhipu / deepseek / openai / ollama',
  );
  assert(PROVIDER_PRESETS.every((p) => p.base_url.startsWith('http') && p.model !== ''), '每个预设都有 base_url 与默认 model');

  // 10. 无用户配置：listProviders 仍列出全部预设，ready=false（Ollama 本地豁免）
  const initial = listProviders(dir);
  assert(initial.length === 4 && initial.every((p) => p.source === 'preset'), '无配置时 listProviders 列出 4 个预设');
  assert(
    initial.filter((p) => p.id !== 'ollama').every((p) => p.ready === false && p.has_api_key === false),
    '远程预设无 key 时 ready=false（env 兜底可列出）',
  );
  assert(initial.find((p) => p.id === 'ollama')?.ready === true, '本地 Ollama 无 key 也 ready');

  // 11. getActiveLlmConfig：未设置 active → null 不报错
  assert(getActiveLlmConfig(dir) === null, 'active 未设置时 getActiveLlmConfig 返回 null');

  // 12. maskKey 脱敏：前 4 后 4 中间打码
  assert(maskKey('sk-1234567890abcd') === 'sk-1****abcd', `maskKey 长key（实际 ${maskKey('sk-1234567890abcd')}）`);
  assert(maskKey('short') === 'sh****' && maskKey('') === '', 'maskKey 短 key 与空 key 安全处理');

  // 13. 双层合并：用户覆盖 deepseek 的 key + model → 优先级用户层胜
  saveUserLayer(
    { upsert: { deepseek: { api_key: 'sk-1234567890abcd', model: 'deepseek-reasoner' } }, active_provider_id: 'deepseek' },
    dir,
  );
  const afterKey = listProviders(dir).find((p) => p.id === 'deepseek');
  assert(afterKey?.ready === true && afterKey?.masked_api_key === 'sk-1****abcd' && afterKey?.model === 'deepseek-reasoner', '用户层覆盖 key+model：ready=true、key 脱敏、模型优先');
  assert(afterKey?.base_url === 'https://api.deepseek.com', '未覆盖的字段沿用预设 base_url');

  // 14. getActiveLlmConfig 解析 active → 返回明文 key 的连接配置
  const active = getActiveLlmConfig(dir);
  assert(
    active !== null && active.base_url === 'https://api.deepseek.com' && active.model === 'deepseek-reasoner' && active.api_key === 'sk-1234567890abcd',
    'active 解析出双层合并后的 LlmConfig（含明文 key，唯一出口）',
  );

  // 15. 对外结构不含明文 key（脱敏纪律）
  const stateJson = JSON.stringify(loadModelConfig(dir));
  assert(!stateJson.includes('sk-1234567890abcd') && stateJson.includes('sk-1****abcd'), 'loadModelConfig 序列化后无明文 key、只有掩码');

  // 16. 自定义 provider：全新 id + 自定义 base_url，source=custom
  saveUserLayer(
    { upsert: { 'my-gateway': { name: '我的网关', base_url: 'https://llm.internal:8000/v1', model: 'qwen3-32b', api_key: 'gw-1111222233334444' } } },
    dir,
  );
  const custom = listProviders(dir).find((p) => p.id === 'my-gateway');
  assert(custom?.source === 'custom' && custom?.base_url === 'https://llm.internal:8000/v1' && custom?.ready === true, '自定义 provider source=custom 且 ready=true');

  // 17. active 切到自定义 → base_url 用用户的
  saveUserLayer({ active_provider_id: 'my-gateway' }, dir);
  const activeCustom = getActiveLlmConfig(dir);
  assert(activeCustom?.base_url === 'https://llm.internal:8000/v1' && activeCustom?.model === 'qwen3-32b', 'active 指向自定义 provider 时用用户 base_url');

  // 18. active 指向不存在的 provider → null 兜底
  saveUserLayer({ active_provider_id: 'ghost' }, dir);
  assert(getActiveLlmConfig(dir) === null, 'active 指向不存在的 provider 返回 null');

  // 19. 持久化重载一致 + 文件确实落盘
  saveUserLayer({ active_provider_id: 'deepseek' }, dir);
  const file = join(dir, 'model-config.json');
  assert(existsSync(file), '配置文件已持久化到 .verifyos/model-config.json（临时目录）');
  const rawFile = readFileSync(file, 'utf-8');
  assert(rawFile.includes('sk-1234567890abcd'), '持久化文件保存明文 key（调用必需，权限 0600）');
  const reloaded = loadUserLayer(dir);
  assert(
    reloaded.active_provider_id === 'deepseek' &&
      reloaded.providers['deepseek']?.model === 'deepseek-reasoner' &&
      reloaded.providers['my-gateway']?.base_url === 'https://llm.internal:8000/v1',
    '重载与保存内容一致（双层字段级合并结果不丢）',
  );
  assert(listProviders(dir).length === 5, '合并后共 5 个 provider（4 预设 + 1 自定义）');

  // 20. remove 删除自定义 provider，且 active 联动清除
  saveUserLayer({ remove: ['my-gateway'], active_provider_id: 'my-gateway' }, dir);
  assert(listProviders(dir).length === 4 && getActiveLlmConfig(dir) === null, 'remove 删除 provider 后回到 4 个，active 联动清除为 null');

  // 清理临时目录（真实 .verifyos/ 全程未被触碰）
  rmSync(dir, { recursive: true, force: true });
  assert(!existsSync(dir), '临时目录已清理');
}

async function main(): Promise<void> {
  await verifyDocs();
  verifyConfig();
  console.log(`\n${failures === 0 ? 'ALL PASS' : `HAS FAILURES (${failures})`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
