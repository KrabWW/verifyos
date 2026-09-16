/**
 * api-test Web UI 演示数据。
 *
 * 数据形态严格对齐 src/types/models.ts（ApiDefinition/TestCase/Assertion）与
 * src/coverage/types.ts（CoverageReport/OperationCoverage）、src/scenario/types.ts
 * （Scenario/Environment/ScenarioReport）、src/assertion/types.ts（Diagnosis）。
 * 当前为静态演示；后续接真实引擎时，用相同字段的结构替换即可，UI 不用改。
 */
"use strict";

/* ------------------------------ API 清单 ------------------------------ */
/** 复用 A4/A5 demo 的用户服务 spec（5 operation）+ 录制聚合出的 2 条 */
const API_DEFINITIONS = [
  {
    id: "api-001",
    method: "GET",
    path: "/users",
    host: "https://api.example.com",
    version: "v1",
    spec_source: "openapi",
    request_schema: null,
    response_schema: { type: "array", items: { type: "object" } },
    content_type: "application/json",
    auth_type: "bearer",
    tags: ["users"],
    scope: "internal",
    status: "active",
    sample_count: 42,
    summary: "用户列表",
    parameters: [{ name: "limit", in: "query", required: true, schema: { type: "integer", minimum: 1, maximum: 100 } }],
    responses: { "200": { description: "ok" }, "400": { description: "bad request" } },
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "api-002",
    method: "POST",
    path: "/users",
    host: "https://api.example.com",
    version: "v1",
    spec_source: "openapi",
    request_schema: {
      type: "object",
      required: ["name", "age"],
      properties: {
        name: { type: "string", minLength: 1 },
        age: { type: "integer", minimum: 0, maximum: 150 },
        role: { type: "string", enum: ["admin", "user", "guest"] },
        tags: { type: "array", maxItems: 5, items: { type: "string" } },
      },
    },
    response_schema: { type: "object" },
    content_type: "application/json",
    auth_type: "bearer",
    tags: ["users"],
    status: "active",
    sample_count: 18,
    summary: "创建用户",
    parameters: [],
    responses: { "201": { description: "created" }, "400": { description: "bad request" } },
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "api-003",
    method: "GET",
    path: "/users/:id",
    host: "https://api.example.com",
    version: "v1",
    spec_source: "openapi",
    response_schema: { type: "object" },
    content_type: "application/json",
    auth_type: "bearer",
    tags: ["users"],
    scope: "internal",
    status: "deprecated",
    sample_count: 7,
    summary: "用户详情",
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "include", in: "query", required: false, schema: { type: "string" } },
    ],
    responses: { "200": { description: "ok" }, "404": { description: "not found" } },
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "api-004",
    method: "PUT",
    path: "/users/:id",
    host: "https://api.example.com",
    version: "v1",
    spec_source: "openapi",
    request_schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
    auth_type: "bearer",
    tags: ["users"],
    status: "active",
    sample_count: 9,
    summary: "更新用户",
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: { "200": { description: "ok" } },
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "api-005",
    method: "DELETE",
    path: "/users/:id",
    host: "https://api.example.com",
    version: "v1",
    spec_source: "openapi",
    auth_type: "bearer",
    tags: ["users"],
    status: "active",
    sample_count: 3,
    summary: "删除用户",
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: { "204": { description: "no content" } },
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "api-101",
    method: "POST",
    path: "/login",
    host: "https://api.example.com",
    version: "v1",
    spec_source: "recorded",
    request_schema: { type: "object", required: ["username", "password"], properties: { username: { type: "string" }, password: { type: "string" } } },
    auth_type: "none",
    tags: ["auth"],
    scope: "external",
    status: "active",
    sample_count: 66,
    summary: "登录",
    parameters: [],
    responses: { "200": { description: "ok" }, "401": { description: "unauthorized" } },
    created_at: "2026-09-02T08:00:00.000Z",
    updated_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "api-102",
    method: "GET",
    path: "/users/:id/posts",
    host: "https://api.example.com",
    version: "v1",
    spec_source: "spec",
    auth_type: "bearer",
    tags: ["posts"],
    status: "active",
    sample_count: 0,
    summary: "用户文章列表",
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: { "200": { description: "ok" } },
    created_at: "2026-09-07T08:00:00.000Z",
    updated_at: "2026-09-08T09:00:00.000Z",
  },
];

/* ------------------------------ 测试用例 ------------------------------ */
/** 来源=recorded / spec / ai，spec 的带 kind（happy-path/edge-case/fuzz），形态对齐 A6 GeneratedTestCase */
const TEST_CASES = [
  {
    id: "tc-001", api_definition_id: "api-001", name: "列表用户-200",
    description: "录制回放：GET /users 正常返回",
    request: { method: "GET", path: "/users", query_params: { limit: ["20"] }, headers: { authorization: "Bearer {{token}}" }, body: undefined },
    assertions: [{ type: "status", operator: "eq", expected: 200 }],
    variables: {}, source: "recorded", tags: ["smoke"], last_result: "pass", review_status: "approved",
    created_at: "2026-09-05T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-002", api_definition_id: "api-001", name: "列表用户-limit 越界（101）",
    description: "由 spec 生成：query 参数越界",
    request: { method: "GET", path: "/users", query_params: { limit: ["101"] }, headers: {} },
    assertions: [{ type: "status", operator: "eq", expected: 400 }],
    variables: {}, source: "spec", kind: "edge-case", edge_category: "out_of_range",
    expectation: "limit 超过 maximum=100，期望 400",
    tags: ["edge"], last_result: "pass", review_status: "approved",
    created_at: "2026-09-06T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-003", api_definition_id: "api-002", name: "创建用户-happy-path",
    description: "由 spec 生成：合法样例值",
    request: { method: "POST", path: "/users", query_params: {}, headers: { "content-type": "application/json" }, body: "{\"name\":\"alice\",\"age\":20,\"role\":\"user\",\"tags\":[\"a\"]}" },
    assertions: [{ type: "status", operator: "eq", expected: 201 }],
    variables: {}, source: "spec", kind: "happy-path", expectation: "全部字段合法，期望 201",
    tags: ["happy-path"], last_result: "pass", review_status: "approved",
    created_at: "2026-09-06T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-004", api_definition_id: "api-002", name: "创建用户-缺失必填 age",
    description: "由 spec 生成：请求体缺必填字段",
    request: { method: "POST", path: "/users", query_params: {}, headers: { "content-type": "application/json" }, body: "{\"name\":\"bob\"}" },
    assertions: [{ type: "status", operator: "eq", expected: 400 }],
    variables: {}, source: "spec", kind: "edge-case", edge_category: "missing_required",
    expectation: "缺 required 字段 age，期望 400",
    tags: ["edge"], last_result: "pass", review_status: "approved",
    created_at: "2026-09-06T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-005", api_definition_id: "api-002", name: "创建用户-role 非法枚举",
    description: "由 spec 生成：enum 外取值",
    request: { method: "POST", path: "/users", query_params: {}, headers: { "content-type": "application/json" }, body: "{\"name\":\"carol\",\"age\":30,\"role\":\"superadmin\"}" },
    assertions: [{ type: "status", operator: "eq", expected: 400 }],
    variables: {}, source: "spec", kind: "edge-case", edge_category: "invalid_enum",
    expectation: "role 不在 enum 中，期望 400",
    tags: ["edge"], last_result: "pending", review_status: "pending",
    created_at: "2026-09-06T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-006", api_definition_id: "api-003", name: "用户详情-200",
    description: "录制回放：GET /users/:id 正常返回",
    request: { method: "GET", path: "/users/123", query_params: {}, headers: { authorization: "Bearer {{token}}" } },
    assertions: [
      { type: "status", operator: "eq", expected: 200 },
      { type: "jsonpath", target: "$.data.id", operator: "eq", expected: 123, mode: "strict" },
    ],
    variables: {}, source: "recorded", tags: ["smoke"], last_result: "pass", review_status: "approved",
    created_at: "2026-09-05T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-007", api_definition_id: "api-005", name: "删除用户-204",
    description: "录制回放：DELETE /users/:id",
    request: { method: "DELETE", path: "/users/123", query_params: {}, headers: { authorization: "Bearer {{token}}" } },
    assertions: [{ type: "status", operator: "eq", expected: 204 }],
    variables: {}, source: "recorded", tags: [], last_result: "pass", review_status: "approved",
    created_at: "2026-09-05T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-008", api_definition_id: "api-003", name: "用户详情-404 不存在",
    description: "AI 生成：不存在的 id",
    request: { method: "GET", path: "/users/not-exist-id", query_params: {}, headers: {} },
    assertions: [{ type: "status", operator: "eq", expected: 404 }],
    variables: {}, source: "ai", kind: "edge-case", edge_category: "not_found",
    expectation: "id 不存在，期望 404",
    tags: ["ai", "edge"], last_result: "pending", review_status: "pending",
    created_at: "2026-09-08T09:00:00.000Z", updated_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "tc-009", api_definition_id: "api-002", name: "创建用户-fuzz #3",
    description: "由 spec 生成：随机采样（属性测试）",
    request: { method: "POST", path: "/users", query_params: {}, headers: { "content-type": "application/json" }, body: "{\"name\":\"\\u0000ff\",\"age\":-2147483648}" },
    assertions: [{ type: "status", operator: "ne", expected: 500 }],
    variables: {}, source: "spec", kind: "fuzz", expectation: "fuzz 采样，断言非 5xx",
    tags: ["fuzz"], last_result: "pass", review_status: "approved",
    created_at: "2026-09-06T10:00:00.000Z", updated_at: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "tc-010", api_definition_id: "api-004", name: "更新用户-email 格式错误",
    description: "AI 生成：format=email 边界",
    request: { method: "PUT", path: "/users/123", query_params: {}, headers: { "content-type": "application/json" }, body: "{\"email\":\"not-an-email\"}" },
    assertions: [{ type: "status", operator: "eq", expected: 400 }],
    variables: {}, source: "ai", kind: "edge-case", edge_category: "wrong_format",
    expectation: "email 格式非法，期望 400",
    tags: ["ai", "edge"], last_result: "fail", review_status: "pending",
    created_at: "2026-09-08T09:00:00.000Z", updated_at: "2026-09-08T09:00:00.000Z",
  },
];

/* ------------------------------ 覆盖率报告（对齐 A5 demo 第二轮结果） ------------------------------ */
const COVERAGE = {
  total: 7,
  covered_count: 4,
  uncovered_count: 3,
  rate: 0.571,
  operations: [
    {
      api_key: "GET /users", api_definition_id: "api-001", method: "GET", path: "/users", covered: true,
      codes: [{ status_code: 200, covered: true }, { status_code: 400, covered: true }],
      codes_fully_covered: true, test_case_count: 2, test_case_ids: ["tc-001", "tc-002"], last_tested_at: "2026-09-08T11:00:00.000Z",
    },
    {
      api_key: "POST /users", api_definition_id: "api-002", method: "POST", path: "/users", covered: true,
      codes: [{ status_code: 201, covered: true }, { status_code: 400, covered: true }],
      codes_fully_covered: true, test_case_count: 3, test_case_ids: ["tc-003", "tc-004", "tc-005"], last_tested_at: "2026-09-08T11:00:00.000Z",
    },
    {
      api_key: "GET /users/:id", api_definition_id: "api-003", method: "GET", path: "/users/:id", covered: true,
      codes: [{ status_code: 200, covered: true }, { status_code: 404, covered: false }],
      codes_fully_covered: false, test_case_count: 2, test_case_ids: ["tc-006", "tc-008"], last_tested_at: "2026-09-08T11:00:00.000Z",
    },
    {
      api_key: "PUT /users/:id", api_definition_id: "api-004", method: "PUT", path: "/users/:id", covered: true,
      codes: [{ status_code: 200, covered: false }],
      codes_fully_covered: false, test_case_count: 1, test_case_ids: ["tc-010"], last_tested_at: "2026-09-08T11:00:00.000Z",
    },
    {
      api_key: "DELETE /users/:id", api_definition_id: "api-005", method: "DELETE", path: "/users/:id", covered: true,
      codes: [{ status_code: 204, covered: true }],
      codes_fully_covered: true, test_case_count: 1, test_case_ids: ["tc-007"], last_tested_at: "2026-09-08T11:00:00.000Z",
    },
    {
      api_key: "POST /login", api_definition_id: "api-101", method: "POST", path: "/login", covered: false,
      codes: [{ status_code: 200, covered: false }, { status_code: 401, covered: false }],
      codes_fully_covered: false, test_case_count: 0, test_case_ids: [], last_tested_at: null,
    },
    {
      api_key: "GET /users/:id/posts", api_definition_id: "api-102", method: "GET", path: "/users/:id/posts", covered: false,
      codes: [{ status_code: 200, covered: false }],
      codes_fully_covered: false, test_case_count: 0, test_case_ids: [], last_tested_at: null,
    },
  ],
  uncovered: [
    { api_key: "POST /login", api_definition_id: "api-101", method: "POST", path: "/login", uncovered_codes: [200, 401], risk: 8, operation_uncovered: true },
    { api_key: "GET /users/:id/posts", api_definition_id: "api-102", method: "GET", path: "/users/:id/posts", uncovered_codes: [200], risk: 6, operation_uncovered: true },
  ],
  partially_covered: [
    { api_key: "GET /users/:id", method: "GET", path: "/users/:id", codes: [{ status_code: 200, covered: true }, { status_code: 404, covered: false }], codes_fully_covered: false },
  ],
  /** 覆盖趋势（两轮，对齐 demo 第 5 节形态） */
  trend: [
    { api_key: "GET /users", points: [{ tested_at: "09-01 10:00", covered: true }, { tested_at: "09-08 11:00", covered: true }] },
    { api_key: "POST /users", points: [{ tested_at: "09-01 10:00", covered: false }, { tested_at: "09-08 11:00", covered: true }] },
    { api_key: "GET /users/:id", points: [{ tested_at: "09-01 10:00", covered: true }, { tested_at: "09-08 11:00", covered: true }] },
    { api_key: "PUT /users/:id", points: [{ tested_at: "09-01 10:00", covered: false }, { tested_at: "09-08 11:00", covered: true }] },
    { api_key: "DELETE /users/:id", points: [{ tested_at: "09-01 10:00", covered: false }, { tested_at: "09-08 11:00", covered: true }] },
    { api_key: "POST /login", points: [{ tested_at: "09-01 10:00", covered: false }, { tested_at: "09-08 11:00", covered: false }] },
    { api_key: "GET /users/:id/posts", points: [{ tested_at: "09-08 11:00", covered: false }] },
  ],
};

/* ------------------------------ 场景（对齐 A8 demo） ------------------------------ */
const ENVIRONMENTS = [
  { name: "dev", base_url: "https://dev-api.example.com", vars: { tenant: "acme-dev" } },
  { name: "prod", base_url: "https://api.example.com", vars: { tenant: "acme-prod" } },
];

const SCENARIOS = [
  {
    id: "sc-001",
    name: "登录 → 查询用户列表",
    description: "登录拿 token → 用 token + tenant 查列表（变量传递 + 环境变量复用）",
    /**
     * 步骤树（MeterSphere 式编排）：节点形如
     * { id, type: 'request'|'condition'|'loop'|'wait'|'assert'|'reference',
     *   name, config?, children?, branch?, status?, durationMs?, iterations?, result? }
     * - condition / loop 可作父节点，子步骤挂 children（可带 branch: 'then'|'else'）
     * - status = 'pass'|'fail'|'skipped'（最近一次执行；缺省=未执行）
     * - loop 子步骤可用 iterations[] 记录每一轮的执行结果
     */
    steps: [
      {
        id: "st-a1", type: "request", name: "登录获取 token",
        config: {
          method: "POST", url: "https://dev-api.example.com/login", headers: {}, body: "{\"username\":\"alice\",\"password\":\"secret\"}",
          assertions: [{ type: "status", operator: "eq", expected: 200 }, { type: "jsonpath", target: "$.code", operator: "eq", expected: 0 }],
          extract: [{ name: "token", jsonpath: "$.data.token" }],
        },
        status: "pass", durationMs: 128,
        result: {
          status_code: 200, extracted: { token: "mock-jwt-1789c2" },
          assertions: [
            { type: "status", operator: "eq", expected: 200, actual: 200, passed: true, message: "status eq 200" },
            { type: "jsonpath", target: "$.code", operator: "eq", expected: 0, actual: 0, passed: true, message: "$.code eq 0" },
          ],
        },
      },
      {
        id: "st-a2", type: "request", name: "查询用户列表（Authorization + X-Tenant）",
        config: {
          method: "GET", url: "https://dev-api.example.com/users", headers: { authorization: "Bearer {{token}}", "x-tenant": "{{tenant}}" },
          assertions: [{ type: "status", operator: "eq", expected: 200 }, { type: "jsonpath", target: "$.data[0].name", operator: "eq", expected: "alice" }],
        },
        status: "pass", durationMs: 184,
        result: {
          status_code: 200, extracted: {},
          assertions: [
            { type: "status", operator: "eq", expected: 200, actual: 200, passed: true, message: "status eq 200" },
            { type: "jsonpath", target: "$.data[0].name", operator: "eq", expected: "alice", actual: "alice", passed: true, message: "$.data[0].name eq alice" },
          ],
        },
      },
    ],
    /** 最近一次运行报告（对齐 ScenarioReport） */
    last_report: {
      scenario_name: "登录 → 查询用户列表", environment_name: "dev", base_url: "https://dev-api.example.com",
      started_at: "2026-09-08T10:00:00.000Z", finished_at: "2026-09-08T10:00:00.312Z", duration_ms: 312,
      passed: true, total_steps: 2, passed_steps: 2, failed_steps: 0,
      total_assertions: 4, passed_assertions: 4, failed_assertions: 0,
      steps: [
        {
          name: "登录获取 token", method: "POST", path: "/login", url: "https://dev-api.example.com/login",
          status_code: 200, latency_ms: 128, passed: true, extracted: { token: "mock-jwt-1789c2" },
          assertions: [
            { type: "status", operator: "eq", expected: 200, actual: 200, passed: true, message: "status eq 200" },
            { type: "jsonpath", target: "$.code", operator: "eq", expected: 0, actual: 0, passed: true, message: "$.code eq 0" },
          ],
        },
        {
          name: "查询用户列表（Authorization + X-Tenant）", method: "GET", path: "/users", url: "https://dev-api.example.com/users",
          status_code: 200, latency_ms: 184, passed: true, extracted: {},
          assertions: [
            { type: "status", operator: "eq", expected: 200, actual: 200, passed: true, message: "status eq 200" },
            { type: "jsonpath", target: "$.data[0].name", operator: "eq", expected: "alice", actual: "alice", passed: true, message: "$.data[0].name eq alice" },
          ],
        },
      ],
    },
  },
  {
    id: "sc-002",
    name: "下单链路：循环创建订单（条件分支）",
    description: "登录 → 循环 3 轮创建订单（余额判断走 then/else 分支）→ 等待 → 断言订单数 → 查询列表 → 引用场景",
    steps: [
      {
        id: "st-b1", type: "request", name: "登录获取 token",
        config: {
          method: "POST", url: "https://dev-api.example.com/login", headers: {}, body: "{\"username\":\"bob\",\"password\":\"secret\"}",
          assertions: [{ type: "status", operator: "eq", expected: 200 }, { type: "jsonpath", target: "$.code", operator: "eq", expected: 0 }],
          extract: [{ name: "token", jsonpath: "$.data.token" }],
        },
        status: "pass", durationMs: 132,
        result: {
          status_code: 200, extracted: { token: "mock-jwt-b40f11" },
          assertions: [
            { type: "status", operator: "eq", expected: 200, actual: 200, passed: true, message: "status eq 200" },
            { type: "jsonpath", target: "$.code", operator: "eq", expected: 0, actual: 0, passed: true, message: "$.code eq 0" },
          ],
        },
      },
      {
        id: "st-b2", type: "loop", name: "循环下单（3 轮）",
        config: { loopType: "count", count: 3, intervalMs: 100, variable: null },
        status: "pass", durationMs: 1286,
        children: [
          {
            id: "st-b3", type: "request", name: "查询账户余额",
            config: {
              method: "GET", url: "https://dev-api.example.com/account/balance", headers: { authorization: "Bearer {{token}}" },
              assertions: [{ type: "status", operator: "eq", expected: 200 }],
              extract: [{ name: "balance", jsonpath: "$.data.balance" }],
            },
            status: "pass", durationMs: 87,
            result: {
              status_code: 200, extracted: { balance: "250.00" },
              assertions: [{ type: "status", operator: "eq", expected: 200, actual: 200, passed: true, message: "status eq 200" }],
            },
          },
          {
            id: "st-b4", type: "condition", name: "余额 ≥ 订单金额（199.00）",
            config: { variable: "{{balance}}", operator: "gte", value: "199.00", expression: "Number({{balance}}) >= 199.00" },
            status: "pass", durationMs: 2,
            children: [
              {
                id: "st-b5", type: "request", name: "创建订单",
                branch: "then",
                config: {
                  method: "POST", url: "https://dev-api.example.com/orders", headers: { authorization: "Bearer {{token}}", "content-type": "application/json" },
                  body: "{\"sku\":\"SKU-1001\",\"amount\":199.00}",
                  assertions: [{ type: "status", operator: "eq", expected: 201 }, { type: "jsonpath", target: "$.data.orderId", operator: "exists" }],
                  extract: [{ name: "lastOrderId", jsonpath: "$.data.orderId" }],
                },
                status: "fail", durationMs: 141, /* 3 轮聚合：pass / skipped / fail */
                result: {
                  status_code: 409, extracted: {},
                  assertions: [
                    { type: "status", operator: "eq", expected: 201, actual: 409, passed: false, message: "期望 201，实际 409（SKU-1001 库存不足，第 3 轮）" },
                  ],
                },
              },
              {
                id: "st-b6", type: "assert", name: "记录「余额不足」告警",
                branch: "else",
                config: { type: "jsonpath", target: "$.alerts[0].level", operator: "eq", expected: "warn" },
                /* 聚合语义：最近一轮（#3）余额充足走 then，else 分支未执行 */
                status: "skipped",
                result: { passed: null, message: "第 3 轮余额充足走 then 分支，else 未执行（第 2 轮曾执行并记录 warn 告警）" },
              },
            ],
          },
        ],
        /** 每轮执行明细（检查器里按轮查看） */
        iterations: [
          {
            index: 1, status: "pass", durationMs: 236,
            childResults: { "st-b3": { status: "pass", durationMs: 92, extracted: { balance: "250.00" } }, "st-b4": { status: "pass", taken: "then", durationMs: 2 }, "st-b5": { status: "pass", durationMs: 142, status_code: 201, extracted: { lastOrderId: "71001" } }, "st-b6": { status: "skipped" } },
          },
          {
            index: 2, status: "pass", durationMs: 121,
            childResults: { "st-b3": { status: "pass", durationMs: 84, extracted: { balance: "51.00" } }, "st-b4": { status: "pass", taken: "else", durationMs: 2 }, "st-b5": { status: "skipped" }, "st-b6": { status: "pass", durationMs: 3 } },
          },
          {
            index: 3, status: "fail", durationMs: 178,
            childResults: { "st-b3": { status: "pass", durationMs: 86, extracted: { balance: "260.00" } }, "st-b4": { status: "pass", taken: "then", durationMs: 2 }, "st-b5": { status: "fail", durationMs: 90, status_code: 409, message: "SKU-1001 库存不足" }, "st-b6": { status: "skipped" } },
          },
        ],
      },
      {
        id: "st-b7", type: "wait", name: "等待订单落库",
        config: { durationMs: 500 },
        status: "pass", durationMs: 502,
      },
      {
        id: "st-b8", type: "assert", name: "断言：订单总数 = 2",
        config: { type: "jsonpath", target: "$.data.total", operator: "eq", expected: 2 },
        status: "fail", durationMs: 96,
        result: { actual: 1, passed: false, message: "期望订单总数 2，实际 1（第 2 轮余额不足跳过，第 3 轮 409 库存不足）" },
      },
      {
        id: "st-b9", type: "request", name: "查询订单列表",
        config: {
          method: "GET", url: "https://dev-api.example.com/orders?limit=10", headers: { authorization: "Bearer {{token}}" },
          assertions: [{ type: "status", operator: "eq", expected: 200 }, { type: "jsonpath", target: "$.data[0].orderId", operator: "eq", expected: "{{lastOrderId}}" }],
        },
        status: "pass", durationMs: 118,
        result: {
          status_code: 200, extracted: {},
          assertions: [
            { type: "status", operator: "eq", expected: 200, actual: 200, passed: true, message: "status eq 200" },
            { type: "jsonpath", target: "$.data[0].orderId", operator: "eq", expected: "{{lastOrderId}}", actual: "71001", passed: true, message: "$.data[0].orderId eq {{lastOrderId}} → 71001" },
          ],
        },
      },
      {
        id: "st-b10", type: "reference", name: "引用场景：登录 → 查询用户列表",
        config: { scenarioId: "sc-001", refMode: "ref", note: "复用已有场景做数据一致性校验（引用不复制，源场景更新自动生效）" },
        status: "pass", durationMs: 310,
      },
    ],
    last_report: {
      scenario_name: "下单链路：循环创建订单（条件分支）", environment_name: "dev", base_url: "https://dev-api.example.com",
      started_at: "2026-09-08T09:30:00.000Z", finished_at: "2026-09-08T09:30:02.146Z", duration_ms: 2146,
      passed: false, total_steps: 10, passed_steps: 8, failed_steps: 2, skipped_steps: 0,
      total_assertions: 9, passed_assertions: 8, failed_assertions: 1,
    },
  },
];

/* ------------------------------ AI 演示结果（右栏入口点击后展示，形态对齐 assertion/diagnose 与 generate） ------------------------------ */
const AI_DEMOS = {
  /** 从录制生成用例（generator/convert 形态） */
  recordToCase: {
    title: "从录制生成用例",
    summary: "从 3 条录制流量聚合出 1 个 API，去噪后生成 2 条用例",
    cases: [
      {
        name: "GET /users/:id 200（录制回放）",
        request: "GET /users/123",
        assertions: [
          { type: "status", operator: "eq", expected: 200 },
          { type: "jsonpath", target: "$.data.name", operator: "exists" },
          { type: "jsonpath", target: "$.data.updated_at", operator: "exists", mode: "ignore" },
        ],
      },
      {
        name: "GET /users/:id 404（负例补充）",
        request: "GET /users/not-exist",
        assertions: [{ type: "status", operator: "eq", expected: 404 }],
      },
    ],
    note: "噪音字段 updated_at 已按 mode=ignore 处理（仅断言存在性，不比对值）",
  },
  /** 生成 edge-case（spec-test/edge 形态） */
  edgeCases: {
    title: "生成 edge-case",
    summary: "按 POST /users 请求体 schema 推导 5 条边界用例",
    cases: [
      { name: "缺失必填 name", category: "missing_required", expect: 400 },
      { name: "age 越界（151）", category: "out_of_range", expect: 400 },
      { name: "age 错误类型（字符串）", category: "wrong_type", expect: 400 },
      { name: "name 空串", category: "empty_string", expect: 400 },
      { name: "tags 超长（6 项）", category: "array_bounds", expect: 400 },
    ],
    note: "全部为一维变异：一次只改一个字段，失败可定位到具体 schema 约束",
  },
  /** 断言失败诊断（assertion/diagnose 形态） */
  diagnosis: {
    title: "AI 断言诊断",
    summary: "tc-010 更新用户-email 格式错误：期望 400 实际 200",
    diagnosis: {
      passed: false,
      root_cause: "contract_break",
      reason: "服务端未校验 email 格式（format=email 约束在实现中缺失），契约被破坏",
      suggestions: [
        "在服务端为 email 字段增加 format 校验后再比对",
        "或修正 spec：移除 format=email，与实现保持一致",
        "将 tc-010 保持 pending，待契约确认后审批",
      ],
      evidence: {
        expected_status: 400,
        actual_status: 200,
        failed_count: 1,
        failures: [
          { target: "status", kind: "status_mismatch", expected: 400, actual: 200, message: "PUT /users/123 期望 400 实际 200", noise: false },
        ],
        summary: "PUT /users/:id body.email=not-an-email 未被服务端拒绝",
      },
    },
  },
};

window.API_DATA = { API_DEFINITIONS, TEST_CASES, COVERAGE, ENVIRONMENTS, SCENARIOS, AI_DEMOS };
