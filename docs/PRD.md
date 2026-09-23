# 中文 AI 测试平台产品需求文档（PRD V0.1）

> 工作名：**VerifyOS**（临时名，仅用于沟通，最终名称待定）
> 版本：V0.1（原型阶段）
> 定位依据：QA.tech（Discovery 范式）+ Momentic（Execution 范式）的中文复刻与整合
> 本文档由两段竞品深读会话结论整理而成，是原型设计与开发排期的唯一依据。

---

## 0. 一句话产品定义

> **用户告诉系统"我要验证什么"，系统自动探索应用、发现 QA 点、生成验证、执行并给出证据与判定。**

产品不是"测试用例管理平台"，而是：

```
发现 QA 点 → 创建验证 → 执行验证 → 查看证据
```

这条主线贯穿一切页面与交互。

---

## 1. 产品概述

### 1.1 背景

QA.tech 与 Momentic 已验证了第一代 AI 测试产品的两种成熟范式：

| 维度 | QA.tech | Momentic |
|---|---|---|
| 本质 | AI QA Agent（AI QA 团队） | AI Test Runtime（AI 原生测试运行时） |
| 第一价值 | "不知道该测什么" → 帮我发现 | "测试怎么可靠跑" → 帮我稳定执行 |
| 入口 | App / Chat / PR | Repo / CLI / MCP / PR |
| 知识结构 | Knowledge Graph（核心） | App Graph + Cache |
| 测试形态 | 隐藏在平台内 | YAML 文件在仓库 |
| 执行 | Cloud-first | CLI-first |
| 自愈 | 核心 | 核心（Cache replay → cache miss → AI heal） |
| Failure Triage | 强 | 非常强（分类/隔离/修复） |

**我们的判断**：两者的产品形态已足够成熟，第一阶段不做 UI 创新，直接复刻其已验证的交互范式，做**中文、私有化友好**的版本。

### 1.2 目标用户

| 角色 | 核心诉求 | 使用频率 |
|---|---|---|
| QA 工程师 | 不知道漏测什么；失败后想知道"哪里坏了" | 每天 |
| 测试负责人 | 覆盖率可视、风险可量化、汇报有证据 | 每周 |
| 开发工程师 | PR 来了想知道"这次改动安不安全" | 每次 PR |
| 产品经理 | 需求是否被完整实现和验证 | 每迭代 |

### 1.3 差异化（不做简单翻译）

保留已验证的：信息架构 / 交互模式 / Agent 操作模型 / Run Viewer / Graph。
差异化放在：

- 中文 PRD 与中文业务语义理解
- 飞书文档 / Figma / 禅道 / GitLab（私有化 Git）生态
- 企业内网、私有化部署
- 国产大模型适配
- Java / Spring Boot / Vue 技术栈团队友好

### 1.4 非目标（第一版明确不做）

- 不做移动端 App 测试（Appium/Maestro 后置）
- 不做性能/压力测试
- 不做 UI 创新（不发明新范式，先复刻）
- 不做多租户 SaaS（先私有化单租户）

---

## 2. 核心概念与对象模型

### 2.1 概念定义

| 概念 | 定义 | 来源 |
|---|---|---|
| **Requirement** | 需求条目（来自 PRD/飞书/Figma 等） | 文档解析 |
| **QA Point（QA 点）** | 一个值得被验证的业务/功能事实 | AI 提取 + 人工确认 |
| **Verification（验证）** | QA 点的可执行验证方案（步骤序列 + 断言） | AI 生成 + 人工编辑 |
| **Run（执行）** | 一次验证的执行实例 | 系统 |
| **Evidence（证据）** | 截图/视频/Trace/Network/Console/DB 快照 | 系统采集 |
| **Verdict（判定）** | PASS / FAIL / UNKNOWN（无法验证） | Oracle 判定 |
| **Exploration（探索）** | 对应用的爬取与交互式探索任务 | Agent |
| **Application Graph（应用地图）** | 页点/状态/元素/动作/流程构成的图 | 探索沉淀 |
| **Browser State（浏览器状态）** | 可复用的登录态（cookie/localStorage/…) | 认证/执行沉淀 |
| **Credential（凭据）** | 认证配置（密码/OTP/TOTP/magic link/…） | 用户提供 |
| **Issue（问题）** | 从失败中产生的缺陷候选 | Triage 产生 |

### 2.2 对象关系链（数据骨架）

```
Project
 ├── Application（应用）
 ├── Environment（环境）
 ├── Credential（凭据）
 ├── Exploration（探索）
 │     └── Page / Flow（页面与流程 → 沉淀为 Application Graph）
 ├── QA Point ←── 来源追溯 ──→ Requirement / Figma / Exploration
 │     └── Verification
 │            └── Run
 │                   └── Evidence → Verdict
 │                          └── Issue
 └── Application Graph（覆盖率着色）
```

**关键原则**：Test 不是第一等公民。第一等公民是 `Application → State → User Intent → Action → Evidence`，QA Point 只是"Intent + 一条可能的验证路径"。

**执行模型细化**（对齐 qa.tech 官方文档反推，详见《qa-tech调研.md》）：

- **Application 三类型**：Web（浏览器）/ Mobile（移动设备）/ API（HTTP + 隔离代码沙箱验证，不开浏览器）；API Application 是 API 测试的正式承载（Phase 3）
- **Environment**：同应用不同部署（dev/staging/prod/market）；**Preview Environment** 是临时环境实例——Run 请求带环境 URL override 时自动创建（is_preview + branch/PR metadata），**PR 验证即此机制实现，不做独立 PR 流水线**
- **依赖双类型**：
  - `Resume From`（恰好 1 个）：继承浏览器状态 + 输出数据；**6 小时内成功状态立即复用**，过期/失败则依赖先重跑；仅同 Environment（跨 Application 可以）；Mobile 不支持
  - `Wait For`（可多个）：仅保证顺序 + 传数据，全新浏览器会话
- **数据共享**：`Output Values`（Agent 显式保存字符串值，跨会话/跨应用）为主；`Clipboard`（同会话链自动保存）为辅
- **并发模型**：独立依赖链并行（隔离 BrowserContext），链内串行；per-environment 并发上限可配，超额排队，多环境取最低值
- **Multi-Actor**：每用户一条依赖链（各自 root login），链间 Wait For 传 Output Values（如"一人提交、一人审批"）
- **Test Plan**：per-application 的 environment + device preset 配置集；参数优先级 `项目默认 < Test Plan < 单次 Run API override`
- **Device Preset**：跨设备测试配置载体（Phase 5+）

### 2.3 QA Point 分类体系（AI 提取 Schema 必须覆盖）

1. Happy Path 正常功能
2. Validation 必填/长度/格式/类型
3. Boundary 最小/最大/临界
4. Negative 非法输入/异常操作
5. Permission 不同角色/权限
6. State 草稿/提交/审核/完成/取消
7. Dependency 前置业务/上下游
8. Integration 第三方 API/消息/数据库
9. Concurrency 重复提交/并发修改

### 2.4 QA Point 状态机

```
Discovered（已发现）→ Selected（已选择）→ Draft（草稿）
→ Generated（已生成验证）→ Ready（就绪）→ Running（执行中）
→ Passed（通过）/ Failed（失败）→ Fixed（已修复）→ Verified（已确认）
```

UI 必须让用户一眼区分：发现了 / 已选择 / 还没验证 / 验证中 / 验证失败 / 已确认。不允许只有 PASS/FAIL 两种。

### 2.5 Verdict 三态（学 QA.tech）

- **PASS**：验证通过且有证据触达验证目标
- **FAIL**：验证失败，附证据
- **UNKNOWN（Unable to verify）**：测试绿了但没有真的触碰到验证目标 —— 不允许"假绿"

---

## 3. 用户旅程与核心场景

### 3.1 主链路（产品影片级标准流，原型必须完整演示）

```
新建项目 → 输入 URL
→ Agent 开始分析（Website Crawl 任务卡）
→ 发现 Login Wall
→ 聊天区动态长出凭据表单
→ 用户填写并保存
→ 凭据保存成功 → Agent 自动恢复分析
→ 18 pages crawled / Authenticated crawl complete
→ 生成 Suggested QA Points（勾选列表）
→ 用户勾选 → [创建所选验证]
→ 测试按依赖树出现在列表（认证→登录；订单→创建/取消/退款…）
→ [运行] → Run Viewer（步骤/浏览器/Network/Console/Trace）
→ 失败 → AI 归因 → 生成 Issue
```

### 3.2 六个核心场景（原型逐屏设计依据）

| # | 场景 | 关键交互 |
|---|---|---|
| 1 | 新建项目 → 输入 URL → Agent 开始探索 | 表单极简（名称+URL），首按钮是"开始探索" |
| 2 | 遇到登录 → 请求认证 → 继续探索 | 聊天区动态表单；凭据类型可扩展 |
| 3 | 探索实时展示 | 浏览器实时画面 + Agent 行为 + Live Findings |
| 4 | Agent 卡住 → 用户接管浏览器 → 完成后恢复 | AUTO / HUMAN_CONTROL / RESUME 三态 |
| 5 | 探索结束 → QA 点提取 → 批量选择 | 分组勾选 + Show details 抽屉 + Safe AI Mutation |
| 6 | QA 点 → 验证编辑器 → 执行 → Run Viewer | 四种步骤类型混合 + 证据链 |

### 3.3 全局 AI 助手（Chat 不是主界面）

- 位置：右下角常驻入口，可展开为侧栏
- 能力：探索订单退款流程 / 生成测试 / 运行测试 / 修改测试 / 查询知识
- **核心原则：Chat → Artifact**。聊天里说的话最终变成结构化对象（Exploration / Credential / QA Point / Test / Run / Issue）落到主界面，不做"全聊天化"。

---

## 4. 功能需求（逐页面）

### 4.0 全局框架

- 左侧导航：`概览 / 探索 / QA 点 / 验证 / 执行 / 问题 / 应用地图`（一级），`配置 / 集成`（次级）
- **探索必须是一级菜单**，不是 Settings 下的功能
- 顶栏：项目切换器（项目：订单管理系统 ▾）+ AI 助手入口
- 信息密度：紧凑；视觉见 §10

### 4.1 项目创建与 Onboarding

- 字段：项目名称、应用地址（URL）、环境（测试/预发/生产）、技术类型（Web）
- 可选：+ 添加需求文档（Word/PDF/Markdown/飞书）、+ 连接 Figma、+ 配置角色（管理员/普通用户）
- **第一屏按钮是"开始探索"**，不是"创建测试用例"（零配置可开始，专家再配置）
- 新项目首屏（空状态）：三张目标卡 —— ✨发现测试缺口 / 🧪创建一个测试 / ▶运行已有验证

### 4.2 AI Chat 工作区（首屏核心入口）

**组件基线：采用 assistant-ui（MIT）风格的成熟 Thread 组件范式**（shadcn 设计语言），不自研气泡体系：

- **消息组件**：
  - 用户消息：右对齐、灰色气泡（`--gray-bg`、16px 圆角、右下 5px 收角）、无头像
  - Agent 消息：左侧、**圆形渐变 Logo 头像（30px）** + 白底描边卡片（4/16/16/16 圆角）+ 柔和阴影
  - hover 工具条：复制 / 重新生成 / 反馈（opacity 0→1）
  - **💭 思考过程**：可折叠行（"思考过程 · 点击展开"），展开显示推理文本（斜体、左侧竖线）——对齐 assistant-ui Reasoning 元素
- **Composer**：圆角 14px 容器，focus 描边 + 3px 光环；内部 = 📎 附件 + 输入框 + 模型 chip（如 ⚡ DeepSeek-V3）+ 圆形发送按钮；下方 hint：Enter 发送 / 私有化数据不出内网 / @ 引用 QA 点 · / 唤起技能
- **空态**：欢迎语 + 建议提示 chips（分析应用 / 发现测试缺口 / …）
- **滚动到底**浮动圆钮
- **Agent 每一个重要动作都是 UI 对象**（Generative UI），不是 loading：
  - `Website Crawl` 任务卡：Start URL / Max Depth / 状态 / 进度
  - 凭据表单卡（动态生成）
  - Suggested QA Points 勾选卡
  - 依赖树卡（创建结果）
- Agent 消息结构：💭 思考过程（折叠）→ 动作说明 → 任务卡
- **动态 UI 原则**：后端返回 JSON Schema（`{type:"form", title, fields[]}`），前端渲染交互卡；支持 form / approval / confirmation / file upload / selection / diff
- 禁止把 Chat 做成纯文本气泡

### 4.3 探索工作台（核心页面之一）

三栏布局：

```
┌─────────────┬──────────────────┬───────────────┐
│ 探索路径      │  浏览器实时画面     │ Agent 状态     │
│ ✓ 登录       │                  │ 正在分析…      │
│ ✓ 首页       │   Browser        │ 当前页面       │
│ → 员工管理    │                  │ 已发现 8 按钮   │
│ 发现 12 操作  │                  │ 4 输入框      │
├─────────────┴──────────────────┴───────────────┤
│ Activity 时间线 + Live Findings                  │
└─────────────────────────────────────────────────┘
```

- **探索目标**输入（自然语言："探索员工管理和权限相关功能"）
- 探索参数（学 QA.tech Crawling Session）：Start URL / 最大深度 / 最大操作数 / 探索范围（整个应用 or 指定功能）
- 每个 iteration 展示：Screenshot / Source Action / Depth / Found Actions / **Intent Score**（相关性打分，例如 新增员工 97%、个人设置 31%，探索优先高相关节点）
- **Agent 行为解释**（不是"瞎点"）：当前目标 / 正在做 / 原因 / 观察到
- 实时进度：`12/40 页面 · 56/100 操作 · 当前目标匹配 92%` + [暂停][接管][停止]
- **Live Findings 侧栏**：探索途中即时发现（🔴高风险 / 🟠需验证 / 🟡新流程 / ⚪未确认），每条可 [加入 QA 点][忽略]
- 探索起点选择：从首页 / **从"管理员登录"状态继续**（Browser State 复用）/ 从已有验证继续
- 探索报告（结束产出）：发现页面 24 / 状态 41 / 交互 132 / 流程 17 / 潜在 QA 点 32 / 高风险 6 / 未覆盖 8 → [生成 QA 点]
- 途中主动通知：`✨ 发现潜在 QA 点`，不必等探索结束

### 4.4 认证与凭据（Human-in-the-loop 第一场景）

- **运行时请求优先于全局配置**：Agent 遇到登录 → 暂停 → 聊天区/右侧栏出表单 → 提交后恢复
- 表单要素：角色选择（管理员/普通用户）、凭据字段、"仅本次使用 / 保存为项目配置"选项
- **凭据类型第一天就支持 Schema 扩展**：password / email+password / OTP / magic link / TOTP 2FA / HTTP Basic / header / file —— 数据模型不允许写死 username+password
- Auth Context UI：左侧执行流程（→ 请求认证 ○），右侧凭据表单
- 验证码/人机校验场景：状态显示 `⚠ 需要人工协助` + [进入浏览器协助模式]，**绝不显示 FAILED**

### 4.5 Agent 会话状态机（全局）

```
WORKING → WAITING_FOR_INPUT → WORKING
WORKING → WAITING_FOR_APPROVAL → WORKING
WORKING → HUMAN_TAKEOVER → RESUMING → WORKING
WORKING → PAUSED → WORKING
任意 → COMPLETED / FAILED
```

- **HUMAN_TAKEOVER**：用户接管浏览器（Playwright Browser Context 共享），Agent 暂停；用户完成特殊操作（验证码/切换租户）后交还
- 所有状态在 UI 明确可见

### 4.6 QA 点（第一核心页面）

**列表页**：

- 顶部筛选：状态（待验证/执行中/通过/失败/已确认）、风险（高/中/低）、来源（PRD/Figma/探索）、类型（9 分类）、搜索
- 列表行：QA-ID / 标题 / 类型 / 风险 / 来源 / 状态徽章 / 最近验证时间
- 批量操作：全部选择 / 只选 High Risk / 只选新增 / 只选 Permission

**提取页（AI 建议选择，Safe AI Mutation）**：

```
┌────────────────────────────────────────────┐
│ AI 发现的 QA 点            [全部选择]       │
│ ▼ 登录与权限                3/4 已选        │
│   ☑ 正常账号登录                            │
│   ☑ 错误密码登录                            │
│   □ 未授权用户访问管理后台                   │
│ ▼ 员工管理                  2/6 已选        │
│   ☑ 创建员工 …                              │
│ 已选择 5 个 QA 点       [取消] [添加]       │
└────────────────────────────────────────────┘
```

- AI 生成的 QA 点**在用户点击"添加"前不落库**（Safe AI Mutation）
- 每条：AI Confidence + 风险 + 来源分组

**详情 Drawer**（点条目右侧滑出，不跳页）：

- 标题 / 状态 / 风险 / 来源
- QA 点说明
- **来源依据（Traceability）**：📄 PRD §3.2 原文引用 + 🎨 Figma 页面截图引用 + 探索发现记录
- AI Confidence
- 推荐验证方式（UI / API / DB / 权限 组合）
- 操作：[生成验证] [编辑] [删除]

**QA 点三种视图互跳**：QA 点列表 ↔ 应用地图 ↔ 验证列表

### 4.7 验证 · 执行（合并单页，三态；学 QA.tech "Run tests, find broken flows"）

> 设计决策：验证定义（Steps）与执行（Run）是同一事物的两个时刻，**不拆两页**。单页三态：编辑/就绪 → 实时执行 → 证据。原独立「Run Viewer」取消，其能力并入本页证据态。

**布局**：三列 + 底部持久日志（对齐 QA.tech 产品实测结构）

```
┌──────────┬────────────────┬──────────────────┐
│ 列1 步骤定义 │ 列2 执行记录      │ 列3 三态舞台        │
│ 可拖拽编辑   │ Action Log      │ 编辑→实时浏览器→证据  │
│ ⠿+⚙+类型chip│ 时间戳+💭思考+子动作│                  │
├──────────┴────────────────┴──────────────────┤
│ Console│Network│测试&Agent│图谱│日志（持久，全程捕获）│
└───────────────────────────────────────────────┘
```

**列 1：步骤定义（Steps，可编辑）**
- Tabs：`步骤（N）| 设置`；步骤卡 = 拖拽把手 ⠿ + 类型 chip + 自然语言文本 + ⚙（hover 显示）
- 运行时当前步与列 2 同步高亮（lime）
- 底部工具条：[＋][▶][↻] + `> 运行选项`（失败重试/截图频率/录屏/缓存策略）
- **四种步骤类型混合**：模块 / AI 操作 / 确定性 / 断言（业务语言，非 CSS Selector）

**列 2：执行记录（Action Log）——运行时逐条追加**
- 每步一张卡：时间戳（mono）+ 状态点 + 动作标题
- 当前卡展开：**💭 Agent 思考**（"没有独立新增入口，工具栏首按钮即新增员工，点击它"）+ 子动作行（`↳ Move mouse to 保存 · ↳ Click 保存`，各带 mono 时间戳）
- 失败卡红色展开错误行；断言未执行显示灰色卡
- 运行前为空态提示，头部状态徽章（待运行 / ● 执行中 / ✕ 失败 · 42s）

**列 3：三态舞台**（同前）
- **态 1 编辑/就绪**：验证信息卡（Actor/前置/来源 QA 点/策略）+ AI Resolution 面板（Expected "新增员工" not found → Alternative "创建员工" 语义匹配 92% → [接受][拒绝]）+ 缓存与自愈说明 + 大按钮 [▶ 运行测试（预计 40s）]
- **态 2 实时执行**：LIVE 徽章（计时）+ 当前动作说明 + 浏览器实时画面（URL 随步骤变化，页面内容逐步骤切换）+ 进度条 + [⏸ 暂停][👤 接管]（接管同探索：Agent 暂停、你操作、状态回传）
**态 3 证据**：判定横幅（✕ 失败 RUN-1928 · 42s + [↻ 重新运行][🔍 失败分析][创建问题]）+ 证据 Tab：`🤖 AI 分析`（疑似原因+置信度 + **NOTES** + **HYPOTHESES** + [进入失败分析][清理数据并重跑]）/ `最终截图` / `视频回放`（自动定位失败前 5 秒）；Console/Network/Trace 在底部持久日志面板
- 一次执行 = 全部证据，不让 QA 换工具找证据

**底部：持久日志面板（全程自动捕获，运行中即可查看）**
- Tabs：`Console | Network | 测试 & Agent | 图谱 | 日志`
- Console/Network 每步自动捕获；测试&Agent 记录推理、缓存命中、重试；图谱链接到该 Run 触达的 Intent；日志为 Run 汇总（N 步 · 成功/失败 · 证据归档数）

### 4.8 执行历史（列表页）

- 筛选 chips：全部/失败/无法验证/通过/执行中 + 搜索
- 表格：Run 号 | 结果徽章（含 **UNKNOWN 无法验证**）| 验证 | 触发方式（手动/定时/PR）| 耗时 | 时间 | [查看证据]
- 点击失败/执行中行 → **进入对应验证页并直达证据态/实时态**（验证+执行同页的收益）
- 顶部 [⏱ 定时任务][▶ 新建执行]

### 4.9 失败处理与 Triage（学 Momentic Triage Agent）

失败时 AI 归因卡：

- 疑似原因（如"后端员工唯一索引冲突"）+ 置信度 92%
- 分类单选：● 产品 Bug / ○ 测试问题 / ○ 环境问题 / ○ 暂时性故障 / ○ 需人工复查
- 操作：[查看证据] [创建缺陷（禅道/Jira）] [重新运行] [隔离 Quarantine]
- 失败分类体系：Related Application Bug / Unrelated Change / Test Can Be Improved / Infrastructure / Performance

### 4.10 问题（Issues）

- 列表：严重度（🔴高/🟠中/🟡低）/ 来源（AI 测试/PR/探索）/ 状态（待处理/已确认/已修复/忽略）
- **全链路追溯**：问题 → 对应 QA Point → 对应 Verification → 对应 Run → 对应 Evidence
- 创建到禅道 / Jira / GitLab Issue

### 4.11 应用地图（Graph，QA.tech 最有辨识度的资产）

- 树/图展示：登录 → 首页 → 订单（查询/新增/编辑/删除）→ 支付（Visa/Mastercard）→ 确认 …
- **节点覆盖着色**：绿=已验证 / 红=失败 / 黄=部分覆盖 / 灰=未验证
- 点击节点（如 订单→删除）：右侧展示该节点 QA 点覆盖清单 + 覆盖率 + [生成缺失验证]
- 图引擎：AntV X6

### 4.12 概览 Dashboard（第一版轻量）

- 质量概况卡：QA 点总数 / 已验证 / 失败 / 风险项
- 最近执行列表（名称+结果+耗时）
- 覆盖趋势（简单折线）
- 首页不放重 Dashboard，主入口是"发现 QA 点"

### 4.13 需求文档与原型（差异化输入，Phase 1）

- 导入：Word / PDF / Markdown / TXT / 飞书文档 / Figma（MCP）/ GitHub Issue / Jira
- MarkItDown 统一转 Markdown → 结构化拆分：需求/功能/角色/规则/状态/前置条件/验收标准/边界/异常
- Figma 双上下文：Frame/Layer/文本/交互 → 页面元素模型
- **交叉验证产出（高价值）**：
  - 需求有、原型没有 → Specification Gap
  - 原型有、需求没写 → Undocumented Behavior
  - 需求/原型/运行系统不一致 → Mismatch（如：PRD 说可删除订单，实际只有"草稿"状态有删除按钮）
  - 推导缺失需求（如"新密码与确认密码不一致应拒绝提交"）→ AI Test Design 而非 AI Test Generation

### 4.14 PR 验证报告（Phase 4 页面，学 QA.tech "Validate every change"）

> 与 qa.tech 第三个产品演示完全同构的三层视图：**Pull Requests 列表 → Review 详情（SUMMARY / AREAS / TESTS RUN）→ GitLab 回写**。原型对应 🔀 PR 验证屏。

**层 1 · Pull Requests 列表（默认视图）**
- 描述条：Pull requests synced from GitLab, with VerifyOS review results when available.
- Tab（All / Open / Merged / Closed）+ Filters + **Only with reviews** 开关 + 搜索（title / repo / #）
- 表格列：Title / Repo / Author / **Review** / Created；Review 列三态：`✓ N`（验证通过数）· `💡 N`（动态探索新发现数）· `Running…`（验证进行中，Webhook 自动触发，Preview 就绪后执行）
- 点行进入层 2

**层 2 · Review 详情**
- 头部：← 返回列表 · PR 标题 + !编号 + 状态 chip · 作者 · 仓库 · 源分支 → 目标分支 · +a −b · [View on GitLab]
- Tab：Review（默认）/ Files changed / Conversation
- 判定横幅：通过 / 失败 / **发现 N 项无法验证 · M 个新发现** + `Auto-triggered when deployment was ready` + [Open conversation] [GitLab]
- **合并门禁**（差异化保留）：断言失败 → 阻止合并 · 无法验证 → 警告 · `UNKNOWN ≠ PASS`
- **SUMMARY**：AI 自然语言总结——按本 PR 变更**动态生成并执行了 N 项验证**、覆盖哪些分支/边界、UNKNOWN 的原因、动态探索结论
- **AREAS FOR IMPROVEMENT**：问题逐条列出，每条带分类 chip（环境/高风险/幂等）+ **相关性归因**（Third-party, unrelated to this PR / 本 PR 相关 / 本 PR 直接相关）+ 行内修复动作（生成 QA 点 / 关联验证）
- **TESTS RUN (N)**：按变更动态生成的测试清单——状态（✓/?）· 测试名 · 关联 QA 点与来源（定向回归/变更生成/动态探索）· 时长；UNKNOWN 行高亮并解释"步骤全绿但未触达修改分支"

**层 3 · GitLab 回写（artifact）**
- MR 评论卡：Bot 头像 + verdict + 结果摘要（N 通过 / 1 无法验证 / 💡 新发现）+ 证据附件链接 + [在 GitLab 中查看] [回写 MR 状态]

### 4.16 移动测试（Phase 5+ 页面，学 QA.tech "Test mobile apps"）

> 对标 QA.tech 第四个产品演示：Agent 在 Android/iOS 设备上跑原生 App 用例，步骤流与 Web 完全同构。原型对应 📱 移动测试屏（`prototype.html` → RUN-M-089 演示）。

- **页面结构（结果页，与 qa.tech 动图同构）**：
  - 左侧 Steps 厚步骤卡流：每步 = 状态圆点 + 标题 + mono 时间戳 + **多段 💭 Agent 思考** + 子动作行（动作 icon + **截图缩略** + 时间戳）；移动专属步骤 **Launch app**（带设备卡：Device / Platform / OS Version / Viewport）、**收起键盘（tap done）**；Output values 卡（current_deal / finding / artifact）作为步骤流收尾
  - 右侧：手机竖屏实时画面（登录页 → 商机列表 → 商机详情，底部导航随界面切换）+ 结果元信息卡（Result / Classification: Positive / Environments / Outbound IP / Started / Last 5 Runs 徽标行）
  - 顶部 Tab：**Issues / Steps / Settings**；底部持久日志 Tab：Console / Network / Test & Agent / 图谱 / 日志（每步自动捕获）
- **受阻 → Fix in chat 闭环（QA.tech 同款）**：Agent 发现 UI 缺失（如详情页无「添加备注」入口）→ 判定"UI 缺失，非脚本问题" → [💬 回到 AI 工作区修复][🐛 建缺陷] → AI 生成修复 PR → **Before/After 修复对比卡**（红色缺入口 / 绿色 FAB ＋ + PR 号）→ 回归通过自动回写
- **结果分类**：Classification: Positive / 缺陷发现，计入问题中心，全链路追溯同 §4.10
- **执行层（技术细节见《技术选型.md》§2.11）**：移动 Web / App 内 WebView 用 Playwright 即可（第一版支持）；原生 App Phase 5+ 用 Maestro（Apache-2.0，AI 生态贴合）或 Appium+UiAutomator2/XCUITest；Run 事件模型（step/思考/证据）平台无关，移动执行器只换 driver 不换数据模型

---

## 5. 关键交互规格汇总

| # | 原则 | 规则 |
|---|---|---|
| 1 | Agent 动态生成 UI | 聊天/工作台中按 JSON Schema 渲染表单/确认/选择/上传/diff 卡 |
| 2 | Safe AI Mutation | AI 生成的一切建议（QA 点/测试/修改）先候选、用户确认后才落库 |
| 3 | 证据优先 | 每个判定必须可下钻到 Evidence；无触达证据 → UNKNOWN 而非 PASS |
| 4 | 人机协同状态机 | WORKING/WAITING_FOR_INPUT/WAITING_FOR_APPROVAL/HUMAN_TAKEOVER/PAUSED/RESUMING/COMPLETED/FAILED 全局可见 |
| 5 | Chat → Artifact | 聊天产出结构化对象落主界面，不做全聊天化 |
| 6 | Intent Score | 探索按目标相关性打分排序，优先探索高分节点；分数对用户可见 |
| 7 | 依赖树展示 | 测试按依赖展示（Complete task ↳ Create task ↳ Login），不扁平罗列 |
| 8 | 状态可解释 | Agent 每步展示：目标/正在做/原因/观察到，杜绝"AI 瞎点"感 |
| 9 | 列表+Drawer | 主工作区是列表，详情是上下文 Drawer，不整页跳转 |
| 10 | AI 不是按钮 | 不做"AI"大按钮；按钮是 发现测试/生成验证/执行/修复/分析 |

---

## 6. 数据模型（PostgreSQL，第一版不用 Neo4j）

```
projects, applications, environments
credentials（type: password|otp|magic_link|totp|basic_auth|header|file, encrypted_payload）
explorations（goal, start_url, max_depth, max_actions, status, start_state_id）
exploration_iterations（screenshot_id, source_action, depth, found_actions, intent_score）
browser_states（name 如 admin_logged_in, cookies, localStorage, sessionStorage, url）
pages, page_states, elements, actions, flows          -- Application Graph
coverage_edges                                       -- 覆盖关系
documents, requirements, prototype_pages             -- 需求侧
qa_points（title, type, risk, status, confidence）
qa_point_sources（qa_point_id, source_type: prd|figma|exploration, ref, quote）
verifications（actor, precondition, yaml_spec）
verification_steps（order, kind: module|ai_action|deterministic|assertion, payload）
runs, run_steps（status, duration, error, evidence_ids）
evidences（kind: screenshot|video|trace|network|console|db, storage_key）
verdicts（pass|fail|unknown, reason, evidence_refs）
issues（severity, source, status, qa_point_id, external_url）
```

关系：`Requirement → QA Point → Verification → Run → Evidence → Verdict → Issue`；`Page → State → Element → Action → Next State`。

---

## 7. API 与事件设计

### 7.1 REST（核心资源）

```
POST /projects                      创建项目
POST /explorations                  启动探索（goal/start_url/max_depth/max_actions）
GET  /explorations/:id              探索详情（含 iterations）
POST /explorations/:id/pause|resume|takeover|continue|stop
POST /explorations/:id/findings/:fid/accept     发现转 QA 点
POST /credentials                   保存凭据（运行时请求也走这里）
GET  /qa-points?status=&risk=&type=  QA 点列表
POST /qa-points/bulk-confirm         批量确认（Safe AI Mutation 落库点）
POST /verifications                  从 QA 点生成验证
POST /runs                           执行验证
GET  /runs/:id                       Run 详情（steps+evidences）
POST /runs/:id/triage                提交失败分类
POST /issues                         创建问题（同步禅道/Jira）
```

### 7.2 WebSocket 事件（驱动前端）

```json
{ "type": "agent.waiting_for_user", "sessionId": "exp_123", "reason": "authentication_required", "configType": "username_password" }
{ "type": "agent.page_discovered", "url": "/employees", "title": "员工管理" }
{ "type": "agent.action", "action": "click", "target": "新增员工", "confidence": 0.96 }
{ "type": "agent.finding", "severity": "high", "title": "普通用户可能可访问管理员页面" }
{ "type": "run.step_completed", "runId": "run_9", "step": 3, "status": "pass", "durationMs": 1200 }
```

### 7.3 动态 UI Schema

```json
{ "type": "form", "title": "需要登录信息", "fields": [
  {"name": "username", "label": "用户名", "input": "text", "required": true},
  {"name": "password", "label": "密码", "input": "password", "required": true}
], "actions": [{"id": "save", "label": "保存并继续", "style": "primary"}] }
```

---

## 8. 技术架构与开源选型

### 8.1 架构

```
React 18 + TS + Tailwind + shadcn/ui + @assistant-ui/react + AntV X6 + Tiptap
            │ API / WebSocket
      后端服务（第一版单体：FastAPI 或 Spring Boot，不微服务）
        ├── Requirement Engine（MarkItDown / Figma MCP）
        ├── Discovery Engine（Crawlee + Playwright + A11y + Screenshot）
        ├── Agent Runtime（Stagehand / Browser Use；Playwright MCP 备选）
        ├── Verification Engine（Oracle：UI/API/DB）
        └── Execution（Playwright：trace/video/network/console/storageState）
存储：PostgreSQL（+pgvector）· Redis（缓存/队列）· MinIO（截图/视频/Trace）
观测：Langfuse（LLM trace）· OpenTelemetry
队列：第一版 Redis 即可；禁上 LangGraph/Temporal/Kafka/Neo4j
```

### 8.2 组件选型表

| 能力 | 首选 | 用途 |
|---|---|---|
| Web Browser | Playwright | 执行层（trace/video/network/console/storageState） |
| Browser Agent | Stagehand（MIT） | act/observe/extract + cache + self-heal |
| Browser Agent 备选 | Browser Use / qa-use | 快速验证 Agent |
| Browser MCP | Playwright MCP | Agent 操作浏览器（A11y Tree 路线） |
| Crawler | Crawlee + Playwright | 网站扫描 |
| 文档解析 | MarkItDown | PRD→Markdown |
| 原型 | Figma MCP | 设计上下文 |
| 前端框架 | React 18 + Vite | AI 会话组件生态第一现场（详见《技术选型.md》V0.2） |
| UI 体系 | shadcn/ui + Tailwind | 控制台视觉基线 |
| AI 会话 | @assistant-ui/react（MIT） | Thread/Composer/Reasoning/生成式 UI（PRD §4.2 范式） |
| 图 UI | AntV X6（x6-react-shape） | 应用地图/依赖图 |
| 富文本 | Tiptap（@tiptap/react） | 需求/QA 点编辑 |
| 移动执行（Phase 5+） | Maestro / Appium；移动 Web 用 Playwright | 原生 App 测试（§4.16） |
| Vision | 第一版不用自训模型 | A11y+DOM 为主，DOM 不足才 Vision fallback（OmniParser/UI-TARS 类后置） |
| LLM 观测 | Langfuse | Prompt/Token/Trace |
| CI 集成 | GitLab CI / Jenkins | PR 验证（Phase 4） |
| 缺陷 | 禅道 / Jira API | Issue 双向 |

### 8.3 关键技术决策

1. **元素识别**：`Screenshot + DOM + A11y Tree` 三源融合成 UI State Model，纯 Vision 不是第一版答案
2. **执行模型**：Deterministic + Agentic + Module + Assertion 混合；关键路径确定性、动态路径 Agentic
3. **缓存自愈**（学 Momentic V3）：首次 AI planning→resolve→cache；二次 cache replay 不调 LLM；cache miss→AI heal→更新 cache
4. **认证即状态**：Authentication 是 Browser State 的一种来源，登录态可继承（exploration 从 login output state 继续，不重复登录）
5. **人机协同**：WAITING_FOR_USER 走 WebSocket → 前端弹卡；接管通过共享 Playwright Browser Context 实现

### 8.4 工具与插件系统（Tool Registry + MCP，Agent 能力扩展层）

> 设计判断：**要插件化，但第一版只做"工具注册表 + MCP 协议"，不做插件市场/沙箱/动态加载等重框架**。Agent 的执行本质就是"规划 → 调工具 → 观察结果"循环，数据库查询、代码查看、视觉兜底都是往同一个注册表加条目——需要被设计的不是"插件框架"，而是**统一的工具接口规范**。

- **Tool 接口（注册表规范）**：`name / description / inputSchema(JSON Schema) / run(args) / permission / 返回结构`——LLM 侧转成 function calling 的 tools 参数（OpenAI 兼容网关已定），模型按任务需要自动选择调用
- **权限三档（每个工具必须声明）**：
  | 档位 | 行为 | 例 |
  |---|---|---|
  | auto | 自动执行，结果入证据链 | browser 操作、http 调用、db 只读查询、code 查看 |
  | ask | 执行前走 WAITING_FOR_APPROVAL 弹卡 | db 写操作、vision 大规模调用、对外发送 |
  | forbidden | 阶段内禁用 | 生产库写入 |
- **第一版内置工具（8 个）**：
  | 工具 | 用途 | 权限 |
  |---|---|---|
  | browser | Stagehand act/observe/extract（Web 执行主路） | auto |
  | http | API 调用 / 接口断言（Oracle: API） | auto |
  | db.query | 数据库查询（**只读账号**，LIMIT 强制 + 超时 + 结果入证据） | auto |
  | db.exec | 数据库写操作（测试数据准备/清理） | ask |
  | code.view | 代码片段查看（GitLab API，按文件/行号定位） | auto |
  | vision | 视觉模型兜底（DOM 不可描述时） | ask |
  | evidence | 证据采集归档（截图/trace/network → MinIO） | auto |
  | report | 报告/MR 评论回写 | auto |
- **外部插件 = MCP Server**：协议用 **MCP（Model Context Protocol，MIT）**，不发明私有插件协议；内部系统（CMDB/网关服务查询）、禅道/Jira、飞书等都可作为 MCP server 接入；连接器配置（传输 stdio/SSE + 凭据）复用凭据体系加密存储
- **管理界面**：设置 → 工具与插件：内置工具列表（启停/权限调整/调用统计）+ MCP 连接器（已连接/添加/健康检查）
- **明确不做（第一版）**：插件市场、动态加载/热插拔、沙箱隔离、插件计费——内置注册表 + MCP 已覆盖未来 2-3 个版本的能力叠加需求
- **分期**：Phase 1 内置 8 工具；Phase 2 MCP 接入内部系统；Phase 3 内网插件目录

---

## 9. MVP 分期

| 阶段 | 范围 | 验证目标 |
|---|---|---|
| **Phase 1：QA 点提取** | 上传 PRD + 连 Figma → AI 提取 QA 点 → 筛选/来源/修改/批量确认 | AI 能否稳定理解需求与原型，产出人愿意用的 QA 点 |
| **Phase 2：应用探索** | + URL → Crawlee/Playwright 探索 → Application Graph → 覆盖缺口 → 探索/QA 点闭环 | "5–10 分钟内自动构建可用 Application Graph 并推导首批高价值测试" |
| **Phase 3：自动执行** | + Playwright + Stagehand + Oracle → Run Viewer + Evidence + Triage | "一键验证"体验成立 |
| **Phase 4：PR 验证** | + GitLab/GitHub PR → Diff → Impact → 受影响 QA 点 → 缺失验证生成 → Verdict 上报 | 变成 Software Verification Platform |

**MVP-1 页面清单（4+2）**：QA 点（列表/提取/详情）、验证编辑器、Run Viewer、应用地图 + 探索工作台、AI Chat 工作区。

---

## 10. 视觉设计规范

| 项 | 规范 |
|---|---|
| 底色 | 白色主界面 / 浅灰 #FAFAFA 画布 |
| 边框 | 极细灰（#E5E7EB，1px） |
| 圆角 | 小（6–8px） |
| 阴影 | 极轻 |
| 文字 | 黑/深灰主体；灰次级；13–14px；紧凑信息密度 |
| 状态色 | 绿=通过 · 红=失败 · 黄=部分/警告 · 灰=未验证 · 蓝=进行中 |
| AI Accent | 一个高饱和品牌色（用于 AI 相关元素），少量使用 |
| 禁止 | 紫色 AI 大渐变 / 大面积玻璃拟态 / 机器人 icon / 满屏 "AI" 字样 |

验收标准：用过 QA.tech / Momentic 的人打开后第一感觉是"我知道怎么用了"。

---

## 11. 指标与验收

| 指标 | 目标（MVP） |
|---|---|
| 探索→可用 Application Graph | ≤ 10 分钟（中等规模 Vue/OA 系统） |
| QA 点采纳率（用户勾选/建议总数） | ≥ 40% |
| QA 点来源可追溯率 | 100%（每个 QA 点有 PRD/Figma/探索依据） |
| 首条验证从 0 到跑通 | ≤ 30 分钟（新项目） |
| 失败归因有效率（人工确认分类正确） | ≥ 70% |
| 假绿率（UNKNOWN 误报 PASS） | 0（架构性禁止） |

---

## 12. 风险与开放问题

1. **名称**：VerifyOS 为临时工作名
2. **国产模型适配**：Stagehand/Vercel AI SDK 对国产模型兼容性需 PoC（可走 OpenAI 兼容网关）
3. **后端语言**：PRD 按 FastAPI 写，若团队 Java 为主则 Spring Boot 平移（接口契约不变）
4. **Figma MCP 私有化**：企业内网 Figma/摹榻(Mockplus)/即时设计的 MCP 可用性待确认
5. **凭据安全**：加密存储与权限隔离方案（Phase 2 前定）
6. **探索预算控制**：max_depth/max_actions 默认值与费用上限策略

---

## 附：本 PRD 对应原型

`prototype.html` —— 单文件可交互高保真原型（浏览器直接打开），包含 13 个屏幕：

1. 欢迎页（今天想做什么 + 新建项目）
2. AI 工作区（含"产品影片"完整脚本演示：一句话→分析→登录表单→恢复→QA 点建议→创建→依赖树）
3. 探索工作台（三栏 + Live Findings + Intent Score + 人工接管）
4. QA 点列表 + 详情 Drawer（来源追溯：PRD 引用 + Figma + 置信度）
5. 验证 · 执行（合并单页三态：编辑 → 实时执行 → 证据；四种步骤类型 + AI Resolution 自愈 + 六 Tab 证据含 AI 分析 NOTES/HYPOTHESES）
6. 执行历史（列表：结果徽章含 UNKNOWN · 点击直达验证页证据态）
7. 失败 Triage（AI 归因 92% + 人工分类 + 全链路追溯）
8. 应用地图（SVG 覆盖着色，节点点击看缺口）
9. 问题列表（全链路追溯）
10. 概览 Dashboard
11. 需求导入 · QA 点提取（Phase 1 闭环：来源 → 结构化拆分 → 交叉验证发现 Mismatch/Gap/Undocumented/缺失推导 → 提取）
12. PR 验证报告（Phase 4：影响分析 + UNKNOWN 防假绿 + 缺失验证生成）
13. 凭据与浏览器状态（运行时请求优先 + Browser State 复用 + 安全）

原型中所有按钮/勾选/Tab 均可点击；AI 工作区的"▶ 播放演示"按 QA.tech 产品影片脚本逐步复现主链路。
