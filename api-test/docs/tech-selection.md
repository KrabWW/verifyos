# 技术选型报告（A1）

> 版本：0.1.0 ｜ 状态：地基已定，业务模块（A2-A9）按里程碑逐步落地。
> 目标：为「AI 化接口测试」独立项目锁定三大技术决策——录制层、断言层、覆盖率数据模型。

---

## 1. 录制层选型：代理起步 / eBPF 后置

### 1.1 候选方案对比

| 维度 | 代理（HTTP/HTTPS MITM Proxy） | eBPF（内核 hook） | SDK / 字节码插桩 |
| --- | --- | --- | --- |
| 代表 | Keploy 代理模式、MeterSphere 代理录制 | Keploy eBPF 模式 | MeterSphere 部分 agent、各语言 APM |
| 侵入性 | 低（被测应用改代理配置 / 透明代理） | 极低（零配置，内核级抓取） | 高（每语言都要适配 agent） |
| 平台支持 | 跨平台（macOS/Linux/Windows） | 仅 Linux 内核 >= 4.14，需 root / CAP_BPF | 视 agent 而定 |
| 覆盖范围 | 应用层 HTTP 明文（TLS 需 MITM 证书） | 可抓 TLS 之前的明文、系统调用级 | 应用层，精度高 |
| 实现成本 | 低（Node 生态成熟，http-mitm-proxy / undici 等） | 高（Go/C 实现，K8s 特权部署复杂） | 高（多语言矩阵） |
| 本地开发体验 | 好（本机即可跑，A2 快速交付） | 差（macOS 上无法本地验证） | 中 |
| 可观测粒度 | 请求/响应全量快照（header/body） | 同左 + 系统调用上下文 | 应用内埋点上下文 |

### 1.2 结论：代理起步 / eBPF 后置

**A2 采用代理模式（HTTP MITM Proxy）**，理由：

1. **跨平台**：macOS 本地开发即可跑通，无需 Linux 特权环境，A2 最快交付可验证成果；
2. **实现成本低**：Node 生态代理库成熟，专注抓取请求/响应全量快照（header/body/query/status/latency）；
3. **可覆盖核心场景**：被测应用通过代理转发（或透明代理），即可获得录制流量，与 Keploy/MeterSphere 的代理模式同构。

**eBPF 作为后置增强（生产环境零侵入）**，理由：

1. 生产环境需要「零配置」抓取时，eBPF 是唯一零侵入方案（对标 Keploy eBPF 模式）；
2. 但受限于「仅 Linux + 特权 + Go/C 实现」，本地开发与 CI 门槛高，作为 A2 之后的增强项（可与代理模式并行，抓取来源字段 `source` 已预留 `proxy | ebpf | sdk`）。

> 落地约束：录制产物统一进 `traffic_record` 表，`source` 字段区分来源，代理/eBPF 两套采集器共享同一数据模型，避免后续切换成本。

---

## 2. 断言层选型

断言按「目标定位 → 取值 → 校验」三件事拆分，分别选型：

| 断言能力 | 选型 | 理由 |
| --- | --- | --- |
| 状态码断言 | 内建（无依赖） | 直接比较 status_code，零成本 |
| JSONPath 取值 | `jsonpath-plus` | 成熟、支持 `$..` 递归/过滤，社区标准，替代手写解析 |
| 字段存在/类型/等值 | 内建 DSL（operator 模型） | `eq/ne/contains/matches/exists/in/gt/lt`，轻量可控，避免重依赖 |
| JSON Schema 校验 | `ajv`（draft-07 / 2020-12） | 事实标准、性能好、支持编译缓存，天然对接 OpenAPI 的 schema |
| Header 断言 | 内建 | 直接读 response_headers，零成本 |
| 延迟断言 | 内建 | 比较 latency_ms 阈值 |

**统一断言对象**（已沉淀进 `src/types/models.ts` 的 `Assertion`）：

```ts
interface Assertion {
  type: 'status' | 'jsonpath' | 'field' | 'schema' | 'header' | 'regex' | 'latency';
  target?: string;                 // jsonpath 路径 / 字段名 / header 名
  operator: 'eq' | 'ne' | 'contains' | 'matches' | 'exists' | 'in' | 'gt' | 'lt';
  expected?: unknown;
  schema?: JsonSchema;             // schema 断言时的 JSON Schema
}
```

> 依赖引入节奏：A1 仅声明 `typescript/tsx/@types/node`；`ajv`、`jsonpath-plus` 在 A3/A7 实现断言引擎时引入，避免过早锁依赖。

---

## 3. 覆盖率数据模型：四张核心表草案

> A1 只出「字段草案」（纯类型定义，见 `src/types/models.ts`），不建库。字段命名 snake_case、时间 ISO 8601、ID 用 UUID，兼容后续 Postgres 或文档库落地。

### 3.1 `api_definition`（API 资产清单，对标 Akto inventory）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string (uuid) | 主键 |
| method | HttpMethod | GET/POST/... |
| path | string | 规范化路径，动态段 `:param`，如 `/users/:id` |
| host | string | 含 scheme，如 `https://api.example.com` |
| version | string? | 服务版本（可选） |
| spec_source | enum | openapi / recorded / manual / spec |
| request_schema | JsonSchema? | 请求体 schema |
| response_schema | JsonSchema? | 响应体 schema |
| content_type | string? | 内容类型 |
| auth_type | enum | none/basic/bearer/api_key/oauth2/cookie/custom |
| tags | string[] | 分组/看板 |
| status | enum | active / deprecated |
| sample_count | number | 关联流量样本数（冗余聚合） |
| created_at / updated_at | string | 审计 |

### 3.2 `traffic_record`（流量事实，对标 Keploy 录制产物）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string (uuid) | 主键 |
| api_definition_id | string? | 关联 API（可为空，表示未归并新接口） |
| timestamp | string | 录制时间 |
| method / path / host | — | 请求标识 |
| query_params | Record<string, string[]> | 查询参数 |
| request_headers | Record<string, string> | 请求头 |
| request_body | string? | 请求体 |
| status_code | number | 响应状态码 |
| response_headers | Record<string, string> | 响应头 |
| response_body | string? | 响应体 |
| latency_ms | number | 延迟 |
| source | enum | proxy / ebpf / sdk |
| trace_id | string? | 链路 ID |
| noise_flag | boolean | 是否噪音（A3 产物） |
| created_at / updated_at | string | 审计 |

### 3.3 `test_case`（测试用例）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string (uuid) | 主键 |
| api_definition_id | string | 关联 API |
| name / description | string / string? | 名称/描述 |
| request | object | method/path/query_params/headers/body |
| assertions | Assertion[] | 断言列表（见第 2 节） |
| variables | Record<string, string> | 变量（A8 场景编排用） |
| source | enum | recorded / spec / ai / manual |
| tags | string[] | 标签 |
| last_result | enum | pass / fail / pending |
| created_at / updated_at | string | 审计 |

### 3.4 `coverage`（覆盖事实，支撑 A5 看板）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string (uuid) | 主键 |
| api_definition_id | string | 关联 API |
| status_code | number | 被测响应码（覆盖维度之一） |
| covered | boolean | 该维度是否已覆盖 |
| test_case_id | string? | 覆盖该维度的用例 |
| last_tested_at | string? | 最近被测时间 |
| api_coverage_rate | number | 该 API 整体覆盖率 0-1（冗余聚合） |
| spec_path_coverage | Record<string, boolean>? | 路径/字段级覆盖（A6） |
| created_at / updated_at | string | 审计 |

### 3.5 关系概览

```
api_definition (1) ──< traffic_record (N)
api_definition (1) ──< test_case      (N)
api_definition (1) ──< coverage       (N)
test_case      (1) ──  coverage       (N, 记录「哪个用例覆盖了哪个维度」)
```

---

## 4. 决策汇总

| 决策点 | 结论 | 一句话理由 |
| --- | --- | --- |
| 录制层 | 代理起步 / eBPF 后置 | 跨平台、成本低、A2 最快交付；eBPF 仅 Linux+特权，作生产增强 |
| 断言层 | ajv + jsonpath-plus + 内建 DSL | 三件事拆分：定位(JSONPath)/取值(字段)/校验(schema/状态码)，最小重依赖 |
| 数据模型 | 四表：api_definition / traffic_record / test_case / coverage | 资产/流量/用例/覆盖分离，冗余聚合字段支撑看板 |
| 目录位置 | 根目录 `api-test/`（不在 pnpm workspace glob 内） | 真独立，`pnpm -r` 不触碰，零改动主仓库 |
| 依赖管理 | npm（避开 pnpm deps 校验） | 环境约定：禁用 pnpm |
