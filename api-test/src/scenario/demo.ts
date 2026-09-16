/**
 * A8 可跑验证 demo（P1.6 扩展条件/循环/CSV 数据驱动）：
 * 1. 构建 2 接口场景（登录拿 token → 用 token + tenant 查列表），内存 mock 执行器跑通；
 * 2. 验证「前置提取变量传递」：登录响应 $.data.token 提取为 {{token}}，列表接口 Authorization 引用；
 * 3. 验证「环境变量复用/切换」：dev/prod 两个环境（不同 baseURL + tenant）跑同一场景；
 * 4. 验证「接口报告」：每接口 pass/fail + 断言明细 + 耗时，可导出 md/json/junit；
 * 5. 负例：故意写错断言 → 报告失败，验证 pass/fail 判定真实有效；
 * 6. P1.6 条件步骤：余额不足 → 走 else 分支（充值接口），验证 branch 信息与作用域；
 * 7. P1.6 forEach 循环：遍历列表接口返回的 3 个用户逐个查详情，验证循环变量作用域；
 * 8. P1.6 CSV 数据驱动：2 行数据逐行迭代创建用户，验证 {{dataset.users.username}} 引用。
 *
 * 运行：npm run demo:scenario（或 tsx src/scenario/demo.ts）。
 */
import { randomUUID } from 'node:crypto';
import type { Assertion, HttpMethod, TestCase } from '../types/models.js';
import { ScenarioRunner } from './engine.js';
import { MockTransport } from './mock.js';
import type { HttpResponse } from './transport.js';
import { reportToJson, reportToJunit, reportToMarkdown } from './report.js';
import type { Environment, Scenario, StepOutcome } from './types.js';

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

/** 构造一个最小 TestCase（复用 A3 的用例模型） */
function makeTestCase(partial: {
  name: string;
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  assertions: Assertion[];
}): TestCase {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    api_definition_id: '',
    name: partial.name,
    description: 'A8 场景编排演示用例',
    request: {
      method: partial.method,
      path: partial.path,
      query_params: {},
      headers: partial.headers ?? {},
      body: partial.body,
    },
    assertions: partial.assertions,
    variables: {},
    source: 'manual',
    tags: ['scenario'],
    last_result: 'pending',
    review_status: 'approved',
    created_at: now,
    updated_at: now,
  };
}

/** 构建「登录 → 查列表」场景：登录提取 token，列表引用 {{token}} + 环境变量 {{tenant}} */
function buildLoginListScenario(): Scenario {
  return {
    id: randomUUID(),
    name: '登录 → 查询用户列表',
    description: '登录拿 token → 用 token + tenant 查列表（变量传递 + 环境变量复用）',
    steps: [
      {
        test_case: makeTestCase({
          name: '登录获取 token',
          method: 'POST',
          path: '/login',
          body: '{"username":"alice","password":"secret"}',
          assertions: [
            { type: 'status', operator: 'eq', expected: 200 },
            { type: 'jsonpath', target: '$.code', operator: 'eq', expected: 0 },
          ],
        }),
        extract: [{ name: 'token', jsonpath: '$.data.token' }],
      },
      {
        test_case: makeTestCase({
          name: '查询用户列表（Authorization + X-Tenant）',
          method: 'GET',
          path: '/users',
          headers: { authorization: 'Bearer {{token}}', 'x-tenant': '{{tenant}}' },
          assertions: [
            { type: 'status', operator: 'eq', expected: 200 },
            { type: 'jsonpath', target: '$.data[0].name', operator: 'eq', expected: 'alice' },
          ],
        }),
      },
    ],
  };
}

/**
 * 构建有状态 mock：登录签发 token，列表接口校验「Authorization 必须带该 token」
 * 且「X-Tenant 必须等于环境注入的 tenant」。若变量传递失败，列表会返回 401/400。
 */
function buildTransportFor(tenant: string) {
  let token = '';
  let receivedAuth = '';
  let receivedTenant = '';

  const transport = new MockTransport();

  transport.on('POST', '/login', () => {
    token = `mock-jwt-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    return {
      status_code: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 0, message: 'ok', data: { token, user: { id: 1, name: 'alice' } } }),
    };
  });

  transport.on('GET', '/users', (req): HttpResponse => {
    receivedAuth = req.headers['authorization'] ?? '';
    receivedTenant = req.headers['x-tenant'] ?? '';
    if (receivedAuth !== `Bearer ${token}`) {
      return { status_code: 401, headers: {}, body: JSON.stringify({ code: 401, message: 'unauthorized' }) };
    }
    if (receivedTenant !== tenant) {
      return { status_code: 400, headers: {}, body: JSON.stringify({ code: 400, message: 'bad tenant' }) };
    }
    return {
      status_code: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 0, data: [{ id: 1, name: 'alice' }, { id: 2, name: 'bob' }] }),
    };
  });

  return {
    transport,
    issuedToken: () => token,
    receivedAuth: () => receivedAuth,
    receivedTenant: () => receivedTenant,
  };
}

/** P1.6 条件场景 mock：余额 90（< 价格 199），充值 +200 到 290，验证分支与作用域 */
function buildPaymentTransport() {
  let orderCalls = 0;
  let rechargeCalls = 0;
  let lastRechargedBalance = '';

  const transport = new MockTransport();

  transport.on('GET', '/balance', () => ({
    status_code: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 0, data: { balance: 90, price: 199 } }),
  }));

  transport.on('POST', '/order', () => {
    orderCalls++;
    return { status_code: 200, headers: {}, body: JSON.stringify({ code: 0, data: { order_id: 'o-1' } }) };
  });

  transport.on('POST', '/recharge', () => {
    rechargeCalls++;
    lastRechargedBalance = '290';
    return {
      status_code: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 0, data: { balance: 290 } }),
    };
  });

  // 分支后查询：回显请求头里的 balance_after，证明 else 分支提取的变量在分支外可用
  transport.on('GET', '/balance/after', (req) => ({
    status_code: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 0, data: { echo: req.headers['x-balance-after'] ?? '', recharged: lastRechargedBalance } }),
  }));

  return {
    transport,
    orderCalls: () => orderCalls,
    rechargeCalls: () => rechargeCalls,
  };
}

/** P1.6 forEach 循环 mock：列表返回 3 人，详情接口按 x-username 回显 */
function buildUsersTransport() {
  const detailCalls: string[] = [];

  const transport = new MockTransport();

  transport.on('GET', '/list-users', () => ({
    status_code: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: 0,
      data: ['alice', 'bob', 'carol'],
    }),
  }));

  transport.on('GET', '/users/item', (req) => {
    const username = req.headers['x-username'] ?? '';
    detailCalls.push(username);
    return {
      status_code: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 0, data: { username } }),
    };
  });

  // 循环后请求：回显 x-item 头。若 item 已出作用域，占位符不渲染，mock 返回空串
  transport.on('GET', '/after-loop', (req) => ({
    status_code: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 0, data: { item: req.headers['x-item'] === '{{item}}' ? '' : req.headers['x-item'] } }),
  }));

  return {
    transport,
    detailCalls: () => detailCalls,
  };
}

/** P1.6 CSV 数据驱动 mock：记录创建的用户（解析请求体），断言引用逐行数据 */
function buildCreateTransport() {
  const created: { username: string; role: string }[] = [];

  const transport = new MockTransport();

  transport.on('POST', '/create-user', (req) => {
    const body = JSON.parse(req.body ?? '{}') as { username?: string; role?: string };
    created.push({ username: body.username ?? '', role: body.role ?? '' });
    return {
      status_code: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 0, data: { username: body.username ?? '', role: body.role ?? '' } }),
    };
  });

  return {
    transport,
    createdUsers: () => created,
  };
}

/** 两个环境：不同 baseURL + 不同 tenant，验证环境切换 */
const DEV: Environment = { name: 'dev', base_url: 'https://dev-api.example.com', vars: { tenant: 'acme-dev' } };
const PROD: Environment = { name: 'prod', base_url: 'https://api.example.com', vars: { tenant: 'acme-prod' } };

/**
 * P1.6 条件步骤演示场景：查余额（90）→ 条件「余额 >= 价格(199)」为假 →
 * 走 else 分支充值（充到 290）→ 再查余额验证分支内提取变量在分支外可用。
 */
function buildPaymentScenario(): Scenario {
  return {
    id: randomUUID(),
    name: '余额检查 → 条件分支（不足则充值）',
    steps: [
      {
        test_case: makeTestCase({
          name: '查询余额与商品价格',
          method: 'GET',
          path: '/balance',
          assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
        }),
        extract: [
          { name: 'balance', jsonpath: '$.data.balance' },
          { name: 'price', jsonpath: '$.data.price' },
        ],
      },
      {
        condition: {
          name: '余额是否足够下单',
          expr: '{{balance}} >= {{price}}',
          thenSteps: [
            {
              test_case: makeTestCase({
                name: '直接下单',
                method: 'POST',
                path: '/order',
                assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
              }),
            },
          ],
          elseSteps: [
            {
              test_case: makeTestCase({
                name: '余额不足，先充值',
                method: 'POST',
                path: '/recharge',
                body: '{"amount":200}',
                assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
              }),
              extract: [{ name: 'balance_after', jsonpath: '$.data.balance' }],
            },
          ],
        },
      },
      {
        test_case: makeTestCase({
          name: '分支后查询余额（引用 else 分支提取的变量）',
          method: 'GET',
          path: '/balance/after',
          headers: { 'x-balance-after': '{{balance_after}}' },
          assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
        }),
        extract: [{ name: 'balance_after_confirmed', jsonpath: '$.data.echo' }],
      },
    ],
  };
}

/**
 * P1.6 forEach 循环演示场景：查用户列表（3 人）提取为 JSON 数组变量 →
 * forEach 逐个查详情（循环体引用 {{item}}）→ 循环后再查一次（验证 item 已出作用域）。
 */
function buildForEachScenario(): Scenario {
  return {
    id: randomUUID(),
    name: '用户列表 → forEach 逐个查详情',
    steps: [
      {
        test_case: makeTestCase({
          name: '查询用户列表',
          method: 'GET',
          path: '/list-users',
          assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
        }),
        extract: [{ name: 'users', jsonpath: '$.data' }],
      },
      {
        loop: {
          name: '逐个用户查详情',
          mode: 'forEach',
          listVar: 'users',
          itemVar: 'item',
          body: [
            {
              test_case: makeTestCase({
                name: '查用户详情（{{item}}）',
                method: 'GET',
                path: '/users/item',
                headers: { 'x-username': '{{item}}' },
                assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
              }),
            },
          ],
        },
      },
      {
        test_case: makeTestCase({
          name: '循环结束后（item 应出作用域）',
          method: 'GET',
          path: '/after-loop',
          headers: { 'x-item': '{{item}}' },
          assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
        }),
        extract: [{ name: 'item_seen', jsonpath: '$.data.item' }],
      },
    ],
  };
}

/** P1.6 CSV 数据驱动演示场景：2 行数据（alice/admin、bob/viewer）逐行创建用户 */
function buildCsvScenario(): Scenario {
  return {
    id: randomUUID(),
    name: 'CSV 数据驱动创建用户',
    steps: [
      {
        test_case: makeTestCase({
          name: '创建用户 {{dataset.users.username}}',
          method: 'POST',
          path: '/create-user',
          body: '{"username":"{{dataset.users.username}}","role":"{{dataset.users.role}}"}',
          assertions: [
            { type: 'status', operator: 'eq', expected: 200 },
            { type: 'jsonpath', target: '$.data.username', operator: 'eq', expected: '{{dataset.users.username}}' },
          ],
        }),
      },
    ],
    data_sets: [
      {
        name: 'users',
        rows: [
          { username: 'alice', role: 'admin' },
          { username: 'bob', role: 'viewer' },
        ],
      },
    ],
  };
}

async function main(): Promise<void> {
  const scenario = buildLoginListScenario();

  section('1. 场景编排 + 变量传递（dev 环境）');
  const devMock = buildTransportFor(DEV.vars['tenant'] ?? '');
  const devReport = await new ScenarioRunner(devMock.transport).run(scenario, DEV);

  assert(devReport.passed === true, '场景整体 PASS');
  assert(devReport.total_steps === 2 && devReport.passed_steps === 2, `2 个步骤全部通过（实际 ${devReport.passed_steps}/${devReport.total_steps}）`);

  const login = devReport.steps[0];
  const list = devReport.steps[1];
  assert(login?.passed === true, '登录步骤 PASS');
  assert(login?.status_code === 200, '登录状态码 200');
  assert(list?.passed === true, '列表步骤 PASS');
  assert(list?.status_code === 200, '列表状态码 200');

  const token = login?.extracted['token'] ?? '';
  assert(token.startsWith('mock-jwt-'), `登录提取到 token（${token.slice(0, 16)}...）`);
  assert(devMock.receivedAuth() === `Bearer ${devMock.issuedToken()}`, '列表请求 Authorization 携带了登录签发的 token（变量传递成功）');
  assert(devMock.receivedTenant() === 'acme-dev', '列表请求 X-Tenant 携带了环境变量 tenant（环境变量复用成功）');

  section('2. 环境切换（prod 环境，同一场景不同 baseURL/tenant）');
  const prodMock = buildTransportFor(PROD.vars['tenant'] ?? '');
  const prodReport = await new ScenarioRunner(prodMock.transport).run(scenario, PROD);

  assert(prodReport.passed === true, 'prod 环境场景 PASS');
  assert(prodReport.environment_name === 'prod', `报告环境名为 prod（实际 ${prodReport.environment_name}）`);
  assert(prodReport.base_url === 'https://api.example.com', `报告 base_url 切到 prod（实际 ${prodReport.base_url}）`);
  assert(prodReport.steps[1]?.url === 'https://api.example.com/users', `列表 URL 使用 prod base（实际 ${prodReport.steps[1]?.url}）`);
  assert(prodMock.receivedTenant() === 'acme-prod', 'prod 环境 tenant=acme-prod 注入成功');

  section('3. 报告导出（md / json / junit）');
  const md = reportToMarkdown(devReport);
  const json = reportToJson(devReport);
  const junit = reportToJunit(devReport);

  assert(md.includes('# 场景测试报告：登录 → 查询用户列表'), 'markdown 含报告标题');
  assert(md.includes('PASS') && md.includes('耗时'), 'markdown 含 pass 标记与耗时字段');

  const parsed = JSON.parse(json) as { total_steps: number; steps: unknown[] };
  assert(parsed.total_steps === 2 && parsed.steps.length === 2, 'json 可解析且含 2 个步骤');

  assert(junit.includes('<testsuite') && junit.includes('<testcase'), 'junit 含 testsuite/testcase 结构');

  section('4. 负例：故意写错断言 → 报告判 FAIL');
  const badScenario: Scenario = {
    id: randomUUID(),
    name: '失败演示',
    steps: [
      {
        test_case: makeTestCase({
          name: '登录',
          method: 'POST',
          path: '/login',
          body: '{"username":"alice"}',
          assertions: [{ type: 'status', operator: 'eq', expected: 200 }],
        }),
        extract: [{ name: 'token', jsonpath: '$.data.token' }],
      },
      {
        test_case: makeTestCase({
          name: '查询列表（错误断言：期望 500）',
          method: 'GET',
          path: '/users',
          headers: { authorization: 'Bearer {{token}}' },
          assertions: [{ type: 'status', operator: 'eq', expected: 500 }],
        }),
      },
    ],
  };
  const badReport = await new ScenarioRunner(devMock.transport).run(badScenario, DEV);
  assert(badReport.passed === false, '负例场景整体 FAIL');
  assert(badReport.failed_steps === 1, `负例 1 个步骤失败（实际 ${badReport.failed_steps}）`);
  assert(badReport.failed_assertions === 1, `负例 1 个断言失败（实际 ${badReport.failed_assertions}）`);
  assert(badReport.steps[1]?.passed === false, '列表步骤标记 FAIL');
  assert(reportToJunit(badReport).includes('<failure'), 'junit 含 failure 节点');

  section('5. P1.6 条件步骤：余额不足走 else 分支（充值）');
  const condMock = buildPaymentTransport();
  const condScenario = buildPaymentScenario();
  const condReport = await new ScenarioRunner(condMock.transport).run(condScenario, DEV);

  const condStep = condReport.steps.find((s) => s.kind === 'condition');
  assert(condReport.passed === true, '条件场景整体 PASS');
  assert(condStep?.branch === 'else', `条件求值为假，走了 else 分支（实际 ${String(condStep?.branch)}）`);
  assert(condStep?.condition_expr === '90 >= 199', `表达式变量替换后为 90 >= 199（实际 ${String(condStep?.condition_expr)}）`);
  // then 分支（下单）不应执行：mock 计数器验证
  assert(condMock.orderCalls() === 0, 'then 分支（下单接口）未执行');
  assert(condMock.rechargeCalls() === 1, 'else 分支（充值接口）执行 1 次');
  // else 分支内提取的变量（充值后余额）在分支外可见：后续步骤引用成功
  const afterStep = condReport.steps.find((s) => s.kind === 'api' && s.path === '/balance/after');
  assert(afterStep?.passed === true && afterStep.extracted['balance_after_confirmed'] === '290', 'else 分支提取变量 balance_after=290，分支外步骤可引用（作用域共享）');

  section('6. P1.6 forEach 循环：遍历 3 个用户逐个查详情');
  const loopMock = buildUsersTransport();
  const loopScenario = buildForEachScenario();
  const loopReport = await new ScenarioRunner(loopMock.transport).run(loopScenario, DEV);

  const loopStep = loopReport.steps.find((s) => s.kind === 'loop');
  assert(loopReport.passed === true, '循环场景整体 PASS');
  assert(loopStep?.loop_mode === 'forEach' && loopStep.iterations === 3, `forEach 循环 3 轮（实际 ${String(loopStep?.iterations)}）`);
  assert(loopMock.detailCalls().length === 3, `详情接口被调用 3 次（实际 ${String(loopMock.detailCalls().length)}）`);
  assert(
    JSON.stringify(loopMock.detailCalls()) === JSON.stringify(['alice', 'bob', 'carol']),
    `循环变量 item 逐轮切换：alice/bob/carol（实际 ${loopMock.detailCalls().join(',')}）`,
  );
  // 循环结束后 item 变量出作用域：引用它的步骤会保留占位符（mock 返回的 name 为空证明未渲染）
  const afterLoop = loopReport.steps.find((s) => s.kind === 'api' && s.path === '/after-loop');
  assert(afterLoop?.passed === true, '循环后步骤执行 PASS');
  assert(!('item' in (afterLoop?.extracted ?? {})), '循环变量 item 在循环外不可见（作用域限循环内）');

  section('7. P1.6 CSV 数据驱动：2 行数据逐行创建用户');
  const csvMock = buildCreateTransport();
  const csvScenario = buildCsvScenario();
  const csvReport = await new ScenarioRunner(csvMock.transport).run(csvScenario, DEV);

  assert(csvReport.passed === true, 'CSV 场景整体 PASS');
  assert(csvReport.total_iterations === 2, `数据迭代 2 轮（实际 ${String(csvReport.total_iterations)}）`);
  assert(
    JSON.stringify(csvMock.createdUsers()) === JSON.stringify([{ username: 'alice', role: 'admin' }, { username: 'bob', role: 'viewer' }]),
    `2 行数据各创建 1 个用户（实际 ${JSON.stringify(csvMock.createdUsers())}）`,
  );
  const csvApiSteps = csvReport.steps.filter((s) => s.kind === 'api');
  assert(csvApiSteps.every((s) => (s.iteration ?? 0) >= 1), '每个步骤结果携带所属数据轮次 iteration');

  section('报告预览（markdown）');
  console.log(reportToMarkdown(devReport));

  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
