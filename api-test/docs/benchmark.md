# 竞品一比一对比报告：Hoppscotch vs Postcat vs Bruno

> 目的：为 VerifyOS api-test Web UI 的「缝合」提供界面形态参考。三家源码已 clone 至 `/tmp/api-ui-bench/`，本报告基于源码直接阅读（文件路径均可一比一对照）。
>
> 我们的定位：界面形态参考这三家（API 调试台 + 用例管理），AI 能力（流量录制→用例 / spec→edge-case / AI 断言诊断 / 覆盖率 / 场景编排，A1-A8）是我们自己的核心差异点。

---

## 1. 产品形态对比表

| 维度 | Hoppscotch | Postcat | Bruno |
| --- | --- | --- | --- |
| **定位** | Postman 开源替代（Web 优先，全功能 API 生态） | Apifox 开源国产同形态（API 文档 + 调试 + 测试 + Mock，中文产品） | Git 化 collection 的本地优先 API 客户端（「file over database」） |
| **前端框架** | Vue 3 + TypeScript（`hoppscotch-common` 为核心 UI 包，`.vue` SFC） | Angular 15 + ng-zorro-antd 15（`src/workbench/browser/`） | React 19 + Redux Toolkit（`packages/bruno-app/`，JS 非 TS） |
| **构建** | Vite（selfhost-web `vite.config.ts`；官方云版 Nuxt 体系遗留） | Angular CLI + webpack（`angular.webpack.js`） | rsbuild（`rsbuild.config.mjs`） |
| **样式方案** | Tailwind + `@hoppscotch/ui` 独立组件库（含 tailwind preset，`tailwind.config.ts` 里 `presets: [preset]`） | Tailwind + ng-zorro antd 组件 + SCSS | Tailwind 3 + styled-components（`StyledWrapper.js` 模式） |
| **桌面形态** | Tauri 2（`packages/hoppscotch-desktop/`，Rust crates + tauri CLI） | Electron（`src/workbench/node/electron/`） | Electron（`packages/bruno-electron/`，electron-builder） |
| **多端** | Web（selfhost/云）+ 桌面（Tauri）+ CLI（`hoppscotch-cli`）+ 浏览器扩展历史 + mobile 遗留 | Web + Electron 桌面（同一套 Angular 代码，`isElectron` 分支） | 桌面优先；Web 版属收费 Golden Edition（`Sidebar/GoldenEdition/`）；CLI（`bruno-cli`）免费 |
| **开源协议** | MIT（根 `LICENSE`） | Apache-2.0（根 `LICENSE`） | MIT（根 `license.md`）；但部分高级功能闭源收费 |
| **数据存储** | 云：Firebase/GQL backend（`hoppscotch-backend`）；selfhost 同；本地 localConfig | 远端 API（`api/`）+ 本地存储混合；桌面本地化 | **纯文件系统**：collection 目录 + `.bru` 文本文件（`bruno-lang`），天然 Git 友好 |
| **插件化** | 中：UI extension 组件挂载点（`rootExtensionComponents`）+ platform 附加 inspector（`platform.additionalInspectors`） | 高：完整插件市场（`pages/extension/`），sidebar 可注册插件视图（iframe 加载，`initSidebarViews`） | 低：无插件市场；有 runner/脚本扩展（`bru` JS runtime） |
| **请求协议** | REST + GraphQL + WebSocket/SSE/MQTT（`pages/realtime/`） | REST + GraphQL + WebSocket + gRPC（`project/api/` 下四个子目录） | REST + GraphQL + WebSocket + gRPC（`RequestPane/` 下四套 pane） |
| **多语言** | 40+ 语言 JSON（`hoppscotch-common/locales/`，含 `cn.json`） | Angular i18n XLF（`locale/messages.zh.xlf`），中文一等公民 | i18next（`src/i18n/`），社区翻译 |

---

## 2. 界面解剖（读源码一比一）

### 2.1 Hoppscotch：三栏可折叠布局 + 暗色主题 + accent 色系统

**布局骨架**（两层拆分）：

1. **全局 layout**：`packages/hoppscotch-common/src/layouts/default.vue`
   - 结构：`AppHeader`（顶栏）→ 横向 Splitpanes：左 `AppSidenav`（窄图标导航栏，REST/GraphQL/Realtime/Settings 切换）+ 右主区 `RouterView` → `AppFooter`。
   - 用 `splitpanes` 库（`import { Pane, Splitpanes } from "splitpanes"`），md 以下断点转竖排、sidenav 沉底。
   - 全局挂 `AppSpotlight`（⌘K 全局搜索）、`AppSupport`、toast。
2. **工作区三栏**：`packages/hoppscotch-common/src/components/app/PaneLayout.vue`
   - 三栏实现：外层 Splitpanes（主区 + sidebar，`SIDEBAR_ON_LEFT` 可设置 RTL 翻转），主区再嵌一层横向 Splitpanes（primary 上 / secondary 下）。
   - 三个 slot：`#primary`（请求构建）、`#secondary`（可选）、`#sidebar`（collections 树）。
   - **面板尺寸持久化**：`setPaneEvent` 把拖拽后尺寸写 `persistenceService.setLocalConfig(\`${layoutId}-pane-config-${type}\`)`，重进恢复 —— 值得直接抄。
   - 设置项：`SIDEBAR`（右侧栏开关）、`COLUMN_LAYOUT`（上下/左右布局切换）、`SIDEBAR_ON_LEFT`。

**REST 工作区页面**：`packages/hoppscotch-common/src/pages/index.vue`
- 顶部 **多 tab 系统**：`HoppSmartWindows`（来自 `@hoppscotch/ui` 包，非本仓库）+ `WorkspaceTabsService`（`src/services/tab/workspace-tabs.ts`）。tab 是 `HoppTabDocument` 联合类型：`request | gql-request | example-response | test-runner`，一个 tab 系统承载四种文档。
- tab 头有脏标记（`tab.document.isDirty` 小圆点）、右键菜单（复制/关闭其他/重命名）。
- 内容区：`HttpRequestTab`（`components/http/RequestTab.vue`）内含：
  - **请求构建**（`components/http/Request.vue`）：method 下拉（按 method 着色 `getMethodLabelColor`）+ `SmartEnvInput`（URL 输入，支持环境变量高亮 `{{var}}`、历史自动补全、粘贴 curl 导入）+ Send 按钮（带下拉：复制 curl/生成代码）。
  - 参数 tab（`Parameters.vue`/`Headers.vue`/`Body.vue`/`Authorization.vue`…）：KeyValue 表格 + Monaco/CodeMirror 编辑器。
  - **响应区**（`ResponseInterface.vue`/`Response.vue`）：状态码着色 + 时间/大小指标 + 响应体 lens（JSON/HTML/图片等多渲染器，`components/lenses/`）。
- 左栏 `HttpSidebar.vue`：Collections 树（`components/collections/MyCollections.vue` / `Collection.vue` / `Request.vue`）+ History + 环境。

**主题系统**（暗色为主 + accent）：
- `packages/hoppscotch-common/src/modules/theming.ts`：
  - `BG_COLOR`（`system/light/dark/black` 四态，`newstore/settings.ts:8`）→ `document.documentElement.setAttribute("class", selection)`，配合 Tailwind `dark:` 类。
  - `THEME_COLOR`（9 个 accent：green/teal/blue/indigo/purple/yellow/orange/red/pink，`settings.ts:12-22`，默认 indigo）→ `document.documentElement.setAttribute("data-accent", color)`，CSS 侧用 `[data-accent=xx]` 变量覆盖。
- 具体色板在独立包 `@hoppscotch/ui`（npm 依赖 `0.2.6`，tailwind preset 导入），语义 token：`bg-primary`/`text-secondaryDark`/`border-divider`/`bg-primaryLight` 等 —— 全仓统一用语义色而非硬编码色。
- 选择器 UI：`components/smart/AccentModePicker.vue` / `ColorModePicker.vue`。

### 2.2 Postcat：Angular workbench + API 管理树 + 测试面板 + 插件市场

**布局骨架**：
- 主壳：`src/workbench/browser/src/app/pages/pages.component.html` —— `eo-navbar`（顶部面包屑/用户）+ `eo-sidebar`（左窄图标栏）+ `router-outlet` 主区 + `eo-toolbar`（底部状态栏）。Electron/Web 用 `isElectron` 区分样式类。
- 左图标栏：`app/layouts/sidebar/sidebar.component.{ts,html}` + `sidebar.service.ts`。模块列表在 `sidebar.component.ts:103 getModules()` 硬编码（API/环境/成员/设置），**插件可动态注册 sidebar 视图**（`initSidebarViews()` 读 `extension.getSidebarViews()`，iframe 加载插件页面）。
- workspace 页面：`app/pages/workspace/workspace.component.ts` → `project/`（项目工作区）→ `api/`。

**API 管理树**（Apifox 同款体验的核心）：
- `app/pages/workspace/project/api/components/group/tree/api-group-tree.component.{html,ts}`：顶部搜索框 + 「+New API/New Group」下拉 → `eo-ng-tree-default`（ng-zorro 树）渲染「分组/接口」两层树，节点带 method 图标。
- 同级还有 `components/history/eo-history.component.ts`（历史记录）。
- 三套页面围绕一棵树：
  - **编辑（文档化）**：`api/http/edit/api-edit.component.html` —— method+URL+分组选择+名称表单 → Request/Response 折叠面板 → 内部 tab（Headers/Body/Query，`eo-api-edit-form`/`eo-api-edit-body`），**tab 上带数量 badge**（`nz-badge`）。
  - **测试（调试台）**：`api/http/test/api-test.component.html` —— method+环境 host 前缀+URL+Send/Abort → 请求 tab（Headers/Body/Query…）+ **响应区可拖高度**（`responseContainerHeight`）→ 「Save as API」把调试结果存回文档（测试↔文档打通的关键交互）。
  - **详情**：`api/http/detail/`（只读文档视图）。
- 脚本断言：`api/http/test/api-script/`（前后置脚本编辑）。

**中文本地化**：Angular 内置 i18n（`$localize` + `i18n` 指令），翻译文件 `src/workbench/browser/locale/messages.zh.xlf`；默认 UI 文案即英文 via i18n 标记，中文是完整的一套 XLF。

**插件市场 UI**：`app/pages/extension/`（`extension.component.html`）—— 左树分类（`eo-ng-tree-default`）+ 右列表（`list/extension-list.component.*` 卡片）+ 详情页（`detail/`），搜索自动补全。插件安装后经 `shared/services/extensions/extension.service` 注入 sidebar/菜单。

### 2.3 Bruno：collection 文件系统 + tab 式请求编辑器 + Git 友好

**文件形态**（Git 友好设计的根基）：
- collection 是一个普通目录：`collection.bru`（collection 级配置/脚本/变量）+ 每个请求一个 `request.bru` 文本文件 + `folder.bru`（文件夹级继承）。方言由 `packages/bruno-lang` 解析（v1/v2 双版本，v2 用 `meta {}` 块）。
- `.bru` 示例（`bruno-lang/example/request.bru`、`v2/tests/settings/fixtures/settings-all-options.bru`）：`meta { name/type/seq }`、`get/put { url }`、`headers {}`、`body:json {}`、`script {}`、`tests {}` —— 纯文本、可 diff、可 merge、可 code review。**这是三家唯一的非数据库存储**。

**布局骨架**：
- 入口：`packages/bruno-app/src/pages/Main.js` —— 强依赖 `window.ipcRenderer`（**Electron only**，浏览器打开直接报错红框），Provider 栈：Redux → SQLiteProvider（web sqlite bridge）→ Theme → Toast → App。
- 主工作区：`components/RequestTabPanel/index.js`（约 2000+ 行的巨石组件）：
  - 左：Sidebar（`components/Sidebar/index.js` → `Collections/` 树，含 Git remote 行 `GitRemoteCollectionRow`）。
  - 中：QueryUrl + 请求面板；右：响应面板。左右/上下可拖拽（`useTabPaneBoundaries` + `paneSize.js`，最小宽高常量、双击边缘折叠/展开 `COLLAPSE_EDGE_THRESHOLD`）。
  - 顶部多 tab：Redux `tabs` slice，tab 类型多达十余种（request/runner/environment/settings/spec/mock-server/app…），**一个 tab 框架承载所有功能页**。

**请求编辑器（tab 式，最值得抄）**：`components/RequestPane/HttpRequestPane/index.js`
- `TAB_CONFIG` 数组声明 11 个 tab：`params / body / headers / auth / vars / script / assert / tests / docs / app / settings`，`TAB_PANELS` 映射组件。
- **tab 徽标系统**（`indicators`，:104-121）：params/headers/assert/vars 显示启用计数 `<sup>`；body/auth/script/tests/docs 显示 `StatusDot`，脚本/测试出错变红点 —— 一眼看出「这个请求配了什么、有没有错」。
- **Assert tab**（`RequestPane/Assertions/index.js`）：**结构化断言表格**（非脚本）：`EditableTable` + 操作符下拉（eq/neq/gt/contains/matches/isEmpty/isJson 等 30+ 操作符，`parseAssertionOperator`），表达式列用 `SingleLineEditor`（CodeMirror 单行，支持变量补全）。这是「断言编辑」三家最优秀的交互。
- **Tests tab**（`RequestPane/Tests/index.js`）：JS 脚本编辑器（CodeMirror），`useFocusErrorLine` 失败时跳到出错行；Run/Save 按钮内嵌。
- 响应侧 `ResponsePane/TestResults/` 显示断言/测试结果。

**测试脚本 tab / AI 挂载**：
- `TabBarAiAssist/index.js`：在 script/tests/docs/app 四个 tab 的**右上角内嵌 AI 按钮**，按 tab 构造上下文（`buildAiContextPayload`），AI 生成结果经 `onApply` 直接 dispatch 回对应字段（updateRequestTests 等）。
- 右侧可停靠 AI 聊天栏：`components/AiChatSidebar/`（含 DiffView 预览、Popout 弹出独立窗口）；dock 时自动折叠响应面板（`RequestTabPanel` 的 `aiAutoCollapsedTabs` 逻辑）。

**Git 友好**：collection 即目录（可 `git clone` 直接打开，`Sidebar/Collections/CloneGitRespository/`）；`.bru` 纯文本可 diff；`bruno-cli` 在 CI 跑同目录 collection。

---

## 3. 我们要抄什么（缝合建议清单）

> 原则：布局骨架抄 Hoppscotch（Vue/TS、Vite、Tailwind 与我们技术栈最顺），API 资产树与「测试↔文档」交互抄 Postcat，请求 tab 与断言编辑抄 Bruno，存储形态采 Bruno 的文件化思路但简化为 JSON（复用我们已有 `test_case` 模型）。

| # | 抄什么 | 抄哪家 | 参考文件（一比一对照） | 说明 |
| --- | --- | --- | --- | --- |
| 1 | **三栏可拖布局骨架**（左树/中请求/右响应，右栏可关、可换左右） | Hoppscotch | `hoppscotch-common/src/components/app/PaneLayout.vue` + `splitpanes` 库 | 三个 slot 的抽象 + 面板尺寸按 layoutId 持久化，200 行内可实现 |
| 2 | **全局壳 + 窄图标导航** | Hoppscotch | `hoppscotch-common/src/layouts/default.vue`、`components/app/Sidenav.vue` | 顶栏 + 图标导航 + 主区 RouterView；⌘K Spotlight（`AppSpotlight`）后置 |
| 3 | **多 tab 文档系统**（一个 tab 框架承载 request/用例/场景/报告） | Hoppscotch + Bruno | Hoppscotch `pages/index.vue`（HoppSmartWindows + HoppTabDocument 联合类型）；Bruno `providers/ReduxStore/slices/tabs` | tab = 联合类型文档 + isDirty 脏标记 + 关闭确认，我们加 `test-case`/`scenario-report` 文档类型 |
| 4 | **URL 输入框**（method 着色 + 环境变量高亮 + 历史 + 粘贴 curl 导入） | Hoppscotch | `components/http/Request.vue` + `components/smart/EnvInput.vue` | 粘贴 curl 自动解析成请求，低成本高感知 |
| 5 | **API 资产管理树**（分组/接口两层树 + 搜索 + method 图标 + 右键菜单） | Postcat | `app/pages/workspace/project/api/components/group/tree/api-group-tree.component.html` | 直接对应我们 A4 的 `api_definition` 清单；树上加「覆盖率热力」是我们的差异点 |
| 6 | **「调试↔用例」双向打通**（调试台一键 Save as API/用例） | Postcat | `api/http/test/api-test.component.html` 的「Save as API」按钮 | 我们的关键变体：**「录制流量 → 一键转用例」「响应 → 一键生成断言」**按钮放在同一位置 |
| 7 | **请求编辑 tab 化 + 徽标系统**（Params/Body/Headers/Auth/Assert/Tests/Docs，带计数/状态点） | Bruno | `components/RequestPane/HttpRequestPane/index.js`（TAB_CONFIG + indicators，:26-121） | 纯配置驱动，徽标让「用例配了什么断言」一目了然 |
| 8 | **结构化断言编辑器**（表格 + 操作符下拉，替代写脚本） | Bruno | `components/RequestPane/Assertions/index.js`（parseAssertionOperator + EditableTable） | 直接映射我们 A7 的断言 DSL（exists/schema/eq/ignore）；AI 生成断言落进同一张表 |
| 9 | **暗色主题 + 9 色 accent**（语义 token + data-accent 属性切换） | Hoppscotch | `modules/theming.ts` + `newstore/settings.ts:8-22` + `@hoppscotch/ui` tailwind preset（思路） | `class=dark` + `data-accent=xxx` 两个 html 属性搞定；色板自己定义语义 token（bg-primary/text-secondary 等） |
| 10 | **响应渲染多 lens**（JSON 高亮/图片/HTML 预览/原始） | Hoppscotch | `components/lenses/` + `components/http/ResponseInterface.vue` | 我们加第四种 lens：「**AI 诊断视图**」（失败 diff + 根因分类） |
| 11 | **文件化 collection**（目录 + 文本文件，Git 可 diff） | Bruno | `bruno-lang/example/request.bru`、`v2/tests/settings/fixtures/*.bru` | 简化为 JSON 文件（复用 `test_case` 模型），保住「Git 提交用例、code review 断言」的工作流 |
| 12 | **失败定位到行**（测试脚本失败跳编辑器出错行） | Bruno | `RequestPane/Tests/index.js` 的 `useFocusErrorLine` | 我们的对应物：断言失败 → 高亮表格中失败行 + 展开期望/实际 diff |
| 13 | **中文一等公民** | Postcat | `locale/messages.zh.xlf`（Angular i18n） | 我们直接 vue-i18n + zh-CN 为默认语言，别学 hoppscotch 的 40 语言包 |

**不建议抄**：Postcat 的 Angular/ng-zorro 技术栈（生态窄、招人难）；Bruno 的 styled-components + JS（我们统一 TS）；Hoppscotch 的 Firebase/GQL backend 体系（我们本地优先）。

---

## 4. AI 能力挂载点（我们的 A1-A8 放哪）

对标三家现有的「AI/测试」界面位置：

| 我们的 AI 能力 | 三家对应位置 | 我们的 UI 挂载点 |
| --- | --- | --- |
| **A2 流量录制**（代理录制真实流量） | 三家均无（Hoppscotch 只有 History 历史列表 `components/history/`） | **顶栏全局「录制」开关**（红点脉冲 + 计数）+ 左栏新增「流量录制」树节点（会话列表 → 按 API 归组的流量）。这是三家都没有的**第一入口** |
| **A3 录制→用例**（噪音检测 + mock） | Postcat 的「Save as API」最接近（`api-test.component.html`） | 每条录制流量 / 每个 API 分组行内按钮「→ 生成用例」；生成后在用例详情顶部展示**噪音检测横幅**（哪些字段被标 ignore、原因），复用 Postcat「调试结果存回文档」的交互心智 |
| **A6 spec→edge-case** | 三家均无（Hoppscotch 有 `aiexperiments/` 实验室：ModifyBody/ModifyTestScript 弹窗，入口在请求 tab） | API 资产树（抄 Postcat 的树）每个节点右键「生成边界用例」+ 顶部「批量生成」；结果进用例列表，来源标 `spec`（happy-path/edge-case/fuzz 分类标签） |
| **A7 AI 断言生成 + 失败诊断** | Postcat：测试面板 `api/http/test/`（脚本断言）；Bruno：**Assert tab**（结构化表格）+ `TabBarAiAssist`（tab 右上角 AI 按钮）+ `ResponsePane/TestResults`；Hoppscotch：`components/http/test/` + `TestResult.vue`、`aiexperiments/ModifyTestScriptModal` | 抄 Bruno：**Assert tab 右上角「AI 生成断言」按钮**（喂当前响应 → 填充断言表格，A7 的 generateSchemaAssertions 直连）；失败诊断放**响应面板第四个 lens**「诊断」（期望 vs 实际 diff + 根因分类 contract_break/business_change/environment_diff + 接受/拒绝按钮） |
| **A4 inventory + A5 覆盖率** | 三家均无（这是 Akto 的领地） | 左栏（抄 Hoppscotch sidebar）两个一级节点：「API 资产」（= Postcat 树 + 覆盖率热力着色：绿=已测/黄=部分/红=未测）和「覆盖率看板」（独立 tab 文档，按 method/path/状态码维度） |
| **A8 场景编排 + 报告** | Postcat 有自动化测试套件页（workspace 下）；Bruno 有 Runner（`RunnerResults/`、`RunnerTimeline`，作为 tab 文档） | 抄 Bruno：**场景编辑器是一种 tab 文档类型**（左步骤列表 + 右步骤详情：用例引用/变量提取 JSONPath/环境选择）；跑完报告也开成 tab（md/json/junit 导出按钮），复用 `HoppTabDocument` 联合类型思路 |

一句话：**AI 入口三层**——① 顶栏全局录制开关（独有）；② 树/列表行内「→ 生成」按钮（录制→用例、spec→用例）；③ 编辑器内 AI 按钮（Assert tab 生成断言 + 诊断 lens）。Bruno 的 `TabBarAiAssist`（按 tab 构造上下文、onApply 直接写回字段）是我们 AI 按钮交互的直接模板。

---

## 5. 避坑（三家各自的缺点）

### Hoppscotch
- **巨石 monorepo，重**：13 个 packages（backend/relay/agent/kernel/selfhost-web/sh-admin/cli/desktop…），自建 GQL backend + Firebase 体系，selfhost 部署要拖起 backend+relay 多容器（`docker-compose.yml`）。我们只要它的 UI 层思路，**别碰它的存储/backend 架构**。
- **核心组件库外置**：`HoppSmartWindows`/`HoppButtonPrimary` 等在 npm 包 `@hoppscotch/ui`（0.2.6），仓库里看不到源码，想抄 tab 系统只能看调用侧或另装包读 node_modules。
- **多端抽象层层叠叠**：platform/kernel/relay/agent 四层间接（kernel README 自称「操作系统内核式抽象」），学习成本高；我们单 Web 端不需要。
- 云版功能（团队协作/共享）与 selfhost 版有差异，代码里耦合 `platform.platformFeatureFlags`。

### Postcat
- **Angular 15 + ng-zorro 15 双双停更**（当前 Angular 已到 19+，ng-zorro 跟随升级但 15 线不维护），**生态窄、组件库升级路径断裂**，新功能（standalone components/signals）全部无缘。选型上直接排除，只抄交互。
- **仓库即停摆**：社区活跃度远低于另两家（commit/issue 响应），抄代码要预期「没有上游维护」。
- **插件 iframe 沙箱成本**：插件市场靠 iframe 加载远端插件页（`pages.component.html` 里被注释的 iframe 缓存代码可见痛点：多插件同时存活时的内存/状态管理），我们若无插件规划不要引入此复杂度。
- 远端 API + 本地混合存储（`isLocal` 分支遍布代码），离线体验是二等公民。

### Bruno
- **桌面优先 = Web 缺位**：`pages/Main.js` 直接 `if (!window.ipcRenderer)` 报错——**浏览器里跑不起来**，Web 版属收费 Golden Edition（`Sidebar/GoldenEdition/` 付费弹窗）。我们要做 Web UI，**不能照搬它的 ipcRenderer 强依赖架构**（所有 IO 走 Electron IPC）。
- **巨石组件**：`RequestTabPanel/index.js` 单文件数千行、十余种 tab 类型 if/else 分发，加上 Redux 全局 store 里塞 collection 运行时状态——难拆难测，我们 tab 分发抄 Hoppscotch 的联合类型更干净。
- **JS 非 TS**：整个 bruno-app 无 TypeScript，重构全靠 grep；我们坚持 TS。
- 双语言版本（bruno-lang v1/v2）长期并存，解析器分叉维护成本高——警示我们存储格式 v1 定稳再发布。
- 开源/收费边界模糊（Golden Edition 功能在闭源仓库），缝合时注意只取 MIT 仓库内代码。

### 通用教训
- 三家的「请求 tab（Params/Body/Headers…）」高度趋同——这是行业事实标准，照抄即可，别发明新形态。
- 三家都在 tab 徽标/状态点上做了大量细节（Bruno indicators、Postcat nz-badge）——**状态可见性是调试台体验的分水岭**，第一版就要有。
- 没有一家把「录制→用例」「覆盖率」做成一等公民——这正是我们的差异化空间，界面骨架照抄、内容层换血。

---

## 6. MeterSphere + Chrome 录制插件（用户补充指定的第四参考）

> 仓库：`/tmp/api-ui-bench/metersphere`（主仓库）+ `/tmp/api-ui-bench/chrome-extensions`（官方录制插件）。MeterSphere 与前三家不是同类：它是**一站式测试平台**（测试跟踪/接口测试/UI 测试……），接口测试只是其中一个模块。我们只解剖 `frontend/src/views/api-test/`（149 个 .vue、2.0M）+ 录制插件全量。

### 6.1 产品形态

| 维度 | MeterSphere |
| --- | --- |
| **定位** | 一站式开源持续测试平台（接口测试 + 测试跟踪 + 测试计划 + 缺陷管理 + 工作台），企业级内部部署型产品，非个人调试台 |
| **后端** | Java Spring Boot 3.5.7（`backend/pom.xml`，Maven 多模块：`framework` / `services` / `app`），services 按 domain 拆分：`api-test` / `case-management` / `test-plan` / `bug-management` / `project-management` / `system-setting` / `dashboard`（`backend/services/pom.xml`） |
| **前端** | **Vue 3.4 + TypeScript 5.4 + Vite 5 + Pinia 2**（`frontend/package.json`），组件库 **Arco Design Vue**（`@arco-design/web-vue ^2.56` + `@arco-themes/vue-metersphere-v3` 主题包），Tailwind 混用（模板里大量 `p-[16px]` 原子类） |
| **views 模块划分** | `frontend/src/views/`：`api-test` / `case-management` / `test-plan` / `bug-management` / `workbench` / `project-management` / `taskCenter` / `setting` —— 与后端 services 一一对应，**前后端同构的 domain 划分** |
| **开源协议** | **GPL v3 + 附加条款**（根 `LICENSE`：禁止移除/遮挡 logo 和版权声明）。前端 package.json 虽标 MIT 但仓库整体遵循 GPLv3。⚠️ **传染性**：对我们（Apache/MIT 倾向）意味着**一行代码都不能抄进我们的仓库**，只能借鉴交互与思路 |
| **执行引擎** | 兼容 JMeter 生态（后端起 JMeter 跑场景），录制插件产物就是 JMX；这解释了插件「录 HTTP → JMeter 脚本」的设计取向 |
| **多语言** | 每个模块目录内嵌 `locale/zh-CN.ts` + `en-US.ts`，中文一等公民 |

**与前三家的本质区别**：Hoppscotch/Postcat/Bruno 是「API 客户端」（开发/测试人员自己调试），MeterSphere 是「测试管理平台」（团队资产：接口定义→用例→场景→测试计划→报告→缺陷全流程）。它的接口测试 UI 服从于「资产化管理」而非「快速调试」。

### 6.2 接口测试 UI 解剖（frontend/src/views/api-test/）

四个一级页面 + 一个共享组件区，结构非常清晰：

```
api-test/
├── management/    # 接口管理（接口定义 + 接口用例 + Mock，三态一页）
├── scenario/      # 场景用例（自动化编排）
├── debug/         # 调试台（一次性调试，不入库）
├── report/        # 测试报告（场景/用例报告列表 + 详情）
└── components/    # 共享：requestComposition（请求编辑器）、condition、fastExtraction
```

**① 接口管理 `management/index.vue` —— 「模块树 + 页签列表」双层结构**：

- 外层：`MsCard` + `MsSplitBox`（`#first` 300px 模块树 `components/moduleTree.vue`，`#second` 内容区）—— 和我们三栏工作台的左栏+内容区同构。
- 内层才是精髓：`management/components/management/index.vue` 用 **`MsEditableTab` 可编辑多页签**承载接口/用例文档（`apiTabs` 数组，页签 = 打开的接口定义或接口 CASE），页签 label 带 method 色块（`apiMethodName` 组件）；页签行左侧还有一个 **`a-select` 下拉在「API / CASE / MOCK」三个视图间切换**（`currentTab`，同一棵模块树对应三张表），右侧内嵌 `MsEnvironmentSelect` **环境选择器常驻页签行** —— 环境/页签/视图三个维度挤在一行，信息密度极高但逻辑清楚。
- `management/components/management/` 下按 `api/`、`case/`、`mock/`、`doc.vue` 分子目录——「定义/用例/Mock/文档」四视图共用页签系统。

**② 请求编辑器 `components/requestComposition/index.vue` —— 定义/调试双模式复用**：

- 一套编辑器组件，靠 props 切换身份：`isDefinition`（接口定义模式）vs 调试模式，definition 模式下还有 `mode: 'definition' | 'debug'` 单选钮（定义态也能就地调试）—— **「编辑即调试」**，比 Postcat「编辑页/测试页两个页面」的切分更顺。
- 顶部：协议下拉（HTTP/Dubbo/插件扩展协议）+ method 选择 + URL 输入（suffix 有 **curl 导入图标**，点击弹 curl 导入——Hoppscotch 的粘贴导入这里是按钮式）。
- 执行按钮是 **`a-dropdown-button`「本地执行/服务端执行」双通道**（`execute('localExec'|'serverExec')`）：浏览器直连目标（绕 CORS）或走后端引擎——这是平台型产品才需要的双通道，我们 Web UI 直连 + 可选代理即可。
- 参数区平铺文件：`query.vue` / `rest.vue` / `header.vue` / `body.vue` / `auth.vue` / `precondition.vue` / `postcondition.vue` / `setting.vue` + `response/` —— 与前三家的请求 tab 趋同（印证通用教训），额外多出 **前后置（pre/post）** 两个 tab，是场景化能力下放到单请求。

**③ 场景用例 `scenario/` —— 表格列表 + 步骤树编排**：

- 列表页 `index.vue` + `components/scenarioTable.vue`（表格 + 批量操作 + 模块树 `scenarioModuleTree.vue` 左栏，同管理页骨架）。
- 详情 `detail/index.vue` 内是 **步骤树 `step/stepTree.vue`**：`MsTree` 虚拟滚动（`virtual-list-props` threshold 200，**千级步骤不卡**）+ **draggable 拖拽编排**（`@drop="handleDrop"`）+ 复选框批量启用/禁用 + 步骤序号徽标 + 折叠计数。步骤类型在 `step/stepNodeComposition/` 可见一斑：`conditionContent`（条件分支）/ `loopContent`（循环）/ `waitTimeContent`（等待）/ `quoteContent`（**引用其他用例/场景**）/ `csvTag`（CSV 数据驱动）—— 场景编排的控制流原语比 Bruno Runner 的线性步骤强一档。
- 配套 `config.ts` + `useStepExecute.ts` / `useStepNodeEdit.ts` / `useStepOperation.ts` 三个 composable 拆逻辑——**千行 stepTree.vue 仍可维护的秘诀**，我们的 A8 场景编辑器直接学这个拆法。

**④ 测试报告 `report/`**：列表 + `reportDetailDrawer.vue` 抽屉详情（不用整页跳转）+ `tiledList.vue` 平铺步骤 + `exportScenarioPDF.vue` **导出 PDF 分享**（还有 `shareSceneIndex.vue` 免登录分享页）——企业场景刚需，我们暂不需要。

**⑤ 环境管理 `project-management/environmental/`**：环境不放接口测试模块内，而是**项目级配置**（与成员/文件/消息通知同级）：左栏环境列表 + 右栏 `EnvParamBox.vue` 编辑（host/全局变量/请求头/前置/后置/断言/数据库/SSL），另有 `allParams` 全局参数兜底。**每个环境的参数域比 Hoppscotch 的 {key:value} 深得多**，但配置成本也高——我们取中间态：环境 = baseUrl + 变量表 + 请求头三件套起步。

### 6.3 Chrome 录制插件解剖（chrome-extensions/）

**技术真相：这不是 MeterSphere 从零写的，而是 fork 了 SideeX（Selenium IDE 后继者，Apache-2.0）裁剪而成**——`background/background.js` 顶部版权头还是 SideeX committers；`content/` 下残留 1 万行 `selenium-api.js`/`atoms.js`/`sizzle.js`（UI 动作录制遗产，当前manifest 未启用大部分）。真正在用的流量录制核心只有约 800 行：

```
manifest.json          # MV3；permissions: webRequest + declarativeNetRequest + downloads...
js/background.js (539) # ★ service worker：webRequest 三监听 + Recorder 状态机
js/main.js (234)       # popup 逻辑：开始/暂停/停止 + 域名勾选下载
js/JMX.js (769)        # ★ 纯前端 JMX(XML) 生成器：Element 树 → jmeterTestPlan
js/editor.js + editor.html  # jsoneditor 网页：查看/编辑/删改已录流量 → 导出 json/jmx
content/recorder*.js   # SideeX UI 事件录制残留（当前主流程未用）
```

**捕获机制（`js/background.js`）——`chrome.webRequest` 三件套，不是 devtools**：

- `onBeforeRequest`（`['requestBody']` extraInfoSpec）：拿**请求体**——`formData`（表单 kv）或 `raw` bytes（手工 decode，还能从 multipart boundary 里抠出文件名/Content-Type，还原 `files` 数组）；尝试 JSON.parse，失败再按 URLSearchParams 解析。
- `onSendHeaders`（`['requestHeaders','extraHeaders']`）：拿**完整请求头**（含 Cookie——按 options 决定存成独立 `cookies` 字段还是丢弃），按 `Origin/Referer` 判定请求分级 `top_level / ajax / embedded_resource / embedded_external`（**同一域的 XHR 算 top_level 业务请求，跨域/静态资源算噪音**——这个分级思路对我们 A3 噪音检测直接可用）。
- 只录「**当前活动 tab**」的流量（`info.tabId === recorder.activeTabId`），Chrome 扩展自身的请求（`Origin: chrome-extension://`）被排除。
- 资源类型过滤（`requestFilter.types`）：默认勾选 XHR，CSS/JS/图片默认**不录**——popup「高级选项」的六个 checkbox 直接映射到 filter，从源头降噪而非录后过滤。
- 数据模型：`traffic[key] = { url, method, headers, cookies, body, files, request_type, timestamp, ... }`，以 `method+requestId` 为键；**Transaction（事务）**分组：可手动插入命名事务（content-script 注入的页面悬浮 UI `html/transaction-ui.html`），流量归属最近的事务——多事务导出成 JMeter TransactionController。

**导出/导入链路（文件，非直连）**：

1. 停止录制 → `chrome.storage.local` 存 JSON 字符串（保持顺序）。
2. popup 点保存：**按域名勾选**要保留的站点（多域时列出 checkbox；`getDomains()` 递归收域名）→ `JMX.js` 在**插件进程内**把 traffic 树转成 JMeter XML（`HTTPSamplerProxy` + `HeaderManager` + `CookieManager` + `TransactionController`，GET 参数/POST raw/form-data/文件上传全覆盖）→ `URL.createObjectURL` 触发下载 `.jmx`。
3. 也可在 `editor.html`（jsoneditor 页）人工查看/编辑/删除已录请求后导出 `.json` 或 `.jmx`。
4. 导入 MeterSphere：Web 端「场景导入」选 **Jmeter 格式上传 .jmx**（`scenario/components/import.vue` 的 `RequestImportFormat.Jmeter` 分支，`fileAccept` 返回 `jmx`）；同时支持 **Har** 格式——说明它的导入通道是通用的「文件 → 后端解析」。

**对比我们的 A2 代理录制——插件录制恰好补我们的 HTTPS 短板**：

| 维度 | MeterSphere 插件录制（chrome.webRequest） | 我们 A2 代理录制 |
| --- | --- | --- |
| HTTPS 请求体 | **明文可见**（webRequest 在浏览器内部拦截，解密前后都能拿 requestBody）——这是插件路线的决定性优势 | 代理只见 CONNECT 隧道元数据（域名/SNI/时间），**HTTPS body 拿不到**（A2 已知短板） |
| HTTPS 请求头 | 明文（含 Cookie，`extraHeaders`） | 同上，只有元数据 |
| 覆盖范围 | 仅 Chrome 内流量；且默认只录当前活动 tab | 任何走代理的客户端（curl/移动端/IDE/容器），范围更广 |
| 侵入性 | 需装插件 + 手动开关；用户心智在浏览器内 | 设代理即录，客户端零改造 |
| 降噪 | 资源类型源头过滤 + 域名勾选 + top_level/ajax 分级 | 需要我们自己在 A3 做噪音检测 |
| 数据形态 | 请求侧全量（**无响应**！webRequest 拿不到响应体——断言生成缺原料）；导出是 JMX/JSON 文件，需手动导入 | 请求+响应成对捕获（代理能看到响应），直通 A3 生成用例 |
| 录制产物 | JMeter 生态（JMX），服务其性能测试复用 | 直接生成我们的 test_case |

结论：**两者是互补通道而非替代**——代理录制覆盖广 + 有响应体（断言/AI 诊断原料），插件录制补 HTTPS 明文请求。MeterSphere 插件「无响应体」也提醒我们：真要做插件通道，得用 `chrome.devtools.network.getHAR()`（devtools 路线，请求+响应都有）或 MV3 的 `chrome.debugger`（Fetch domain 拦截，请求响应全量）补齐响应侧，纯 webRequest 是不够的。

### 6.4 缝合建议（对第 3 节 13 条清单的补充）

| # | 抄什么 | 参考文件（一比一对照） | 说明 |
| --- | --- | --- | --- |
| 14 | **「模块树 + 可编辑页签」双层结构** | `management/index.vue`（MsSplitBox 树）+ `management/components/management/index.vue`（MsEditableTab + apiTabs） | 树选资产、页签开文档，多接口并行编辑；比「列表页→详情页」跳转式少一层导航。我们第 3 条多 tab 系统的具体化形态 |
| 15 | **API/CASE/Mock 三视图共享一棵树**（页签行左侧下拉切换） | 同上 `a-select currentTab`（api/case/mock 分支 v-show） | 同一 API 的「定义/用例/Mock」三个视角不需要三棵树——直接映射我们 A4 inventory（定义）与 test_case（用例）同树切换 |
| 16 | **环境选择器常驻页签行**（`MsEnvironmentSelect` size=mini） | `management/components/management/index.vue` 页签行右侧 | 环境是「每个请求上下文」而非全局设置——环境切换就在手边，不用进设置页 |
| 17 | **定义/调试双模式一体的请求编辑器** | `components/requestComposition/index.vue`（`isDefinition` + `mode: definition\|debug` 单选） | 编辑接口定义时点一下就调试（Postcat 要跳测试页）；我们的接口编辑器直接按这个模式做 |
| 18 | **场景步骤树：虚拟滚动 + 拖拽 + 步骤类型原语** | `scenario/components/step/stepTree.vue`（virtual-list + draggable）+ `stepNodeComposition/`（condition/loop/wait/quote/csv） | A8 场景编排的直接蓝本：**引用复用（quote）+ 条件/循环控制流**比线性步骤表强；composable 拆逻辑（useStepExecute/useStepNodeEdit/useStepOperation）值得照抄工程结构 |
| 19 | **请求分级降噪**（top_level/ajax/embedded） | `chrome-extensions/js/background.js` `onSendHeaders`（Origin/Referer → request_type） | 插件在捕获时就分级「业务 API vs 静态资源/第三方」——A3 噪音检测的前移思路：**录制时分级，转用例时只认 top_level/ajax** |
| 20 | **按域名勾选保留流量** | `chrome-extensions/js/main.js`（`record_save` → domains checkbox → downloadJMX） | 多域录制会混入 CDN/统计/第三方，让用户按域一键筛——我们的录制会话列表加一个「按域分组 + 勾选导入」头部的交互，成本极低收益大 |
| 21 | **报告用抽屉不用整页** | `report/component/reportDetailDrawer.vue` | 列表行点开抽屉看详情，不打断列表上下文；我们报告 tab 内嵌抽屉 |
| 22 | **Chrome 插件作为 A2 的第二录制通道**（结论：**做，但用 devtools/debugger 路线**） | 反面教材 `chrome-extensions/js/background.js`（webRequest 无响应体） | 理由：① 补 HTTPS 明文（代理模式最大短板）；② MeterSphere 插件 800 行核心即可用，证明成本可控；③ 但必须取请求+响应（getHAR 或 chrome.debugger Fetch domain），否则 A7 断言生成没有原料；④ 产物走 JSON 直传后端转 test_case，别学它绕 JMX 文件中转（我们无 JMeter 包袱）；⑤ MV3 service worker 无 DOM/长连接，参考它的 storage.local 暂存 + 消息驱动状态机即可 |

**不建议抄**：Arco Design 组件库绑定（我们已定自有技术栈，且 Arco 的 `a-xxx` 深度绑定难以抽离）；JMeter/JMX 生态取向（我们没有 JMeter 引擎包袱）；环境管理的全量参数域（host/数据库/SSL 等十几个 tab，企业级过重）；PDF 导出/分享页（暂无场景）。

### 6.5 避坑

- **GPL v3 传染性（最重要）**：MeterSphere 主仓库与 chrome-extensions 插件仓库都是 GPLv3（插件还叠加「禁止移除 logo」附加条款）。**逐行抄代码 = 我们的仓库被迫 GPL 化**。本节所有「抄什么」均指**交互设计与结构思路**，实现必须从零写。另外插件内嵌的 SideeX 组件本身是 Apache-2.0，但整仓库以 GPLv3 发布——不能只看文件头判断。
- **Java 全家桶之重**：Spring Boot 多模块 + JMeter 引擎 + Kafka/MySQL 依赖，部署一个 MeterSphere 要拖起一整套中间件。我们是纯 TS 单进程 + 静态 UI 路线，任何「平台化」冲动（多项目/权限/消息通知/定时任务中心）都要克制——那些是百人团队协作的税，个人开发者用不上。
- **前端虽是 Vue 3 但工程重**：vue-tsc 全量类型检查 + husky + stylelint + 每模块独立 locale/——规范齐全但对标它的前提是有专人维护；我们小仓单 locale 起步即可。另注意它 Tailwind 原子类与 Arco 组件深度纠缠（模板里 `!px-[24px]`、`rgb(var(--primary-1))` 满天飞），说明「组件库 + 原子 CSS 混用」的维护成本——我们已选纯 Tailwind + 自建轻组件，方向正确。
- **插件的技术债警示**：fork 的 SideeX 遗产（万行 selenium/atoms/sizzle）大半处于「带着但不启用」状态（manifest 里 content_scripts 仍注入 jquery + content-script，但 UI 动作录制主流程已废）——**fork 开源项目做通道类功能时要敢于删死代码**，否则每次 MV 升级（它已从 MV2 迁到 MV3，`onBeforeSendHeaders` 里还留着「无法改 UA」的 MV3 妥协注释）都要拖着遗产迁移。
- **「无响应体录制」的产品缺陷**：MeterSphere 插件只录请求侧，导出 JMX 后断言/校验全靠导入后在平台里手工补——印证我们 A2+A3「请求响应成对捕获→自动生成断言」的路线价值；若做插件通道务必一次到位把响应也拿到。

---

## 七、MeterSphere 深挖：AI 助手 + 插件机制

> 聚焦两个问题：①AI 助手怎么做的 ②插件模式怎么做的。其他交互（布局/tab/树）已定 Hoppscotch 为基调，MeterSphere 的通用 UI 不再看（第 6 节已覆盖其 API 测试与录制部分）。源码：`/tmp/api-ui-bench/metersphere`（GPL v3——**只提炼交互与架构思路，严禁搬代码**）。

### 7.1 AI 助手架构

**形态：全局抽屉 + 会话双栏 + 三种模式**（`frontend/src/components/business/ms-ai-drawer/index.vue`）：

- **全局抽屉**：`MsDrawer` 80vw 宽，从导航栏全局打开（`navbar/index.vue` 挂载）；关闭时清 URL query `openAi`。抽屉内 `MsSplitBox` 左右分栏：左=会话列表（300px），右=当前对话。
- **三种模式复用同一个抽屉**：`type: 'chat' | 'case' | 'api'`——`chat` 纯聊天、`case` 生成功能用例、`api` 生成接口用例。接口定义页/用例页通过 `openAi=Y` URL 参数拉起抽屉并自动切到对应模式（`apiSelectModal.vue` 选完 API 后 `openNewPage(..., { openAi: 'Y', id })`）。**一套对话组件承载三种业务意图**，靠 props 区分。
- **会话管理**（`conversationList.vue`）：会话列表持久化在服务端（`getAiChatList`），支持重命名/删除；「新会话」是前端临时项（`isNew`，首次发言才落库）；活跃会话 id 存 localStorage 恢复现场。回答中禁止切换/删除会话（防竞态）。
- **对话区**（`conversation.vue`）：`vue-element-plus-x` 的 BubbleList/Sender/Typewriter 组件（Vue3 版 ChatUI）；用户消息可复制/编辑重发；AI 消息 markdown 渲染 + 打字机效果；回答中发送按钮变停止按钮（AxiosCanceler 取消请求）。

**模型配置：组织级 + 个人级双层，用户自带 key**（`ms-personal-drawer/components/modelConfig.vue` + `modelEditDrawer.vue` + `config/modelConfig.ts`）：

- **双入口**：系统设置→AI 模型（组织级，全员可用）+ 个人中心→我的模型（个人级，仅自己可见）。同一套表单组件靠 `modelKey: 'personal' | 'system'` 切换 API 与权限。
- **配置项**：模型名称 + 供应商（DeepSeek/OpenAI/智谱三选一）+ 基础模型（按供应商给预设列表 + 允许自由输入，`a-auto-complete`）+ API 地址 + **API Key（用户自己的 key，平台不代购）**。选预设模型自动带出高级参数默认值（temperature/maxTokens/topP，按模型不同给不同默认，如 deepseek-reasoner 只开放 maxTokens/topP）。
- **对话内随时切模型**：Sender 底部常驻模型下拉（`aiStore.aiSourceNameList`），选择存 localStorage。模型卡片可启用/禁用（禁用需二次确认，影响全员）。
- **后端引擎**：`backend/framework/ai-engine/`——Spring AI 封装（ChatToolEngine → AIDeepSeekChatClient/AIOpenAIChatClient/AIZhiPuAiChatClient 按 providerName 工厂化）；对话记忆用 `MessageChatMemoryAdvisor`（conversationId 维度）；模型配置存 DB，取用时解密 key（`AiChatBaseService.getModule`）。

**上下文注入：接口定义整体序列化进 prompt**（后端 `ApiTestCaseAIService.java`）：

- `api` 模式下，前端只传 `apiDefinitionId`；后端把接口定义 blob（URL/method/headers/query/body）解析成 `MsHTTPElement`，**过滤掉禁用/无效参数**后整体塞进 prompt 模板（`ApiCasePromptTemplateCache`），JSON Schema 自动生成示例值。前端用户输入的 prompt 作为 `userMessage` 变量嵌入模板——**业务数据全部在后端拼装，前端不感知 prompt 结构**。
- `caseConfigModal`（用户级生成偏好）：生成场景（正常/异常）+ 用例内容勾选（用例名/请求参数/前置脚本/后置脚本/断言）——这些勾选同样渲染进后端模板。偏好按用户+类型持久化（`AiUserPromptConfig` 表）。
- `caseConfigModal`（功能用例）更进一步：模板 tab（文本/步骤描述、前置条件/备注勾选）+ **设计方法 tab（等价类/边界值/判定表/因果图/场景法/正交法六种测试设计方法勾选，场景法还带补充描述输入框）**——把「测试设计方法论」做成 prompt 参数，这个思路对我们的 edge-case 生成（A5）直接适用。

**能力清单（当前实现）**：

1. **意图识别路由**（`ApiTestCaseAIService.chat`）：先用一次无记忆调用问 LLM「用户是否想生成用例？只回 true/false」，是→走用例生成模板，否→普通带记忆闲聊。**两次调用解决「聊天框既聊天又干活」**，但每次提问都多一轮 LLM 往返。
2. **生成接口用例**：结构化输出——AI 被要求用 `apiCaseStart/.../apiCaseEnd` 标记包裹每条用例（`formatAiCase` 正则提取，脏内容全丢弃）；前端 `conversation.vue` 检测到标记就渲染成**可勾选的折叠卡片**（每条用例一个 checkbox + 展开 markdown 详情）。
3. **同步落库**：勾选 N 条 → 单条走「AI→DTO 解析→回填编辑器」（`apiAiTransform`，emit 给接口用例编辑页）；多条走批量保存（`apiAiCaseBatchSave`，后端逐条解析入库，返回 successCount/errorCount）；功能用例批量保存前弹**模块树选择弹窗**（`caseModuleSelect.vue`）让用户指定存放模块。**AI 产物不直接进库，用户勾选确认才落**——人审关卡设计正确。
4. **无流式**：后端 `.call()` 同步阻塞返回全量文本（前端 Typewriter 只是视觉打字机）——**这是它最明显的落后点**，我们应上 SSE 流式。

### 7.2 插件机制架构

**核心：pf4j jar 动态加载 + 三类扩展点 + 前端脚本注入**：

- **加载器**（`MsPluginManager extends DefaultPluginManager`）：pf4j 框架。插件=一个 jar（pf4j 的 `plugin.properties` 描述 id/version）；自定义 `MsServiceProviderExtensionFinder` 额外支持 **Java SPI**（`META-INF/services/java.sql.Driver`）——这样**未改造为 pf4j 格式的第三方 jar（如 JDBC 驱动）也能直接当插件传**（`JdbcDriverPluginDescriptorFinder` 兜底解析驱动类 jar 的描述符）。
- **三层 SDK**（`backend/framework/plugin/`）：
  - `plugin-sdk`：`MsPlugin` 基接口 + `AbstractMsPlugin`（约定 jar 内 `script/` 目录放前端脚本）；
  - `plugin-api-sdk`：`AbstractApiPlugin`（接口测试插件）→ `AbstractProtocolPlugin`（协议插件，`getProtocol()` 返回协议名）+ `MsTestElement`（协议的请求数据模型扩展点，多态反序列化的关键）；
  - `plugin-platform-sdk`：`AbstractPlatformPlugin`/`Platform`（对接 Jira/TAPD 等三方平台）。
- **插件生命周期**（`PluginLoadService`）：上传 jar → 存本地 + 对象存储 → `msPluginManager.loadPlugin()`（独立 PluginClassLoader，**依赖隔离**）→ startPlugin → 解析 jar 内 `script/` 目录的前端脚本存 `plugin_script` 表 → **Kafka 通知集群其他节点同步加载/卸载**（多节点一致性）→ 启动时 `loadPlugins()` 从 DB 记录恢复全部插件（本地文件缺失则从对象存储拉回）。卸载=unload + 删本地文件 + 删 DB 记录；上传失败自动回滚（unload+删文件）。
- **场景自动识别**（`PluginService.add`）：加载后检查 `getExtensions(Driver.class)` 非空→归类 JDBC_DRIVER；instanceof AbstractApiPlugin→API_PROTOCOL；AbstractPlatformPlugin→PLATFORM。**按 jar 里实际实现了什么 SPI 接口自动分类**，上传时不用用户选类型。
- **前端动态表单（最值得抄的一招）**：协议插件 jar 内 `script/` 目录打包 JSON（`ScriptDTO`: id/name/protocol/**formOption 表单配置**/**formScript 前端脚本**）→ 前端接口编辑页按协议拉取脚本**动态渲染该协议的请求表单**（`getScript/{pluginId}/{scriptId}` 接口）——**后端插件扩展协议，前端零改造自动长出对应 UI**。
- **权限模型**：插件全局 or 指定组织可用（`PluginOrganization` 关联表）；启用/禁用开关；组织内取协议列表时按 `getOrgEnabledPlugins(orgId, scenario)` 过滤——**同一套部署，不同组织看到不同协议集**。
- **前端管理页**（`views/setting/system/pluginManager/`）：上传弹窗（名称/组织范围/描述/jar 拖拽上传/启用开关 + 「保存并继续」）+ 表格（场景/组织/Jar 名/版本/开源企业版标记/启停/脚本详情抽屉）。

### 7.3 值得抄清单

| # | 抄什么 | 参考文件（一比一对照） | 为什么值得 | 怎么落地 VerifyOS/api-test |
| --- | --- | --- | --- | --- |
| 23 | **「一套对话抽屉 + type 参数分模式」** | `ms-ai-drawer/index.vue`（type: chat/case/api） | AI 入口不该散落在各页面；同一会话系统承载多种业务意图，交互统一、开发收敛 | 一个 `AiDrawer` 全局组件；A1-A8 各能力作为 type/子模式注入（如 type=gen-case / type=diag）；业务页通过 URL 参数拉起并预选资产 |
| 24 | **生成结果→可勾选卡片→人审落库** | `conversation.vue`（标记分割→checkbox 折叠卡片→handleSync 单条/批量） | AI 生成的用例不能直接进库；「逐条勾选+预览」是成本最低的人审交互；单条可回填编辑器、多条批量入库 | A4/A5 生成用例后渲染 checkbox 卡片列表；确认后写 test_case；单条可先回填到用例编辑器再存 |
| 25 | **业务上下文由后端拼装进 prompt 模板** | `ApiTestCaseAIService.generateApiTestCase`（MsHTTPElement→模板变量） | 前端只传资产 id + 用户意图，prompt 工程全部收敛在后端一处，改模板不用发前端 | api-test 后端做 prompt 模板模块：录入 test_case/API 定义 JSON→模板渲染；模板可热改 |
| 26 | **用户级生成偏好配置（设计方法论参数化）** | `caseConfigModal.vue`（等价类/边界值/判定表/因果图/场景法勾选） | 把「测试设计方法」变成可勾选参数注入 prompt——正好是我们 A5 edge-case 生成的 UI 蓝本 | A5 面板：边界值/等价类/异常路径/鉴权绕过等策略 checkbox，勾选结果作为生成参数 |
| 27 | **意图识别路由（聊天 vs 干活）** | `ApiTestCaseAIService.chat`（先问 LLM true/false 再分流） | 一个入口既支持「帮我解释这个接口」又支持「给我生成用例」，不需要两个入口 | 单输入框：一次轻量分类调用分流 chat/gen；可优化为本地规则优先省一轮调用 |
| 28 | **模型配置双层（平台配 + 个人自带 key）+ 按模型带默认参数** | `modelConfig.vue` + `modelEditDrawer.vue` + `config/modelConfig.ts` | 个人版工具让用户自带 key 是最低成本商业模式；预设模型列表+自动带参数降低配置门槛 | 设置页 AI 模型管理：provider 预设（DeepSeek/OpenAI/智谱/本地 Ollama）+ 自定义 baseUrl+key；对话内常驻模型切换下拉 |
| 29 | **「选业务资产给 AI」的树选择弹窗** | `apiSelectModal.vue`（模块树+API 节点可选→跳转带 openAi 参数） | 从聊天模式跳到「针对某个 API 生成」时，用资产树选目标比让用户贴 URL 顺滑得多；树带搜索/虚拟滚动 | AiDrawer 内「选择 API/用例」弹窗：复用资产树组件（单选 API 节点），选定后作为上下文 id 传入 |
| 30 | **插件元数据自动分类（按实现的接口归场景）** | `PluginService.add`（getExtensions(Driver)→JDBC；instanceof→场景） | 上传即识别用途，用户零配置零选类型 | 进程内 TS 插件：声明 `provides` 字段（protocol/reporter/assertion）；PluginRuntime 按 provides 注册到对应扩展点 |
| 31 | **前端脚本随插件分发（动态表单）** | `PluginLoadService.getFrontendScripts` + `AbstractProtocolPlugin.getApiProtocolScriptId` | 后端插件带出前端 UI 配置，宿主前端零改造——扩展协议时最大省力 | TS 插件包内带 `ui.json`（表单 schema/渲染脚本），api-test 按插件动态渲染协议请求表单（用我们自己的 schema 方案，不搬代码） |
| 32 | **插件上传失败自动回滚 + 多节点同步** | `PluginService.add`（catch→unload+删文件）+ Kafka 通知 | 「加载成功才算装上」的事务性；坏 jar 不会留脏数据 | 单机场景简化：插件安装=解包→校验 manifest→注册，任一步失败全部清理；无集群可不做通知 |
| 33 | **「脚本详情抽屉」查看插件前端脚本** | `pluginManager/components/scriptDetailDrawer.vue` | 插件透明度：用户可查看插件到底往页面注入了什么 | 插件详情抽屉展示 manifest+表单 schema 只读视图 |

### 7.4 不值得抄的

- **非流式对话**（`.call()` 阻塞全量返回）——2026 年的 AI 对话不上 SSE 流式就是落后，我们直接流式。
- **每次提问都跑一轮 LLM 意图分类**——多一倍延迟与 token；应本地规则/小模型先行。
- **`apiCaseStart/End` 文本标记协议**——脆弱（AI 漏写标记即丢内容）；该用结构化输出（JSON mode/tool call）。
- **pf4j/Java SPI/jar 体系整体**——我们是进程内 TS 插件（PluginRuntime），无 JVM 包袱；只借鉴「扩展点接口+自动分类+生命周期回滚」的思想。
- **Kafka 集群通知**——单机部署用不上。
- **Arco Design + vue-element-plus-x 组件库绑定**——技术栈基调已定 Hoppscotch 路线。
- **组织级插件权限（组织关联表）**——我们无多组织模型，全局/项目两级足够。

