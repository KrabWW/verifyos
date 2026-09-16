/**
 * A6 可跑验证 demo：
 * 1. 喂一个假 OpenAPI spec（5 个 operation，含枚举 / 数值边界 / 必填体字段 / 数组）→ A4 解析；
 * 2. spec → 生成 happy-path + edge-case + fuzz 用例；
 * 3. 断言 edge-case 覆盖「缺失必填 / 错误类型 / 越界」等类别；
 * 4. 断言可导出（JSON 往返），全部通过则退出码 0，否则非 0。
 *
 * 运行：npm run demo:spec-test（或 tsx src/spec-test/demo.ts）。
 */
import { operationsToDefinitions } from '../inventory/convert.js';
import { parseOpenApiText } from '../inventory/openapi.js';
import { exportCases, generateTestCases, summarize } from './generate.js';

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

/** 假 spec（YAML）：5 个 operation，schema 覆盖各 edge-case 类别 */
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
      summary: 用户列表
      tags: [users]
      parameters:
        - name: limit
          in: query
          required: true
          schema:
            type: integer
            minimum: 1
            maximum: 100
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: array
        '400':
          description: bad request
    post:
      operationId: createUser
      summary: 创建用户
      tags: [users]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, age, data]
              properties:
                name:
                  type: string
                  minLength: 1
                age:
                  type: integer
                  minimum: 0
                  maximum: 150
                role:
                  type: string
                  enum: [admin, user, guest]
                tags:
                  type: array
                  maxItems: 5
                  items:
                    type: string
                profile:
                  type: object
                  required: [email]
                  properties:
                    email:
                      type: string
                      format: email
                data:
                  type: object
                  required: [user]
                  properties:
                    user:
                      type: object
                      required: [email]
                      properties:
                        email:
                          type: string
                          format: email
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
        - name: include
          in: query
          required: false
          schema:
            type: string
      responses:
        '200':
          description: ok
        '404':
          description: not found
    put:
      operationId: updateUser
      summary: 更新用户
      tags: [users]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email:
                  type: string
                  format: email
      responses:
        '200':
          description: ok
    delete:
      operationId: deleteUser
      summary: 删除用户
      tags: [users]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '204':
          description: no content
`;

function main(): void {
  section('1. A4 解析 spec（5 operation）');
  const doc = parseOpenApiText(SPEC_YAML);
  assert(doc.operations.length === 5, `解析出 5 个 operation（实际 ${doc.operations.length}）`);

  section('2. spec → 生成用例（happy-path + edge-case + fuzz）');
  const definitions = operationsToDefinitions(doc);
  const cases = generateTestCases(doc, { fuzzCount: 5, definitions });
  const summary = summarize(cases, doc.operations.length);

  assert(summary.operations === 5, `覆盖 5 个 operation（实际 ${summary.operations}）`);
  assert(summary.byKind['happy-path'] === 5, `happy-path 用例 5 条（实际 ${summary.byKind['happy-path']}）`);
  assert(summary.byKind.fuzz === 25, `fuzz 用例 5×5=25 条（实际 ${summary.byKind.fuzz}）`);
  assert(summary.byKind['edge-case'] > 0, `edge-case 用例生成（实际 ${summary.byKind['edge-case']} 条）`);

  section('3. edge-case 类别齐全（缺失必填 / 错误类型 / 越界 / 空串 / 非法枚举 / 数组越界）');
  const required = ['array_bounds', 'empty_string', 'invalid_enum', 'missing_required', 'out_of_range', 'wrong_type'];
  for (const cat of required) {
    assert(summary.edgeCategories.includes(cat), `edge-case 类别含 ${cat}`);
  }

  section('4. P1.5 嵌套字段深度 edge-case');
  // 嵌套必填缺失：data.user.email / data.user / profile.email
  const nestedMissing = cases.filter((c) => c.name.includes('body.data.user.email') || c.name.includes('body.profile.email'));
  assert(
    nestedMissing.some((c) => c.edge_category === 'missing_required' && c.name.includes('body.data.user.email')),
    `嵌套必填 data.user.email 生成 missing_required（相关用例 ${nestedMissing.length} 条）`,
  );
  assert(
    nestedMissing.some((c) => c.edge_category === 'missing_required' && c.name.includes('body.profile.email')),
    '嵌套必填 profile.email 生成 missing_required',
  );
  // 嵌套字段非法值：data.user.email 空串 / 错误类型
  assert(
    nestedMissing.some((c) => c.edge_category === 'empty_string' && c.name.includes('body.data.user.email')),
    '嵌套字段 data.user.email 生成 empty_string',
  );
  assert(
    nestedMissing.some((c) => c.edge_category === 'wrong_type' && c.name.includes('body.data.user.email')),
    '嵌套字段 data.user.email 生成 wrong_type',
  );
  // 变异确实写入请求体：解析 body JSON 验证 email 被置为空串
  const emptyEmail = nestedMissing.find((c) => c.edge_category === 'empty_string' && c.name.includes('body.data.user.email'));
  const bodyObj = emptyEmail ? (JSON.parse(emptyEmail.request.body ?? '{}') as { data?: { user?: { email?: unknown } } }) : undefined;
  assert(bodyObj?.data?.user?.email === '', 'empty_string 变异写入嵌套路径 data.user.email');
  // missing_required 变异确实删除嵌套字段
  const missEmail = nestedMissing.find((c) => c.edge_category === 'missing_required' && c.name.includes('body.data.user.email'));
  const missBody = missEmail ? (JSON.parse(missEmail.request.body ?? '{}') as { data?: { user?: Record<string, unknown> } }) : undefined;
  assert(missBody?.data?.user !== undefined && !('email' in (missBody?.data?.user ?? {})), 'missing_required 变异从嵌套路径删除 data.user.email');
  // 深度限制：maxDepth=3 时 data.user.email（depth=3）是最后一级，字段名不出现更深层
  const deeper = cases.filter((c) => c.name.includes('user.email.'));
  assert(deeper.length === 0, 'maxDepth=3 限制下钻（无更深层用例）');
  // 用例总数应比无嵌套时（55）多
  assert(summary.total > 55, `用例总数因嵌套字段增加（${summary.total} > 55）`);
  assert(summary.byKind['edge-case'] > 25, `edge-case 用例数增加（${summary.byKind['edge-case']} > 25）`);
  // fuzz 用例数稳定（fuzzCount=5 × 5 operation）
  assert(summary.byKind.fuzz === 25, `fuzz 用例数不变（${summary.byKind.fuzz}）`);
  // fuzz 嵌套采样：body 里应出现过嵌套 object（data/profile 递归生成），且非全 null
  const fuzzBodies = cases
    .filter((c) => c.kind === 'fuzz' && c.name.startsWith('POST /users'))
    .map((c) => JSON.parse(c.request.body ?? '{}') as Record<string, unknown>);
  const fuzzNested = fuzzBodies.filter((b) => typeof b.data === 'object' && b.data !== null);
  assert(fuzzNested.length > 0, `fuzz 请求体出现嵌套 data 对象（${fuzzNested.length}/${fuzzBodies.length} 条）`);

  section('5. 可导出（JSON 往返）');
  const json = exportCases(cases);
  const parsed = JSON.parse(json) as unknown[];
  assert(Array.isArray(parsed) && parsed.length === cases.length, `导出 ${parsed.length} 条用例，JSON 可回放`);

  console.log(`\n生成统计：${JSON.stringify(summary)}`);
  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
