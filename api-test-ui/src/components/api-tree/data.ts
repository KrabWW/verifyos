/**
 * demo 数据：与 demo.ts 的 5 API 数据集保持一致，扩展至 10 条、3 分组。
 */
import type { ApiDefinition, ApiGroup, MockResponse, RequestState } from "./types";

export const DEMO_GROUPS: ApiGroup[] = [
  { id: "users", name: "用户模块 users" },
  { id: "auth", name: "认证模块 auth" },
  { id: "orders", name: "订单模块 orders" },
];

export const DEMO_APIS: ApiDefinition[] = [
  { id: "u-01", name: "用户列表", method: "GET", path: "{{base}}/users", groupId: "users", status: "full", description: "分页查询用户" },
  { id: "u-02", name: "用户详情", method: "GET", path: "{{base}}/users/:id", groupId: "users", status: "full" },
  { id: "u-03", name: "创建用户", method: "POST", path: "{{base}}/users", groupId: "users", status: "partial", description: "缺边界值用例" },
  { id: "u-04", name: "更新用户", method: "PUT", path: "{{base}}/users/:id", groupId: "users", status: "partial" },
  { id: "u-05", name: "删除用户", method: "DELETE", path: "{{base}}/users/:id", groupId: "users", status: "none" },
  { id: "a-01", name: "登录", method: "POST", path: "{{base}}/auth/login", groupId: "auth", status: "full" },
  { id: "a-02", name: "刷新令牌", method: "POST", path: "{{base}}/auth/refresh", groupId: "auth", status: "partial" },
  { id: "a-03", name: "登出", method: "DELETE", path: "{{base}}/auth/token", groupId: "auth", status: "none" },
  { id: "o-01", name: "订单列表", method: "GET", path: "{{base}}/orders", groupId: "orders", status: "full" },
  { id: "o-02", name: "创建订单", method: "POST", path: "{{base}}/orders", groupId: "orders", status: "none", description: "待补测试" },
];

export const METHOD_ORDER = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

/** 由 ApiDefinition 构造请求编辑器初始态 */
export function requestFromApi(api: ApiDefinition): RequestState {
  const base: RequestState = {
    method: api.method,
    url: api.path,
    params: [],
    headers: [{ id: "h1", key: "Content-Type", value: "application/json", enabled: true }],
    bodyType: "none",
    body: "",
    auth: { type: "none", token: "", username: "", password: "", keyName: "X-API-Key", keyValue: "" },
    assertions: [],
    preScript: "",
    postScript: "",
  };
  const q = api.path.split("?")[1];
  if (q) {
    base.params = q.split("&").map((pair, i) => {
      const [k, v = ""] = pair.split("=");
      return { id: `p${i}`, key: decodeURIComponent(k), value: decodeURIComponent(v), enabled: true };
    });
  }
  if (api.method === "POST" || api.method === "PUT" || api.method === "PATCH") {
    base.bodyType = "json";
    base.body =
      api.groupId === "auth"
        ? '{\n  "username": "{{username}}",\n  "password": "{{password}}"\n}'
        : '{\n  "name": "示例数据",\n  "amount": 199\n}';
    base.assertions = [
      { id: "as1", target: "status", op: "equals", value: "200" },
      { id: "as2", target: "body.data.id", op: "exists", value: "" },
    ];
  } else {
    base.assertions = [{ id: "as1", target: "status", op: "equals", value: "200" }];
  }
  if (api.groupId !== "auth") {
    base.auth = { ...base.auth, type: "bearer", token: "{{access_token}}" };
  }
  return base;
}

/** 选中「登录」时的默认响应演示数据 */
export const DEMO_RESPONSE: MockResponse = {
  status: 200,
  statusText: "OK",
  timeMs: 342,
  sizeBytes: 1284,
  headers: [
    { key: "content-type", value: "application/json; charset=utf-8" },
    { key: "x-request-id", value: "req-9f3ab2c7" },
    { key: "x-ratelimit-remaining", value: "58" },
    { key: "cache-control", value: "no-store" },
    { key: "date", value: "Tue, 08 Sep 2026 07:12:04 GMT" },
  ],
  body: {
    code: 0,
    message: "success",
    data: {
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTIwMDEifQ.3KqT9m",
      refresh_token: "rt_8f2e1a90",
      token_type: "Bearer",
      expires_in: 7200,
      user: { id: "u-2001", name: "xielaoban", roles: ["admin", "tester"] },
    },
  },
  timing: { dns: 12, connect: 28, tls: 45, firstByte: 189, total: 342 },
};
