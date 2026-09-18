# VerifyOS 插件开发指南（贡献者版）

> 核心理念：「Everything is a Plugin」。核心只留一条缝（插件宿主），增强能力全部住在
> `plugins/` 目录——你不需要读懂执行引擎，也不需要改一行核心代码，就能给 VerifyOS 加功能。

---

## 1. 30 秒总览

一个插件 = 仓库根 `plugins/` 下的一个文件夹，两个文件：

```
plugins/
  my-plugin/
    verifyos.plugin.json   # manifest：名字、描述、路由声明
    index.js               # CommonJS 入口：module.exports = { activate(ctx) }
```

```js
// plugins/my-plugin/index.js
'use strict';
module.exports = {
  async activate(ctx) {
    ctx.log('hello');
    ctx.registerRoute('get', '/ping', (_req, res) => res.json({ found: true, pong: true }));
  },
};
```

重启 API（`pnpm --filter @verifyos/server build && 重启 node dist\main.js`）后：

- 路由自动暴露：`GET http://localhost:8082/api/plugins/my-plugin/ping`
- 自动注册进 DB plugin 表（`plg_local_my-plugin`），「工具与插件」页立即可见，status=enabled
- 启动日志：`[plugin-host] ✓ my-plugin v0.1.0 · GET /api/plugins/my-plugin/ping`

---

## 2. ctx API 参考（有意保持最小）

| 成员 | 签名 | 说明 |
| --- | --- | --- |
| `ctx.name` | `string` | manifest.name |
| `ctx.log` | `(...args) => void` | 带 `[插件名]` 前缀的 console.log |
| `ctx.pg` | PG Pool | 平台 PostgreSQL（explore.pg）。查询注意只读优先；表结构见 `apps/server/src/explore/explore.service.ts` |
| `ctx.rootDir` | `string` | 仓库根绝对路径。落盘请放 `out/<你的插件名>/`（证据统一在 `out/evidence/`） |
| `ctx.pluginDir` | `string` | 插件自身目录（读自己的静态资源） |
| `ctx.require` | `(id) => unknown` | 宿主侧 require。monorepo 已有依赖（提升到根 node_modules，如 playwright/pg）直接 `require()` 也行；插件独有依赖放自己目录的 node_modules |
| `ctx.registerRoute` | `(method, subPath, handler) => void` | method ∈ get/post/put/delete/patch；最终 URL = `/api/plugins/<name><subPath>` |
| `ctx.onRunEvent` | `(fn: (e: RunEvent) => void) => void` | 订阅执行事件流（与前端 WS 同一事件源，零侵入） |

### 路由规则

- handler 是 `async (req, res) => {}`：`req = { params, query, body }`，`res = { json, status(n).json }`。
- Promise reject 会被宿主捕获并返回 `500 {"error": msg}`——直接 throw 就是标准错误形状。
- **POST body 自动读取**：插件 router 预挂载在 Nest body 解析器之前，宿主 wrapper 会对
  POST/PUT/PATCH 自动读流并 JSON.parse 后放进 `req.body`（非 JSON body 会落成 `{_raw}`）。
  插件路由命中后不会继续走 Nest 链路，因此不影响核心端点。
- **子路径至少一段**：Nest 已占用 `GET /api/plugins/:shortId`（两段，返回注册表行），
  插件路由请用三段以上（如 `/runs`、`/capture`、`/sequences`），否则会被注册表接口截胡。
- Express 5 无通配路由：路径里不要用 `*`；下载文件用 `?key=` 查询参数风格（同核心证据端点）。
- `GET /api/plugins/<name>` 与 `/api/plugins`（列表）由核心提供，插件无需也不能覆盖。

### RunEvent 事件协议（`packages/shared/src/events.ts`）

所有事件都带 `runId`，按 `type` 判别：

| type | 关键字段 | 用途 |
| --- | --- | --- |
| `run.started` | target, trigger, totalSteps | run 开始 |
| `step.started` | stepId, index, title, kind | kind ∈ module/ai/deterministic/assertion |
| `step.thinking` | stepId, text | Agent 思考 |
| `step.action` | stepId, tool, action, args | 子动作（instruction/selector/url/value 在 args 里） |
| `step.observation` | stepId, ok, detail, durationMs, screenshotId | 判定依据 |
| `step.evidence` | stepId, kind, uri | 证据（screenshot/video/trace/…） |
| `step.completed` | stepId, verdict, cacheHit, durationMs, llmCalls | 步骤终态 |
| `run.waiting_approval` / `run.resumed` | gate / gateId, approved | 审批门 |
| `run.completed` | verdict, durationMs, output, failureSummary | run 终态 |

监听器异常会被宿主逐个吞掉（`[plugin-host] run.event 监听器异常`），不影响执行主路。

---

## 3. 隔离与红线

- **单插件失败不拖垮启动**：activate 抛错 → 该插件跳过，注册表落一行 `status=draft`
  的记录（source.error 带原因），API 照常启动。排障看 server.log 的 `[plugin-host] ✗` 行。
- **不要 `require` 核心源码**：`apps/server/src`、`packages/agent-core/src` 不是公开 API。
  需要的数据要么走 ctx（pg/事件），要么走核心 REST（`/api/runs/...` 等）。
- **不要存明文凭据**：需要凭据的插件请从环境变量读，manifest 里只声明配置项名。
- **内存有界**：缓存类插件必须有上限（参考 live-run-events 的 800 条/50 run/30min TTL）。
- **改完重启生效**：宿主在 API 启动时一次性加载，不做热重载（v0 有意从简）。

---

## 4. 四个官方示例（都可当模板抄）

### 案例 A：live-run-events —— 运行中 Run 事件可读

**问题**：`GET /api/runs/:id/events` 只在 run 完成后可查，执行中排障只能翻 server.log。

**思路**：订阅 `run.event` 存内存（有界），暴露轮询端点。核心零改动——这就是
「事件已留缝、插件补消费」的标准姿势。

- `GET /api/plugins/live-run-events/runs` → 当前进程内活跃 run 列表
- `GET /api/plugins/live-run-events/runs/:id/events?since=N` → 增量事件流（id 带不带 `run_` 前缀都行）

```bash
# 触发一个 run 后立即轮询（执行中即可读，这就是它存在的意义）
curl "http://localhost:8082/api/plugins/live-run-events/runs/<runId>/events?since=0"
```

**可延伸**：接入执行历史页（对运行中的行回退调本端点）；写 Redis 让多进程共享。

### 案例 B：page-structure —— AI 生成步骤先对照真实页面 DOM

**问题**：AI 生成验证步骤时臆测 UI（编造不存在的筛选器、把 antd 页面当 Element UI），
ver_5cm3ay 首版 12 步里一半死在 selector 上。

**思路**：把「抓结构」做成插件端点，生成步骤前先抓 outline 喂给 LLM：

```bash
curl -X POST http://localhost:8082/api/plugins/page-structure/capture \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<受测页>", "cookie":"token=xxx"}'
```

返回紧凑 outline（面向 LLM）：按钮文本、输入框 placeholder、`.ant-select` 两段式提示、
表格列头、`前往/共 N 条` 分页特征 + 截图（落 `out/evidence/page-structure/`）。
outline 里的 selector 片段可直接抄进 deterministic 步骤。

**可延伸**：验证步骤生成器接上此端点（生成提示词自动附 outline）；对比两次 outline 做 UI 变更检测。

### 案例 C：locator-composite —— 复合动作序列采集（LocatorCache 增强）

**问题**：核心 `locator_cache` 只固化单动作（click/fill），antd Select 两段式、fill+Enter
提交这类**多段交互**每次 run 都要重走 LLM 规划。

**思路（诚实边界）**：插件先做「素材库」——从事件流采集同一 stepId 内 ≥2 个子动作的序列，
落 `out/locator-composite/sequences.jsonl` 并暴露查询。人审查后可把序列转成 deterministic
steps（立刻可用）；**自动固化回放**需要核心在 runner 执行 AI 步骤前留 hook（查序列 → 全
deterministic 重放），这是核心后续方向，插件侧已把数据备齐。

- `GET /api/plugins/locator-composite/sequences?q=&ver=&run=&limit=`
- `GET /api/plugins/locator-composite/stats`

**可延伸**：审查通过标记（加 PATCH 端点写状态文件）；命中率统计（对照 `locator_cache` 表的 hits 字段）。

---

### 案例 D：code-forensics —— 失败取证·代码逆向分析

**问题**：验证反复失败时，使用者要人工去代码仓库翻片段、逆向分析「页面到底长什么样、
该怎么测」。本插件把这条链自动化：失败计数 ≥ 阈值 → 关键词提取 → 检索仓库（gitlab REST / 
本地目录）→ 剪片段 → LLM 逆向分析 → 报告落盘 `out/code-forensics/<runId>.md`。

**仓库映射**（`forensics_repo_map` 表）：`POST /repos {key,provider:local|gitlab,repo,branch?,tokenEnv?}`，
key 解析优先级 verification 短 id → application 短 id → run.target 的 host → `'*'`。
项目设置页的 repo 只是展示配置；本插件的映射才是取证输入源。gitlab 令牌走 env `GITLAB_TOKEN`。

- `GET|POST /config`（threshold：同一验证失败几次后自动取证；autoAnalyze 开关）
- `GET|POST /repos`、`DELETE /repos/:key`
- `POST /analyze {runId?|verShortId?}`（手动取证）
- `GET /reports?ver=&run=&limit=`、`GET /report/:runId`
- `GET /stats`（eventsSeen/failEvents/autoTriggered/autoErrors——事件分发是否健康一查便知）

**两条血泪教训（贡献者必读）**：

1. **run.completed 事件先于落库**：runner 广播终态事件时，`runs.service` 的 run 行 INSERT
   还没提交（中间隔着 `ensureReady()`）。插件在事件回调里立刻查 `run` 表会拿到 0 行——
   必须退避重试（本插件 500ms×20 次）。诊断这类问题靠 `/stats` 的 autoErrors，别信 console 日志。
2. **glm reasoning 模型（glm-5.3-flash 等）的坑**：①不要传 `thinking:{type:'disabled'}`——
   会 400「该模型始终思考」；②`max_tokens` 是**推理+正文合并**计算的，给小了推理中途截断、
   `content` 为空（本插件用 8192，与 runner 一致）；③`content` 为空时回退 `reasoning_content`；
   ④模型爱在分析文字里引用步骤 JSON 示例——提取最终 JSON 要**扫描全部平衡 `{…}` 按契约键
   打分**（见 `pickLlmJson`），不能取第一个。

**演示**：`out/forensics-demo-repo/` 是内置假仓库，`POST /repos {key:'*',provider:'local',repo:'out/forensics-demo-repo'}`
即可对任意失败 run 体验全链路。

**接入真实代码（开发平台 CLI 实测流程）**：

1. **定位仓库**：`dev-platform-cli cmdb global-search cp-test.ruijie.com -o json` → 拿到系统与 appName；
   `cmdb frontend list --system <systemId> -o json` 的 `frontCodeAddress` 就是前端 GitLab 仓库（本例
   `compliance-platform-lowcode`）；`cmdb backend list --system <systemId>` 拿后端仓库。CLI 无代码检索命令——
   代码入口就是这些 GitLab 地址 + git 免密克隆。
2. **克隆**：`git clone --depth 1 --single-branch <url> out/repos/<repoName>`（本机 git 免密已通；
   加 `GIT_TERMINAL_PROMPT=0` 防卡交互）。
3. **注册**：`POST /repos {key:'ver_5cm3ay',provider:'local',repo:'C:/…/out/repos'}` + 同样注册
   `{key:'cp-test.ruijie.com',…}`——映射**父目录**一次覆盖多个仓库；同 key 重复注册前先 `DELETE /repos/:key`。
4. **实测结论（report id=10 / run_mu5e0bj6 / trigger=auto）**：探针步骤用
   `input[placeholder*="任务名称"]`（真实页面是「任务标题」）构造近似臆测失败。关键词精确 miss 了
   `TaskList.vue`，但 LLM 从同类真实页面**归纳出代码库惯例**并全部命中要害：搜索表单用
   `el-form-item` 中文 label + 通用 placeholder（`placeholder*=字段名` 定位必超时）、`el-pagination`
   layout 无 jumper（「前往」输入框可能不存在）、分页 `v-if="total > 0"` 空态不渲染（时序风险）——
   报告给出带行号引用的 `realUiStructure` 与 6 条可执行 `suggestedSteps`。
5. **经验**：检索词来自失败摘要与步骤定义，selector 里的中文词最有价值；关键词 miss 精确文件
   ≠ 分析失效（惯例归纳仍可用）。改进方向留给贡献者：关键词同义扩展（任务名称↔任务标题）。

---
## 5. 开发与贡献流程

1. **本地开发**：复制 `plugins/page-structure` 改名，改 manifest 与 index.js，重启 API；
   看启动日志确认 `[plugin-host] ✓`；curl 自测路由。改完不想重启？把目录压成 zip 走
   §5.5 的安装通道即可热加载。
2. **重启 API 的正确姿势（本机有看门狗）**：API 由 start-windows.ps1 的守护循环托管，
   ~4.5s 自动重启。**只需要 `pnpm --filter @verifyos/server build` 后杀掉占用 8082 的
   进程，等 ~6s 看门狗就会拉起新构建**——自己 Start-Process 抢跑会和看门狗赛跑，
   EADDRINUSE 现场一片混乱（别问怎么知道的）。
3. **自检清单**（PR 前逐项过）：
   - [ ] manifest.name 合法（小写字母/数字/连字符），与目录名一致
   - [ ] 路由 ≥ 三段子路径，不与 `/api/plugins/:shortId` 冲突
   - [ ] 内存缓存有上限；落盘只写 `out/<插件名>/`
   - [ ] activate 抛错时行为可预期（宿主会降级为 draft，不炸启动）
   - [ ] README/manifest 描述了「解决什么问题 + 怎么验证」
   - [ ] 附一个故事（[plugin-stories.md](./plugin-stories.md) 文末模板）：你踩了什么坑、
         人工走了哪些弯路、插件怎么替你干活、验证数字——故事就是需求文档 + 验收报告
3. **提交**：PR 只动 `plugins/<你的插件>/` 与本文档的示例索引，**不碰 `apps/`、`packages/`**。
4. **评审关注点**：权限（`permission: ask` 用于有副作用的端点）、错误处理、资源释放
   （浏览器/context 用完即关，参考 page-structure 的 finally）。

## 5.5 分享与安装：zip 插件包（即装即用）

插件分享的正式形态是一个 **zip 安装包**：对方在「工具与插件」页点「导入插件」选 zip，
解包校验后落盘 `plugins/<name>/` 并**即时激活**（不重启、注册表立刻 enabled）。

**打包**：把插件目录压成 zip。两种布局都认——

```
my-plugin.zip
├── verifyos.plugin.json      # 布局①：文件在 zip 根
└── index.js

my-plugin.zip
└── my-plugin/                # 布局②：统一在单个顶层目录下
    ├── verifyos.plugin.json
    └── index.js
```

**安装渠道**：

1. UI：「工具与插件」→「导入插件」→ 选 `.zip`（`.json` 元数据导入仍可用）；
2. curl：`POST /api/plugins/install`，body `{"filename":"my-plugin.zip","dataBase64":"<zip 的 base64>"}`
   → `{ok:true, name, version, routes, replaced, registryShortId}`。

**语义**：

- 安装 = 落盘 + 激活 + 注册表 upsert（`plg_local_<name>`，enabled）；目录已持久化，
  重启后随启动扫描自动加载，无需重装。
- **同名热替换**：zip 里 `version` 升级后重装同一 `name` → 旧实例先 deactivate（监听器整组摘除、
  路由表换处理器）再激活新版，全程不断 API。返回 `replaced:true`。
- **卸载**：列表里删除 `plg_local_*` 行 = deactivate + 删 `plugins/<name>/` 目录 + 删注册表行
  （路由随后 404）。
- 限制与校验：zip ≤ 20MB；条目路径禁 `..`/绝对路径；`manifest.name` 必须合法；缺 `index.js` 拒装。

> ⚠️ **红线**：安装 zip = 在宿主进程里执行插件的 `activate()`（任意代码）。只安装可信来源，
> 对外分享渠道必须过人审（permission、副作用、资源释放），参见 §3。

---

## 6. FAQ

**Q：插件能用 TypeScript 吗？**
可以，但要自己先编译成 index.js（宿主只 require CommonJS 的 index.js）。示例保持纯 JS 就是为了零构建。

**Q：能加新依赖吗？**
优先用 monorepo 已有的（根 node_modules 已提升：playwright、pg、openai、zod…）。确需新依赖：
在插件目录里放自己的 `package.json` 并 `npm install`（Node 解析会命中插件目录的 node_modules）。

**Q：怎么调试？**
`ctx.log` 输出到 server.log（`[插件名]` 前缀）；路由错误宿主会打 `路由 GET /... 失败: 原因`。
注册表 source 字段会记录加载时间或失败原因，`GET /api/plugins/plg_local_<name>` 可查。

**Q：抓页面时 ERR_CONNECTION_CLOSED？**
URL 必须从 API 服务器所在机器可达（本机演示用 fixture 站点或内网受测地址；公网目标在
受限网络下可能连不通）。受测页需要登录时传 `cookie` 字符串。

**Q：为什么我的插件页面上是 draft？**
加载失败了。看 `GET /api/plugins/plg_local_<name>` 的 source.error，或 server.log 的 `[plugin-host] ✗`。
