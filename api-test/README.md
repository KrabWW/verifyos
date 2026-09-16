# VerifyOS API Test

独立于 VerifyOS 主仓库的「AI 化接口测试」项目。成熟后通过微前端（qiankun / Module Federation）合并进统一控制台。

## 定位

缝合业界三大能力，做成一体化的接口测试体验：

| 能力 | 说明 | 对标 |
| --- | --- | --- |
| 流量录制 → 测试 | 录制真实流量，自动生成测试用例（含噪音检测 + mock） | Keploy |
| API inventory + 覆盖率 | 接口资产自动发现 + 覆盖率看板 | Akto |
| spec → AI 生成 edge-case | 从 OpenAPI spec 生成边界用例 | Schemathesis / Postman Agent Mode / Bruno |

## 目录独立性说明

本项目放在仓库根目录 `api-test/`，**不在** `pnpm-workspace.yaml` 的 glob（`apps/*`、`packages/*`）之内：

- 使 `pnpm -r` 不会触碰本项目，真正做到「独立项目、独立依赖、独立技术栈」；
- 不需要修改 VerifyOS 主仓库任何现有文件（`apps/`、`packages/agent-core`、`packages/cli`、`packages/shared` 均未改动）；
- 依赖用 **npm** 管理（主仓库 pnpm 的 deps 校验在当前环境不可用，本项目避开）。

## 技术栈（A1 已定）

- 运行时：Node.js >= 22，ESM（`"type": "module"`）
- 语言：TypeScript（strict + NodeNext）
- 开发运行：tsx（`tsx watch`）
- 编译：tsc（`outDir: dist`）
- 录制层：**代理起步 / eBPF 后置**（A2 落地代理模式）
- 断言层：ajv（JSON Schema）+ jsonpath-plus（JSONPath）+ 内建断言 DSL（A3/A7 引入）
- 覆盖率数据模型：四张核心表（见下）

详见 [`docs/tech-selection.md`](./docs/tech-selection.md)。

## 核心数据模型（四张表草案）

| 表 | 职责 | 对标 |
| --- | --- | --- |
| `api_definition` | API 资产清单（method/path/schema/auth 等） | Akto inventory |
| `traffic_record` | 流量事实（请求/响应快照、噪音标记） | Keploy 录制产物 |
| `test_case` | 测试用例（请求 + 断言列表 + 来源） | 测试主体 |
| `coverage` | 覆盖事实（某 API 某响应维度是否被测） | 覆盖率看板 |

字段草案见 `src/types/models.ts`（纯类型定义，A1 不建库）。

## 目录结构

```
api-test/
├── package.json
├── tsconfig.json
├── README.md
├── docs/
│   └── tech-selection.md        # 技术选型报告
├── extension/                   # Chrome MV3 插件（P1.1：DevTools panel 捕获 HTTPS 明文）
└── src/
    ├── index.ts                 # hello 入口（打印版本/能力/四表）
    ├── version.ts               # 项目元信息
    ├── types/
    │   └── models.ts            # 四表类型草案
    ├── recorder/                # 录制层（A2：代理模式流量录制）
    ├── generator/               # 生成层（A3：录制→测试 + 噪音检测 + mock）
    ├── cli/
    │   ├── record.ts            # 录制器手动 CLI（起代理→录制→Ctrl+C 导出）
    │   ├── generate.ts          # 测试生成 CLI（recording.json → test-cases.json）
    │   └── import-har.ts        # 插件/HAR 流量导入 CLI（P1.1）
    ├── assertion/               # 断言层（A7：schema 级断言生成 + 失败诊断 + 接受/拒绝）
    ├── inventory/               # inventory（A4）
    ├── coverage/                # 覆盖率（A5）
    └── scenario/                # 场景编排 + 环境变量 + 报告（A8）
scripts/
├── verify-record.ts             # A2 验收自验证（curl 走代理闭环）
├── verify-record-to-test.ts     # A3 验收自验证（录制→生成 + 噪音检测命中）
├── verify-ai-assert.ts          # A7 验收自验证（断言生成 + 失败诊断 + 接受/拒绝）
├── demo-classify.ts             # P1.2 验收（录制时 3 类请求分级）
├── test-mock-schema.ts          # P1.3 验收（结构化 mock：schema 提取→回放）
└── check-import.ts              # P1.1 验收（import:har 导入可见性检查）
```

## 快速开始

```bash
# 使用指定 Node（环境约定）
export PATH="/Users/xielaoban/.workbuddy/binaries/node/versions/22.22.2-2/bin:$PATH"

npm install          # 安装 devDependencies（typescript/tsx/@types/node）
npm run dev          # 开发运行（tsx watch，打印 hello 信息）
npm run typecheck    # 类型检查（零错）
npm run build        # 编译到 dist/
npm run start        # 运行编译产物
```

## spec → edge-case 生成（A6）

**能力**：读 OpenAPI spec，从每个 operation 规则式生成三类用例（复用 `test_case` 模型）：

- **happy-path**：按参数/请求体 schema 取合法样例值，断言 2xx；
- **edge-case**：边界用例（缺失必填 / 空字符串 / 越界数字 / 错误类型 / 非法枚举 / 数组越界），断言 4xx；
- **fuzz**：属性测试式采样（随机 + 边界组合），断言非 5xx，命中 500/schema 违规即报。

对标 Schemathesis / Postman Agent Mode。AI 增强（LLM）预留了 `LlmEnhancer` 接口，但当前 api-test 无 LLM 配置，本版用确定性规则实现（LLM 后置）。

```bash
npm run demo:spec-test    # 喂 5-operation spec → 生成 happy-path + edge-case + fuzz 并断言类别齐全
```

## AI 断言生成 + 失败诊断（A7）

**能力**：从真实响应生成 schema 级断言（字段类型/存在性/取值，比泛泛 status 检查更细）；测试失败时诊断根因并给修复建议。

- **断言生成**（`generateSchemaAssertions`）：喂真实响应 JSON + 可选预期断言，规则式推导每个叶子字段的三类断言——存在性（`exists`）、类型（`schema` + `target`）、取值（`eq`，仅非噪音字段）；噪音字段（时间戳/随机 ID/token）标 `mode: ignore` 仅断言存在性。LLM 增强预留 `llm()` 参数，本版规则式实现（api-test 无 LLM 配置，后置接入）。
- **失败诊断**（`diagnoseFailure`）：对比期望断言 vs 实际响应，输出失败字段 diff + 根因分类：
  | 根因 | 判定 |
  | --- | --- |
  | `contract_break` 契约破坏 | 字段类型变化 / 稳定字段缺失 / 状态码 4xx |
  | `business_change` 业务变更 | 稳定字段值变化但结构一致 |
  | `environment_diff` 环境差异 | 噪音字段缺失/变化 / 状态码 5xx |
  诊断结果附带证据（请求/响应 diff 摘要，逐字段列出期望 vs 实际）。
- **断言接受/拒绝**（`acceptAssertions` / `rejectAssertions` / `reviewAssertions`）：生成的断言可 accept（写入 `TestCase`）/ reject（移除）。

对标 Hoppscotch 断言生成 + Postman 失败诊断。模块位于 `src/assertion/`。

```bash
npm run verify:ai-assert   # 真跑：响应 → schema 级断言 + 失败诊断（缺字段/类型变/值变/5xx）+ 接受/拒绝
```

## 流量录制（A2：代理模式）

**能力**：HTTP 代理录制真实流量 → 落 `traffic_record` → 按 method+path 归组去重为「API 集合」→ 导出。

**用法**：

```bash
npm run record -- --port 8008          # 起代理 + 演示目标服务（Ctrl+C 停止并导出 data/recording.json）

# 另开终端，让 curl 走代理发请求（HTTP 明文）
curl -x http://127.0.0.1:8008 http://127.0.0.1:9009/users/1
curl -x http://127.0.0.1:8008 -d '{"a":1}' -H 'Content-Type: application/json' http://127.0.0.1:9009/orders
```

**自动验证**（curl 走代理 → 记录 → 归组去重断言 → 持久化重载）：

```bash
npm run verify:record
```

**录制时请求分级（P1.2）**：噪音检测前移到录制时——每条流量入 session 即分级（`src/recorder/classify.ts`），`TrafficRecord` 新增可选字段 `request_class`（`top_level` 导航主文档 / `ajax` XHR/fetch 接口 / `embedded` 静态资源）与 `is_noise`（embedded 及 CONNECT 隧道元数据视为噪音）。分级依据：`sec-fetch-dest` / `X-Requested-With` / `accept` 形态 / 静态扩展名与 Content-Type（代理层拿不到浏览器内部 ResourceType，为启发式）。

```bash
npm run demo:classify   # 3 类请求 → 分级正确（单元级 + curl 走代理端到端）
```

**存储选择**：轻量起步用「内存数组 + JSON 文件落盘」（`JsonFileRecordStore`），通过 `RecordStore` 接口隔离，后续可平滑替换为 SQLite（单文件、无服务）或 Postgres（多会话 + 看板聚合）。当前为单会话模型（`start()` 清空旧数据）。

**HTTPS 限制（诚实说明）**：代理对 HTTPS 走 CONNECT 隧道，TLS 端到端加密，代理只能记录元数据（目标 `host:port`、隧道建立耗时），**拿不到内层 method/url/status/body**。若要 HTTPS 明文需 MITM（生成自签 CA 并让客户端信任证书），属后续增强项。**P1.1 起可用 Chrome 插件通道补齐 HTTPS 明文**（见下节）。

## Chrome 插件录制通道（P1.1：HTTPS 明文）

**能力**：通过 Chrome DevTools panel（`chrome.devtools.network.getHAR()`）捕获浏览器流量——DevTools 在浏览器内部解码，**HTTPS 请求/响应 body 均为明文**，补齐代理模式的 HTTPS 盲区。导出的 JSON 符合 `TrafficRecord` 结构，可直接导入现有 session 存储，与代理录制产物同一条「录制→生成」链路。

**安装（加载未打包插件）**：

1. 打开 Chrome，访问 `chrome://extensions/`；
2. 右上角开启「开发者模式」；
3. 点「加载已解压的扩展程序」，选择本项目 `api-test/extension/` 目录；
4. 打开任意目标网站，按 F12（打开 DevTools），顶部 tab 栏出现「VerifyOS 录制」panel。

**使用**：

1. 在「VerifyOS 录制」panel 中操作页面，流量实时列出（含分级标记：ajax / top_level / embedded-noise，可勾选「隐藏噪音」）；
2. 点「导出 JSON」，保存 `verifyos-traffic-<时间戳>.json`；
3. 项目内导入：

```bash
npm run import:har -- ~/Downloads/verifyos-traffic-xxxx.json   # 默认写入 data/recording.json
npm run gen                                                    # 从导入的会话生成测试用例
```

`import:har` 同时兼容两种输入：插件导出的 `{ records: [...] }`（TrafficRecord 数组）与 DevTools Network 面板手动导出的标准 HAR（`{ log: { entries: [...] } }`）。仓库内有可复跑样例：`npm run import:har -- data/sample.har.json`。

**验证**（mini HAR 样例 → 导入 → session 可见 → gen 生成）：

```bash
npm run import:har -- data/sample.har.json --out data/recording.json
npx tsx scripts/check-import.ts   # 断言导入记录可见 + 分级正确 + source=extension
```

**说明**：捕获基于 DevTools HAR（浏览器已解码视图），巨大响应的 body 可能被 DevTools 省略——与 Network 面板所见一致，诚实不补造。WebSocket 直连转发为后置项，当前以「文件导出 + 导入」闭环。

## 录制 → 自动生成测试（A3：噪音检测 + mock）

**能力**：把 A2 录制的流量（`RecordingSession.export()` 产物）一键转成可回放的测试用例：
每个 API 组一条 happy-path 用例（请求快照 + 断言），噪音字段标「忽略」而非「严格相等」，生成依赖 mock。

**噪音检测**（降低 flake，对标 Keploy traffic-to-tests）：

| 噪音类型 | 命中规则 | 断言处理 |
| --- | --- | --- |
| 时间戳 | ISO8601 字符串 / 数字时间戳（秒/毫秒） | `mode: ignore`（仅断言存在性） |
| 随机 ID | UUID / 长 hex（mongo ObjectId 等）/ 自增整数 ID（id、*_id） | `mode: ignore` |
| token | authorization 等 header、body/query 里的 token/secret/password 字段 | 断言 ignore + 请求快照脱敏 `<REDACTED>` |

**用法**：

```bash
npm run record                       # A2 录制 → 导出 data/recording.json
npm run gen                          # 读取 data/recording.json → 生成 data/test-cases.json
```

**自动验证**（代理 → curl 走代理发含噪音流量的请求 → 生成用例 → 噪音标 ignore / 非噪音严格相等断言）：

```bash
npm run verify:record-to-test
```

**生成结果结构**（`src/generator/`）：

- `test_case`：请求快照 + 断言列表（status 严格相等 + schema 摘要 + 字段级断言）；
- `noise_findings`：被标忽略的字段明细（位置/规则/脱敏样例）；
- `mocks`：依赖 mock（目标服务响应快照 + body 中指向其它 host 的下游引用）。

**结构化 mock（P1.3 精度提升）**：响应 body 为 JSON 时不再「快照原样存死值」，而是解析为 schema 树（字段名 + 类型 + 样例值），mock 记录 schema 而非死值；回放时（`materializeMockResponse`）按 schema 生成——稳定字段保留录制样例值，动态字段（时间戳/随机 ID/token）用类型一致的占位（如 UUID 全零、ISO epoch），敏感原值不入 mock 产物。旧格式死值快照仍可原样回放（向后兼容）。

```bash
npm run test:mock-schema   # 复杂嵌套 JSON → schema 提取 → 回放生成 + 向后兼容单测
```

**诚实说明（caveat）**：噪音检测均为启发式，存在误判（如把普通日期当时间戳）；依赖 mock 仅能快照「客户端↔目标服务」这一层，看不到目标服务内部的 DB/下游调用。因此生成的用例 `review_status` 恒为 `pending`，**AI 生成仍需人审**后再入库。

## 场景编排 + 环境变量 + 报告（A8）

**能力**：把多个接口（复用 A3 的 `test_case`）按序串成场景，支持「前置提取变量传递」与「多环境切换」，跑完产出接口报告。对标 MeterSphere / Apifox。

- **场景编排**：`Scenario` = 有序 `ScenarioStep`（用例 + 变量提取）；前一个接口响应的某字段（JSONPath）提取为变量，供后续接口的 path / headers / body / query 用 `{{name}}` 引用（如登录拿 token → 后续 `Authorization: Bearer {{token}}`）。
- **环境变量**：`Environment` = name + baseURL + vars 字典，`EnvironmentStore` 支持多环境存储/切换；变量优先级：环境变量（最低）< 用例自带 `variables`（中）< 前置提取变量（最高）。
- **接口报告**：跑完产出 `ScenarioReport`（每接口 pass/fail + 断言明细 + 耗时），可导出 md / json / junit。

**用法**：

```bash
npm run demo:scenario   # 2 接口场景（登录拿 token → 用 token 查列表）+ 多环境切换 + 报告导出，自验证
```

**模块结构**（`src/scenario/`）：

- `types.ts`：`Scenario` / `ScenarioStep` / `VariableExtraction` / `Environment` / `ScenarioReport`；
- `engine.ts`：`ScenarioRunner`（按序执行 + 变量渲染/提取/合并 + 报告汇总）；
- `environment.ts`：`EnvironmentStore`；`transport.ts` + `mock.ts`：传输抽象 + 内存 mock 执行器；
- `jsonpath.ts` + `template.ts`：JSONPath 取值 + `{{var}}` 渲染；
- `assert.ts`：场景内最小断言评估（status/jsonpath/field/header/schema 轻量检查）；
- `report.ts`：`reportToMarkdown` / `reportToJson` / `reportToJunit`。

**诚实说明（caveat）**：本阶段 JSONPath 仅支持「单条取值」（`$.a.b[0]`，不含通配符/过滤器），覆盖变量提取所需最小集；断言评估为场景出报告所需的最小实现，A7 引入 ajv + jsonpath-plus 完整引擎后可平滑替换。

## 微前端整合方案（A9）

**结论**：选 **qiankun**（single-spa 体系）而非 Module Federation——主应用 `apps/web` 是 Vite，qiankun 对主应用构建工具零要求，子应用（api-test 未来 Web UI）用 Vite + `vite-plugin-qiankun`；MF 需主/子全迁 webpack 5，改造成本高。

- 主/子划分：壳（导航/概览/全局设置）归主应用；录制/清单/覆盖率/用例/场景/报告归子应用，挂载在 `/api-test/*` 前缀；
- 鉴权：token 透传（`props.getToken()`）+ 同源 cookie 兜底，登录只归主应用；
- 样式隔离：`at-` 前缀 + CSS Modules + 复用主应用 CSS 变量；
- 通信：`initGlobalState` + `verifyos:*` 事件总线。

详见 [`docs/microfrontend.md`](./docs/microfrontend.md)；静态演示 [`docs/microfrontend-demo.html`](./docs/microfrontend-demo.html)（单文件，壳 + 子应用占位 + qiankun 关键配置片段）。

## 里程碑

- [x] A1 脚手架 + 技术选型（本阶段）
- [x] A2 流量录制（代理模式）← A1
- [x] A3 录制 → 自动生成测试（噪音检测 + mock）← A2
- [ ] A4 API inventory 自动发现 ← A1
- [ ] A5 覆盖率看板 ← A4
- [x] A6 spec → AI 生成 edge-case ← A4
- [x] A7 AI 断言生成 + 失败诊断 ← A3
- [x] A8 场景编排 + 环境变量 + 报告 ← A3
- [x] A9 微前端整合方案（双方成熟后落地）

优先级：P0 录制→测试（A1-A3）→ P1 发现+覆盖（A4-A5）→ P2 AI 生成（A6-A7）→ P3 编排+微前端（A8-A9）。
