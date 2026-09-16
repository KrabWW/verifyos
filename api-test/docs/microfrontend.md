# 微前端整合方案（A9）

> 版本：0.1.0 ｜ 状态：方案定稿，双方（VerifyOS 主项目 + api-test）成熟后落地。
> 目标：把 api-test 合并进 VerifyOS 主项目，形成统一控制台，同时保持两项目「独立开发、独立部署、独立技术栈」的既有边界。

---

## 1. 背景与现状

| 项目 | 技术栈 | 现状 | 端口 |
| --- | --- | --- | --- |
| VerifyOS 主项目 `apps/web` | React 18 + Vite 5 | 已有完整控制台（导航 / 概览 / 探索 / QA 点 / 验证执行 / 问题 / 插件等），**state 路由**（`useState<Route>`，无 URL） | 5174 |
| VerifyOS 后端 `apps/server` | NestJS 10 | 已提供 `/api/*` REST + `/ws` socket，JWT 鉴权（`JWT_SECRET`） | 8080 |
| api-test | 纯 TS 库（npm），**暂无 Web UI** | 已完成录制 / 录制→测试 / inventory / 覆盖率 / spec 用例 / 断言诊断 / 场景编排（A1-A8） | — |

**核心事实（决定选型）**：主应用是 **Vite**，不是 webpack；api-test 未来 Web UI 大概率也用 Vite（与主项目技术栈一致、开发体验好）。

---

## 2. 选型：qiankun vs Module Federation

### 2.1 候选对比

| 维度 | qiankun（基于 single-spa） | Module Federation（webpack 5） |
| --- | --- | --- |
| 定位 | 运行时组合多个独立应用 | 编译时共享模块/远程加载 |
| 构建工具要求 | 主应用不限；子应用需构建为 UMD（Vite 用 `vite-plugin-qiankun`） | **主/子应用都必须 webpack 5**（Vite 仅有社区 `@originjs/vite-plugin-federation`，不成熟） |
| 对当前 Vite 主应用 | **友好**：主应用直接 `registerMicroApps`，无需换构建器 | **不友好**：需把 `apps/web` 从 Vite 迁到 webpack，破坏现有 HMR / `@vitejs/plugin-react` |
| 技术栈无关 | 是（子应用任意框架/版本，互不感知） | 否（依赖共享要求版本对齐，React 需单例） |
| JS 隔离 | 自带 `proxySandbox`（沙箱） | 无沙箱，共享一个运行时 |
| 样式隔离 | `experimentalStyleIsolation`（shadow DOM）/ 前缀约定 | 弱，需 CSS Modules / 前缀手动约束 |
| 依赖共享 | 不强求（各应用自持依赖，体积略增） | 强项：`shared` 共享 React/状态库，避免重复加载 |
| 独立部署 | 强（子应用独立域名/构建产物，运行时拉取） | 中（需协调共享依赖版本，改动需同步发布） |
| 生命周期 | `bootstrap / mount / unmount` 钩子清晰 | 无标准生命周期，需自行约定 |
| 生态成熟度 | 成熟（阿里系，生产验证多） | webpack 原生 MF 成熟，但 Vite 侧插件不稳 |

### 2.2 结论：qiankun

**选 qiankun（single-spa 体系）**，理由：

1. **主应用是 Vite，qiankun 对主应用构建工具零要求**——`apps/web` 无需迁移构建器，直接引入 `qiankun` 包、`registerMicroApps + start` 即可。MF 要求主/子全迁 webpack 5，改造成本高、破坏现有 Vite 开发体验，得不偿失。
2. **子应用（api-test 未来 UI）可用 Vite + `vite-plugin-qiankun`**——社区成熟方案，与主项目技术栈一致；MF 的 Vite 插件（`@originjs/vite-plugin-federation`）生态不稳、依赖共享有坑。
3. **真「独立项目」边界**——qiankun 的沙箱（JS proxySandbox + 样式隔离）与生命周期钩子，天然契合 api-test「独立依赖、独立部署、独立演进」的定位，两团队互不侵入。
4. **路由与部署正交**——子应用独立构建/部署，主应用按 `activeRule` 动态加载，符合 api-test 未来独立发布节奏。

**Module Federation 的适用场景（诚实说明，暂不采用）**：若未来主/子统一收敛到 webpack 5 且需要「React 单例 + 共享状态库」这类强依赖共享（避免重复打包大依赖），MF 更优；但当前 Vite 现实下不成立，记为后置候选。

---

## 3. 主 / 子应用划分

整合后的统一控制台，一个侧边栏贯通主应用与 API 测试子应用。

### 3.1 主应用（VerifyOS 壳，`apps/web` 承担）

保留现有职责，作为「壳」提供导航、全局上下文与统一入口：

| 页面 | 归属 | 说明 |
| --- | --- | --- |
| 概览 Dashboard | 主应用 | 全局看板（可放「API 测试覆盖率」摘要卡片，数据由子应用提供） |
| 探索 / QA 点 / 验证·执行 / 执行历史 / 应用地图 / 问题 / PR 验证 / 需求导入 / AI 工作区 / 验证编辑器 / 移动测试 / 凭据 / 工具与插件 | 主应用 | 现有 UI 测试闭环，全部保留 |
| 全局设置 / 项目设置 | 主应用 | 项目切换器、环境配置（仓库 / 环境） |
| **API 测试**（新导航项） | **子应用** | 侧栏新增一项，点击挂载 qiankun 子应用 |

### 3.2 子应用（API 测试，未来 `api-test` 的 Web UI）

全部挂载在 `/api-test/*` 前缀下，承载 A1-A8 已实现的能力：

| 子路由 | 对应能力 | 归属 |
| --- | --- | --- |
| `/api-test/record` | 流量录制（代理模式，A2） | 子应用 |
| `/api-test/inventory` | API 资产清单（A4） | 子应用 |
| `/api-test/coverage` | 覆盖率看板（A5） | 子应用 |
| `/api-test/cases` | 测试用例（录制→测试 A3 / spec 生成 A6 / 断言诊断 A7） | 子应用 |
| `/api-test/scenarios` | 场景编排 + 环境变量 + 报告（A8） | 子应用 |
| `/api-test/report` | 接口报告（md / json / junit） | 子应用 |

> 边界原则：**导航 / 概览 / 全局设置归主应用；录制 / 清单 / 覆盖率 / 用例 / 场景 / 报告归子应用**。子应用不渲染自己的全局侧边栏（由壳提供），只渲染内容区。

---

## 4. 路由约定

### 4.1 升级主应用路由（落地前置项）

当前 `apps/web` 是 **state 路由**（`App.tsx` 里 `useState<Route>` + `setRoute`，无 URL）。qiankun 的 `activeRule` 依赖 URL 匹配，故整合前必须把主应用升级为 **URL 路由**：

- 采用 `history` 模式（或先 `hash` 模式降低部署门槛，Nginx 免 rewrite）；
- 保留 `Route` 联合类型语义，映射到路径：`dashboard → /`、`run → /run`、`qa → /qa` …；
- 新增一条主应用路由 `/api-test` 作为占位（渲染 qiankun 容器 `#at-root`）。

### 4.2 子应用路由前缀

- 统一前缀 `/api-test`，`activeRule: '/api-test'`；
- 子应用内部用 `react-router`（BrowserRouter，`basename="/api-test"`）自管二级路由：
  - `/api-test` → 重定向到 `/api-test/inventory`（落地页）；
  - `/api-test/record | inventory | coverage | cases | scenarios | report`。

### 4.3 主/子路由协调

- 主应用 `activeRule` 命中 `/api-test` 时挂载子应用，其余路径卸载（`unmount` 释放资源）；
- 子应用内路由切换**不经过主应用**（qiankun 自动匹配）；子应用返回主应用页面用通信机制（见 §6）通知壳跳转。

---

## 5. 鉴权约定

VerifyOS 后端用 JWT（`JWT_SECRET`），整合后同域同端口，采用「**token 透传为主 + cookie 共享兜底**」：

| 项 | 约定 |
| --- | --- |
| token 存储 | 主应用登录后写入 `localStorage['verifyos.token']`（统一 key，主/子共享） |
| token 注入 | 主应用通过 qiankun `props` 传给子应用（`props.token` / `props.getToken()`）；子应用 fetch 时加 `Authorization: Bearer <token>` |
| session 共享 | 同源部署时 cookie 天然共享（qiankun 子应用同源加载），后端 session/cookie 无需特殊处理；跨源时只走 token 透传 |
| token 失效 | 子应用收到 401 时通过通信机制通知主应用弹登录 / 跳登录页，不自行持有登录 UI |
| 首屏 | 子应用 `mount` 时读 `props.token` 或 `localStorage`，无 token 直接渲染「未登录」占位 |

> 关键点：**登录/登出只归主应用**，子应用是无状态的 token 消费者，避免两套登录态漂移。

---

## 6. 样式隔离约定

qiankun 默认样式隔离较弱，采用「**前缀 + CSS 变量**」为主，shadow DOM 为可选增强：

| 项 | 约定 |
| --- | --- |
| 子应用 class 前缀 | 子应用所有 class 以 `at-` 开头（如 `at-card`、`at-table`），避免与主应用 `.shell/.navitem` 等撞名 |
| 组件库前缀 | 若子应用引入 UI 库，配置其 `prefixCls` 为 `at-`（如 AntD `ConfigProvider prefixCls="at"`） |
| CSS Modules | 子应用默认用 CSS Modules（`*.module.css`），文件名哈希天然隔离，作为首选 |
| 全局样式 | 子应用不写裸 `body/html/*` 选择器，全局 reset 只在主应用注入一次 |
| 设计 token | 复用主应用 CSS 变量（`--text/--sub/--muted/--green/--red/--mono` 等），保证视觉统一 |
| 可选增强 | 若仍冲突，子应用开 `experimentalStyleIsolation`（shadow DOM 包裹），代价是部分第三方组件（portal 到 body）需适配 |

---

## 7. 通信约定

| 方向 | 机制 | 内容 |
| --- | --- | --- |
| 主 → 子 | qiankun `initGlobalState` / `props` | token、当前项目 id、用户信息、全局主题 |
| 子 → 主 | 事件总线（`window` CustomEvent，命名 `verifyos:` 前缀） | `verifyos:navigate`（跳主应用某页）、`verifyos:open-report`（开全局设置） |
| 子 ↔ 子 | 不直接通信 | 一律经主应用转发，保持单向依赖 |

约定事件命名 `verifyos:*`，主应用统一 `addEventListener` 收口，避免裸 `window` 事件泛滥。

---

## 8. 关键配置示例

### 8.1 主应用（`apps/web`，qiankun 注册）

```ts
// apps/web 引入 qiankun（主应用构建工具不限，Vite 直接可用）
import { registerMicroApps, start, initGlobalState } from 'qiankun';

const actions = initGlobalState({
  token: localStorage.getItem('verifyos.token') ?? '',
  projectId: '',
});

registerMicroApps([
  {
    name: 'api-test',                 // 子应用唯一名
    entry: 'http://localhost:5175',   // api-test Web UI dev server（未来）
    container: '#at-root',            // 挂载容器（主应用 /api-test 路由渲染的 div）
    activeRule: '/api-test',
    props: {
      getToken: () => localStorage.getItem('verifyos.token') ?? '',
      projectId: actions.getGlobalState().projectId,
    },
  },
]);

start({ prefetch: false, sandbox: { experimentalStyleIsolation: false } });
```

### 8.2 子应用（api-test 未来 Web UI，Vite + vite-plugin-qiankun）

```ts
// api-test Web UI 入口（main.ts）
import { renderWithQiankun, qiankunWindow } from 'vite-plugin-qiankun/dist/helper';

function render(props: any) {
  // 拿到主应用透传的 token，注入全局 axios/fetch 拦截器
  const token = props?.getToken?.() ?? localStorage.getItem('verifyos.token');
  // ReactDOM.createRoot(...).render(<App token={token} />) —— 伪代码
}

renderWithQiankun({
  bootstrap() {},
  mount(props: any) { render(props); },
  unmount() {}, // 卸载 React 根节点
  update(props: any) {},
});

// 独立运行时（脱离主应用调试）直接渲染
if (!qiankunWindow.__POWERED_BY_QIANKUN__) render({});
```

```ts
// vite.config.ts（子应用）
import qiankun from 'vite-plugin-qiankun';

export default defineConfig({
  base: '/api-test/',                          // 资源前缀与 activeRule 对齐
  server: { port: 5175, headers: { 'Access-Control-Allow-Origin': '*' } },
  plugins: [qiankun('api-test', { useDevMode: true })],
});
```

### 8.3 路由升级（主应用，落地前置）

```ts
// 主应用 state 路由 → URL 路由（示意）
// /api-test 命中时渲染 <div id="at-root" /> 交给 qiankun 挂载
<Route path="/api-test/*" element={<div id="at-root" />} />
```

---

## 9. 最小整合 PoC（本阶段交付）

因 api-test 暂无 Web UI，PoC 以「方案 + 关键配置 + 一个 hello 子应用挂载说明」为主，**不起两个 dev server**：

1. **静态演示**：`docs/microfrontend-demo.html`——单文件展示「壳（VerifyOS 侧边栏）+ 子应用（iframe 占位：录制/清单/覆盖率/用例/报告）」+ 上述 qiankun 关键配置片段（可点击切换主/子配置）。
2. **hello 子应用挂载说明**（整合时最小验证）：
   - 新建 `api-test/web/`（未来）最小 Vite + React 工程，`main.ts` 走 `renderWithQiankun`；
   - 主应用 `/api-test` 路由放 `#at-root` 容器并 `registerMicroApps`；
   - 验证点：主应用点击「API 测试」→ 侧栏高亮 → `#at-root` 出现子应用「hello」文字；`activeRule` 命中 / 卸载正常；`props.getToken()` 能读到主应用 token。

---

## 10. 迁移路径与遗留

| 阶段 | 动作 | 依赖 |
| --- | --- | --- |
| 0. 前置 | 主应用 state 路由 → URL 路由（§4.1） | 需改 `apps/web`，**不在本阶段 api-test 改动范围内** |
| 1. 壳改造 | 主应用引 qiankun + 新增「API 测试」导航 + `#at-root` 容器 | 阶段 0 |
| 2. 子应用 | api-test 新建 `web/`（Vite + React + vite-plugin-qiankun），先渲染 inventory 只读页 | 阶段 1 |
| 3. 鉴权贯通 | `props.getToken()` + 子应用 fetch 拦截器注入 Bearer | 阶段 2 |
| 4. 能力对齐 | 把 A1-A8 能力逐个接到 `/api-test/*` 子路由 | 阶段 2 |

**遗留（诚实说明）**：
1. 主应用路由升级（state → URL）是最大前置改造，涉及 `apps/web/App.tsx` 及全部 View，需主仓库工程师配合，本 A9 不改动主仓库文件；
2. api-test 当前无 Web UI，本方案只交付文档 + 静态 PoC + 关键配置，真正挂载需待子应用 `web/` 建成后验证；
3. qiankun 对 Vite 子应用需 `vite-plugin-qiankun`（UMD 包裹），若未来 api-test UI 改用 webpack，配置需相应调整；
4. 样式隔离默认「前缀 + CSS 变量」，若实测仍冲突再开 `experimentalStyleIsolation`（可能影响 portal 到 body 的弹层组件）。

---

## 11. 决策汇总

| 决策点 | 结论 | 一句话理由 |
| --- | --- | --- |
| 微前端框架 | qiankun（single-spa） | 主应用是 Vite，qiankun 主应用零构建器要求；MF 需全迁 webpack 5 |
| 子应用构建 | Vite + vite-plugin-qiankun | 与主项目技术栈一致、生态成熟 |
| 主/子划分 | 壳=导航/概览/全局设置；子=录制/清单/覆盖率/用例/场景/报告 | 保持职责清晰、子应用自治 |
| 路由 | 主应用 URL 路由 + 子应用 `/api-test/*` 前缀 | qiankun activeRule 依赖 URL 匹配 |
| 鉴权 | token 透传（`props.getToken()`）+ 同源 cookie 兜底 | 登录归主应用，子应用无状态消费 |
| 样式隔离 | `at-` 前缀 + CSS Modules + 复用 CSS 变量 | 低成本高可控，shadow DOM 作可选增强 |
| 通信 | `initGlobalState` + `verifyos:*` 事件总线 | 单向依赖，主应用收口 |
