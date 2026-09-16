# QA.tech 深度调研（2026-09-03）

> 来源：qa.tech 首页全文案、42 个 use-cases 汇总页、docs.qa.tech 三篇核心文档（Crawling Sessions / Test Dependencies / Applications & Environments）。
> 用途：反推实现架构，修正我们的对象模型与实现方案。

---

## 1. 产品定位与价值叙事（首页）

- 定位语：**"The product excellence platform"** —— QA agents that **act like your customers**
- 三类触发：**dynamic tests on each pull request · a full pass on merge · scheduled runs against production**
- 能力范围：Web / Mobile web / iOS / Android
- 关键声明：
  - **"No access to code required"** —— 纯黑盒
  - **"No selectors, no scripts — goals, not steps"** —— Goal-driven 而非步骤驱动
  - **"Cloud-native execution"** —— SaaS 云执行（→ 我们的私有化是明确差异化）
  - SOC 2 Type 2 / SSO / SAML / 数据不用于训练
- 价值叙事：320h/月（Upsales CRM ~150 人）、390h/季（Pricer 电子价签 ~200 人）、ROI 529%、回本期 3 个月
- **知识积累**："Every briefing adds to what agents know and sticks across every run"——对话中的业务规则会沉淀为 Agent 的长期上下文（我们的"需求文档/对话知识库"对齐）

## 2. 42 个用例 → 能力清单（我们尚未覆盖的）

| 能力 | 说明 | 我们的对应 | 优先级 |
|---|---|---|---|
| **Multi-Actor 多用户测试** | 两个 Agent 隔离会话并行（一人提交一人审批） | 无（Actor 只有单角色） | P1 —— 依赖链模型顺带实现 |
| **WCAG 无障碍自动检查** | 每次 Run 自动附带 a11y 检测 | 无 | P1 —— axe-core 一行接入，低成本高卖点 |
| **Analytics 埋点验证** | 完成真实流程后验证埋点请求是否发出（URL/method/status） | 无 | P1 —— 就是 Network 证据 + 断言，http 工具可承载 |
| **API Application 测试** | 独立 Agent：HTTP 请求 + 隔离代码沙箱执行验证，不开浏览器 | 无（只有 http 工具） | P2 —— Phase 3 |
| **Test Plan**（环境+设备配置集） | 同一批用例按不同 Plan 跑不同环境/设备 | 无 | P2 |
| **Device Preset** 设备预设 | 跨设备测试的配置载体 | 移动屏单设备 | P2 |
| **iFrame/嵌套内容**、Feature Flag A/B、File Upload/Export、Drag&Drop/Kanban | 场景库细节 | 无 | P3 —— 逐步补场景模板 |
| Voice/Email/SMS | 语音与通知渠道 | 无 | P3 —— 低优先级 |
| **QA for AI-Generated Code (MCP)** | 他们也把 MCP 作为能力交付方式 | 我们 §8.4 已选 MCP | ✓ 方向验证 |

## 3. 文档站反推出的系统模型（核弹级）

### 3.1 对象层级

```
Organization（计费/团队）
└── Project（完全隔离）
    └── Application（Web / Mobile / API 三类型，各有独立测试套件）
        └── Environment（同应用的不同部署：dev/staging/prod/market/preview）
```

- **API Application**：专用 Agent 发 HTTP 请求 + **隔离代码沙箱**执行验证代码，不开浏览器
- **Mobile Environment**：选主 build，可再 pin ≤3 个 other app builds（配套 App 同机）
- 黄金法则：能共享用户流程才同 Project；不同产品线 = 不同 Application

### 3.2 依赖模型（Test Dependencies）

| 类型 | 语义 | 数量 | 适用 |
|---|---|---|---|
| **Resume From** | 继承浏览器状态（cookies/localStorage/sessionStorage）+ 输出数据；**6 小时内成功状态立即复用**，过期/失败则依赖先重跑 | 恰好 1 个 | 同用户链（登录复用）；仅同 Environment（跨 Application 可以，跨 Environment 不行；跨域不行）；**Mobile 不支持** |
| **Wait For** | 只保证执行顺序 + 传数据，全新浏览器会话 | 多个 | 跨用户/跨应用/跨域协调 |

- **数据共享两机制**：**Output Values**（Agent 显式保存的字符串值，跨会话/跨应用通用）vs **Clipboard**（同会话链自动保存恢复）
- **并发模型**：独立依赖链**并行**（隔离 BrowserContext），链内串行；无链上限时自动扩容；per-environment 并发上限可配，排队执行，多环境取最低值
- **Multi-Actor 模式**：每用户一条链（各自 root login test），链间 Wait For 传 output values

### 3.3 Preview Environments（PR 测试的真实实现机制）

**没有独立的"PR 功能"——Preview 只是 Environment 的一种临时实例**：

- Start Run API 传 `applications[].environment.url` override → 自动创建 `is_preview: true` 环境 + 关联 branch/PR metadata
- CI/CD（GitHub Actions / GitLab CI dotenv artifacts）把 preview URL 传给 API 即可
- 管理：Settings → Applications 里的 Preview Environments 卡片（Promote to Custom / Delete）

→ 我们的 PR 验证（§4.14）应按此建模：**Run 请求允许环境 URL override，override 时落一条 preview 环境记录**。

### 3.4 Test Plan 与参数优先级

- Test Plan = per-application 的 **environment + device preset** 配置集
- 优先级：**Project defaults < Test plan parameters < Per-run API overrides**

### 3.5 Crawling（探索）

- 参数：Start URL / Max Depth(0-10, 默认1) / Max Actions(1-1000, 默认300) / **Crawling Intent（≤500 字符意图引导）** / Output State（从某测试最终浏览器状态恢复）
- 结果 Iteration：Screenshot + Source Action + Depth + Found Actions + **Intent Score（0-40% low / 41-70% moderate / 71-100% high）**——分档阈值与我们原型一致 ✓

### 3.6 资源 ID 体系

`testPlanShortId` / `applicationShortId` / `environment.shortId` —— 短 ID 风格（`pln_abc123` / `app_abc123`），前缀语义化。

## 4. 对我们对象模型的修正（必须落 PRD）

| 项 | 我们现状 | 修正 |
|---|---|---|
| 层级 | Project → （直接是 URL/测试） | 补 **Application（Web/Mobile/API 三类型）→ Environment（含 preview）** 两层 |
| 依赖 | 只有"认证即状态"（= Resume From） | 补 **Wait For**（顺序+数据，新会话）+ **Output Values**（跨会话传值）+ **Clipboard**（同会话）+ **6h 状态复用窗口** + 依赖链并发模型 |
| PR 测试 | 独立 PR 流水线概念 | 改为 **Preview Environment**（Run 请求环境 URL override 自动落记录） |
| API 测试 | http 工具 | 升级为 **API Application**（HTTP + 代码沙箱验证） |
| 触发 | 手动/定时/PR | 三触发同构：manual / schedule(production) / PR(preview)，都是 Run + 环境选择 |
| 设备 | 单设备环境卡 | 补 **Device Preset** |
| 并发 | 未设计 | per-environment 上限 + 链内串行/链间并行 |
| 复用窗口 | 未定义 | Resume From 状态 **6 小时**内有效 |

## 5. 结论

1. 我们 V1 的六层架构与 QA.tech 实际模型**方向一致**（Crawler/依赖/事件流/证据链全部对上），但**对象模型需要按 §4 表修正**——Application/Environment 分层和依赖双类型是它产品化的骨架
2. **Run 事件协议 + 依赖链调度（Resume From/Wait For）应成为 W2-3 的核心交付**，而不是只写"认证即状态"
3. PR 验证按 Preview Environment 机制实现，工作量比独立流水线小得多
4. 低成本高价值增量：WCAG 自动检查（axe-core）、Analytics 埋点断言、Multi-Actor——均可挂在现有工具层
