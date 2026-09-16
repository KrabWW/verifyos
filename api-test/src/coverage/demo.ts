/**
 * A5 可跑验证 demo：
 * 1. 复用 A4 的 OpenAPI 导入生成 5 个 API 的 inventory；
 * 2. 从 operation 提取「预期响应码」（含 GET /users/:id 的 200 + 404）；
 * 3. 喂 2 个假 test_case（覆盖 GET /users 与 GET /users/:id 的 200）→
 *    覆盖率 40%，未覆盖清单 3 条，GET /users/:id 为「部分覆盖」（200 测了 404 没测）；
 * 4. 再跑一轮（新增 DELETE /users/:id 覆盖）→ 覆盖率上升，趋势随历史累积；
 * 5. 断言结果，全部通过退出码 0，否则非 0。
 *
 * 运行：npm run demo:coverage（或 tsx src/coverage/demo.ts）。
 */
import { randomUUID } from 'node:crypto';
import type { ApiDefinition, TestCase } from '../types/models.js';
import { operationsToDefinitions } from '../inventory/convert.js';
import { parseOpenApiText } from '../inventory/openapi.js';
import { InventoryStore } from '../inventory/store.js';
import { CoverageEngine, expectedCodesFromOperations } from './engine.js';
import { CoverageStore } from './store.js';
import { printBoard, printUncovered } from './board.js';

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

/** 假 spec：5 个 operation，其中 GET /users/{id} 声明 200 + 404（用于验证 response code 维度） */
const SPEC_YAML = `
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
      tags: [users]
      responses:
        '200':
          description: ok
    post:
      operationId: createUser
      tags: [users]
      responses:
        '201':
          description: created
        '400':
          description: bad request
  /users/{id}:
    get:
      operationId: getUser
      tags: [users]
      responses:
        '200':
          description: ok
        '404':
          description: not found
    put:
      operationId: updateUser
      tags: [users]
      responses:
        '200':
          description: ok
    delete:
      operationId: deleteUser
      tags: [users]
      responses:
        '204':
          description: no content
`;

/** 构造一个只断言状态码的假 test_case */
function makeTestCase(api: ApiDefinition, name: string, statusCode: number): TestCase {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    api_definition_id: api.id,
    name,
    request: { method: api.method, path: api.path, query_params: {}, headers: {} },
    assertions: [{ type: 'status', operator: 'eq', expected: statusCode }],
    variables: {},
    source: 'manual',
    tags: [],
    last_result: 'pass',
    review_status: 'approved',
    created_at: now,
    updated_at: now,
  };
}

function main(): void {
  section('1. 从 OpenAPI 生成 inventory（5 个 API）+ 提取预期响应码');
  const doc = parseOpenApiText(SPEC_YAML);
  const defs = operationsToDefinitions(doc);
  const store = new InventoryStore(defs);
  assert(store.size === 5, `inventory 有 5 条 api_definition（实际 ${store.size}）`);

  const expectedCodes = expectedCodesFromOperations(doc.operations);
  const getUserCodes = expectedCodes.get('GET /users/:id') ?? [];
  assert(getUserCodes.length === 2 && getUserCodes.includes(200) && getUserCodes.includes(404), `GET /users/:id 预期响应码为 [200, 404]（实际 [${getUserCodes.join(',')}]）`);

  section('2. 喂 2 个假 test_case → 覆盖率 40% + 未覆盖 3 条');
  const getUsers = store.getByKey('GET', '/users');
  const getUser = store.getByKey('GET', '/users/:id');
  assert(getUsers !== undefined && getUser !== undefined, '取到 GET /users 与 GET /users/:id 两条定义');

  const testCases: TestCase[] = [
    makeTestCase(getUsers as ApiDefinition, '列表用户-200', 200),
    makeTestCase(getUser as ApiDefinition, '用户详情-200', 200),
  ];

  const engine = new CoverageEngine(store, testCases, expectedCodes);
  const report = engine.report();

  assert(report.total === 5, `报告 total=5（实际 ${report.total}）`);
  assert(report.covered_count === 2, `已测 2 个 API（实际 ${report.covered_count}）`);
  assert(report.uncovered_count === 3, `未测 3 个 API（实际 ${report.uncovered_count}）`);
  assert(report.rate === 0.4, `覆盖率 40%（实际 ${(report.rate * 100).toFixed(1)}%）`);
  assert(report.uncovered.length === 3, `未覆盖清单 3 条（实际 ${report.uncovered.length}）`);

  section('3. response code 维度：GET /users/:id 测了 200 没测 404 → 部分覆盖');
  const getUserCov = report.operations.find((o) => o.method === 'GET' && o.path === '/users/:id');
  assert(getUserCov !== undefined, '明细中存在 GET /users/:id');
  assert(getUserCov?.covered === true, 'GET /users/:id operation 已覆盖（有 test_case）');
  assert(getUserCov?.codes_fully_covered === false, 'GET /users/:id 响应码未全覆盖（404 未测）');
  const code200 = getUserCov?.codes.find((c) => c.status_code === 200);
  const code404 = getUserCov?.codes.find((c) => c.status_code === 404);
  assert(code200?.covered === true, '200 已覆盖');
  assert(code404?.covered === false, '404 未覆盖');
  assert(report.partially_covered.length === 1 && report.partially_covered[0]?.path === '/users/:id', '部分覆盖清单含 GET /users/:id');

  section('4. 未覆盖清单排序（path / risk）');
  const byPath = engine.listUncovered('path');
  const byRisk = engine.listUncovered('risk');
  assert(byPath.length === 3 && byRisk.length === 3, '两种排序都返回 3 条');
  assert(byPath[0]?.path === '/users', `按 path 排序首条为 /users（实际 ${byPath[0]?.path}）`);
  // risk 降序：首个应是风险最高者（非降序即断言失败）
  const risks = byRisk.map((u) => u.risk);
  const sortedDesc = [...risks].sort((a, b) => b - a);
  assert(JSON.stringify(risks) === JSON.stringify(sortedDesc), `按 risk 降序（实际 [${risks.join(',')}]）`);

  section('5. 覆盖趋势：再跑一轮 → 覆盖率上升 + 历史累积');
  const coverageStore = new CoverageStore();
  coverageStore.append(engine.toCoverageRecords('2026-09-08T10:00:00.000Z'));

  const deleteUser = store.getByKey('DELETE', '/users/:id');
  assert(deleteUser !== undefined, '取到 DELETE /users/:id 定义');
  const round2Cases = [...testCases, makeTestCase(deleteUser as ApiDefinition, '删除用户-204', 204)];
  const engine2 = new CoverageEngine(store, round2Cases, expectedCodes);
  const report2 = engine2.report();
  assert(report2.covered_count === 3, `第二轮已测 3 个 API（实际 ${report2.covered_count}）`);
  assert(report2.rate === 0.6, `第二轮覆盖率 60%（实际 ${(report2.rate * 100).toFixed(1)}%）`);
  coverageStore.append(engine2.toCoverageRecords('2026-09-08T11:00:00.000Z'));

  assert(coverageStore.size === 10, `趋势记录共 10 条（5 API x 2 轮，实际 ${coverageStore.size}）`);
  const deleteTrend = coverageStore.trend('DELETE /users/:id');
  assert(deleteTrend.length === 2, `DELETE /users/:id 趋势 2 条（实际 ${deleteTrend.length}）`);
  assert(deleteTrend[0]?.covered === false && deleteTrend[1]?.covered === true, 'DELETE /users/:id 趋势：未覆盖 → 已覆盖');

  section('6. 看板输出（控制台可读）');
  printBoard(report2);
  console.log('（按 risk 排序的未覆盖清单）');
  printUncovered(byRisk);

  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
