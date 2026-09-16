/**
 * verifyos api-test-ui — 组件域类型定义（eng-api-tree 局部版）。
 * 说明：eng-shell 的 src/types.ts 尚未就绪，为保持组件独立可编译，
 * 类型暂放此处；后续合并时由统一 types 取代（同名同形，迁移零成本）。
 */

/* ============ 基础 ============ */

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** 覆盖状态：full=全测试用例覆盖 / partial=部分 / none=未测 */
export type CoverageStatus = "full" | "partial" | "none";

/* ============ 资产树 ============ */

export interface ApiGroup {
  id: string;
  name: string;
  /** 折叠默认态 */
  defaultCollapsed?: boolean;
}

export interface ApiDefinition {
  id: string;
  name: string;
  method: HttpMethod;
  path: string;
  /** 所属分组 id */
  groupId: string;
  status: CoverageStatus;
  description?: string;
}

/* ============ 请求编辑器 ============ */

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type BodyType = "none" | "json" | "form-data" | "raw";

export type AuthType = "none" | "bearer" | "basic" | "api-key";

export interface AuthState {
  type: AuthType;
  token: string;
  username: string;
  password: string;
  keyName: string;
  keyValue: string;
}

export interface Assertion {
  id: string;
  /** 断言目标：如 status / body.user.id / headers.Content-Type */
  target: string;
  /** 比较符 */
  op: "equals" | "not-equals" | "contains" | "gt" | "lt" | "exists";
  value: string;
}

export interface RequestState {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
  auth: AuthState;
  assertions: Assertion[];
  /** 前置脚本 */
  preScript: string;
  /** 后置脚本 */
  postScript: string;
}

/* ============ 响应查看器 ============ */

export interface ResponseHeader {
  key: string;
  value: string;
}

/** 耗时分解（ms） */
export interface TimingBreakdown {
  dns: number;
  connect: number;
  tls: number;
  firstByte: number;
  /** 总耗时（≥ 上述之和） */
  total: number;
}

export interface MockResponse {
  status: number;
  statusText: string;
  /** 总耗时 ms */
  timeMs: number;
  /** 响应体大小（字节） */
  sizeBytes: number;
  headers: ResponseHeader[];
  body: unknown;
  timing: TimingBreakdown;
}
