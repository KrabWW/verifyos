# VerifyOS 实施工单（源自《实现方案V1》+《qa-tech调研》）

> 生成：2026-09-03 · 状态跟踪用 ✅/🚧/⬜ 标记。
> 依赖图原则：**事件协议(A3) → 数据模型(B1) → 依赖链调度器(B6)** 是所有后续工作的硬前置。

## Epic A · 基建（W1）

| # | 工单 | 范围 | 验收标准 | 估时 | 状态 |
|---|---|---|---|---|---|
| A1 | Monorepo 骨架 | pnpm workspace：`apps/web`(React18+Vite+TS) `apps/server`(NestJS) `packages/shared`；tsconfig.base | server hello 已验证（/health + /api/tools 返回 8 工具）；三包 typecheck 过 | 0.5d | ✅ |
| A2 | docker-compose 基建 | PG16(+pgvector) / Redis7 / MinIO；init SQL；.env.example | 配置语法校验过；**待 Docker Desktop 启动后** `pnpm infra` 验证三服务 healthy | 0.5d | 🚧 |
| A3 | **Run 事件协议 v1** | packages/shared：10 类事件 zod schema + ev 构造器 + 领域类型（依赖双类型/6h TTL/BUILTIN_TOOLS） | **✅ 11/11 事件自检通过**（run.started→run.completed） | 1d | ✅ |
| A4 | LLM Gateway | LlmService（OpenAI 兼容，GLM/DeepSeek 可切，Langfuse 预留） | 骨架就位编译过；**待填 LLM_API_KEY 后实测**（.env.example 已备） | 1d | 🚧 |
| A5 | PoC 门禁：Stagehand × 国产模型 | P1 指令遵循 / P2 中文表单 / P3 observe 抽取 / P4 cache 回放（packages/poc，自包含中文测试页） | **✅ 4/4 通过（100%）** —— 组合：**glm-4.5v + @ai-sdk/openai-compatible 自定义 llmClient**（glm-4.6/4.5-air 推理模型大 prompt 挂起；glm-4.5 纯文本不收截图；4.5v 视觉+直出是唯一全兼容）；P4 弱断言过（cache 未真命中 1.0x，命中率待 C1 观察） | 2d | ✅ |

## Epic B · 探索闭环（W2-3）

| # | 工单 | 范围 | 验收标准 | 依赖 | 状态 |
|---|---|---|---|---|---|
| B1 | 数据模型落地 | `apps/server/migrations/001_init.sql`：21 张表全量建模（org/project/application 三类型/environment 含 preview/browser_state 6h 窗口/exploration+iteration/graph 节点边/qa_point/verification/dependency/run/step/evidence/output_value/test_plan/device_preset/audit_log）+ migrate.ts 运行器（transform 选项）+ pg-mem 冒烟 | **✅ 迁移幂等（两遍 applied→skip）；resume_from 恰 1 个约束生效；5 项反查断言全过；server typecheck 过** | A2 | ✅ |
| B2 | crawl-worker | `packages/agent-core/src/crawler.ts`：Playwright BFS 同域爬取（maxDepth/maxPages）+ 登录墙检测（password 启发式 + JS 守卫重定向处理）+ Stagehand×glm-4.5v 登录（A5 组合直接复用）+ storageState 产出（Output State）+ 页面/边抽取 | **✅ 冒烟 15/15**：无凭据撞墙仅公开页 / 有凭据登录后爬通 5 页（login→list→detail×2→about）/ Output State 恢复直访内页不踢回；typecheck 过。Crawlee 未引入（BFS 自实现 ~60 行已够，引入时机：需要自动重试/队列持久化时） | A3,B1 | ✅ |
| B3 | 凭据动态表单 | agent-core：`crypto.ts`（AES-256-GCM，iv‖tag‖ct）+ `approval.ts`（ApprovalManager：request/submit/timeout/事件流，凭据表单 schema）+ crawler 集成（无凭据遇墙→挂起→补凭据→续登）；server：`credentials.service`（角色+环境维度加密存取）+ WS `approval.requested/submit/pending` 桥 | **✅ 冒烟 16/16**（crypto 4 + 门控 6 + 全链路弹卡续爬 6）；server 启动实测通过（/health + /api/tools） | B2 | ✅ |
| B4 | Coverage Graph v1 | agent-core `graph.ts`：GraphStore.saveCrawlGraph（CrawlResult→page 节点 UPSERT + navigate 边幂等插入）+ loadGraph（应用地图数据源，边带 ref 可直接渲染）+ scoreIntent 启发式分档（0-40/41-70/71-100，LLM 评估接入点预留 intentScores 覆盖参数） | **✅ 冒烟 18/18**（落库 5 页 8 边/二次落库节点边双去重/loadGraph 结构/分档边界+list 节点 band=high）；build 过 | B2 | ✅ |
| B5 | QA 点建议生成 | agent-core `qa-extract.ts`：QaExtractor（图+页面摘要 → glm-4.5v **generateObject** zod schema 约束 → 候选：title/category 6 类/risk/actor/confidence/rationale/sourceUrl）+ QaPointStore（落 qa_point status=discovered，actor/rationale/explorationId 入 source jsonb）。Safe Mutation 的「勾选确认」步骤=状态机 discovered→selected（B 系语义已含，UI 交互在 C 系） | **✅ 冒烟 17/17**：真实 GLM 35.2s 提取 6 条（权限越权×3/边界/状态/并发，置信 0.78-0.95，sourceUrl 全部图内），zod 全过，落库断言全过 | B4 | ✅ |
| B6 | **依赖链调度器** | `packages/agent-core`：DependencyScheduler（resume_from 链构建/wait_for 跨链/环检测/6h 复用标记（独立首 pass）/链内串行共享状态/链间并行隔离 chainId/per-env 并发上限排队/Output Values 合并注入/RunEvent 事件流） | **✅ 8 项语义断言全过**：两链隔离+状态继承+output 跨链+失败传播 skipped+fresh 不重跑/stale 重跑+并发峰值=2+环检测；typecheck 过 | B1 | ✅ |

## Epic C · 执行与三态（W4-5）

| # | 工单 | 范围 | 验收标准 | 依赖 | 状态 |
|---|---|---|---|---|---|
| C1 | run-worker | agent-core `runner.ts`：RunRunner（4 类步骤：module/deterministic CSS 零 LLM · ai 走 Stagehand act · assertion url/text/element；A3 ev 事件流全程；失败快速中断）+ LocatorCache（指令→selector，命中零 LLM 重放；**已知限制**：act 结果暂未暴露 selector，缓存保持 miss 不影响正确性）+ llmCalls 计数贯穿事件 | **✅ 冒烟 10/10**：首跑 12.1s pass（st_01 llm=0 可观测/st_03 llm=1）、二跑正确性保持；server 集成 `RunsService`（POST /api/runs 异步触发 + WS run.event/run.done）+ web「▶ 运行真实 Run」按钮——**浏览器实测 17 事件全达**（pass · 17.2s · LLM 1 次） | A5,B6 | ✅ |
| C2 | 证据管道 | shared 补 `ev.evidence` 构造器（StepEvidence schema A3 已埋）；agent-core `evidence.ts`（EvidenceStore 接口 + LocalDiskStore 实现，MinIO 同接口待 Docker 起后切换）+ runner 集成（每步截图 → store + step.evidence 事件；run 末 trace.zip/HAR 归档；video 经 contextOptions 尽力而为） | **✅ 冒烟 12/12**：4 截图 PNG magic ✓ / trace ZIP magic ✓ / HAR 含请求记录 ✓ / store.list 对账 ✓；video 未透传为已知限制（软降级）；90 天生命周期待 MinIO | C1 | ✅ |
| C3 | UNKNOWN 触达校验 | agent-core `reachability.ts`：verifyReachability 纯函数（visitedUrls 触达匹配 + graph 节点存在性反查 → 三态判定与解释）+ aggregateVerdicts（fail > unknown > pass）+ runner 集成（StepDef.targetRef 声明目标分支；起始页/动作后/ai act 后三处采样 visitedUrls；全绿未触达 → 步骤改判 unknown + observation 解释 + Run 聚合 unknown） | **✅ 冒烟 17/17**：纯函数 8（触达/graph 有无节点解释差异/失败透传/三态聚合）+ 真实浏览器假绿用例（断言全绿但 refund.html 未触达 → Run verdict=unknown，解释「不允许假绿」）+ 对照组真触达 pass 不受影响 | C1,B4 | ✅ |
| C4 | 验证编辑器 + 实时流 | web 重写三列页：左步骤定义（GET /api/runs/steps，编号圈状态联动）· 中 Action Log（WS run.event 实时分组渲染：thinking 斜体/动作行带 LLM 计数/断言绿红/证据行）· 右 Run 摘要（verdict/耗时/LLM/缓存 + 触达校验明细 + 证据下钻链接 GET /api/runs/:id/evidence/*）；黑主色+lime 轻状态语言对齐原型 V7 | **✅ 浏览器实测**：初始/执行中（lime 光环步骤卡 + 实时追加）/完成态（PASS 横幅 + 4 截图+trace+HAR 可下钻）三态截图 shots/c4-*.png；server typecheck 过 | A3,C1 | ✅ |

## Epic D · 证据链与 PR（W6-8）

| # | 工单 | 范围 | 验收标准 | 依赖 | 状态 |
|---|---|---|---|---|---|
| D1 | 证据面板 + Triage | web 右列 TriageCard：fail/unknown 自动出现——失败步骤/判定/红色原因条/**失败时截图内嵌**（可点原图）/门禁徽标；证据文件列表下钻。六 Tab 完整版待 Stagehand API 级 Console/Trace 流接入 | **✅ 实测**：必败 Run（targetRef=refund.html）→ Triage 卡自动出现（UNKNOWN + 截图 + 解释）；截图 shots/triage-shown.png | C2 | ✅ |
| D2 | Preview Environment | agent-core `preview.ts`：savePreviewEnvironment（is_preview 落库 + branch/prNumber metadata + 同 PR 复用刷新 URL）+ **真实 PG 已联调**（Docker compose + explore 闭环落库实测） | **✅ 冒烟 4/4 + 真库全链路**（探索 5 节点 9 边 6 QA 点落 PostgreSQL，psql 直查确认） | B1 | ✅ |
| D3 | GitLab webhook + 影响分析 | agent-core `impact.ts`（analyzeImpact：diff→glm-4.5v 受影响业务域（风险分级+diff 证据）+ 定向回归建议（targetRef））+ webhook 全链路（MR→影响分析→**高风险自动落 issue 库**→定向 Run 触发）+ 问题库（issue 表 + GET/POST/PUT /api/issues + 问题屏（Open/Resolved/✓解决按钮） | **✅ 实测**：MR !134（退款 diff）→ impact 准确点出金额校验变更 → 3 条 issue 落库（退款流程 high）→ 定向 Run（st_reg×3 带 targetRef）→ 问题屏 3 行实测 | D2,B6 | ✅ |
| D4 | Review 生成 + 回写 | agent-core `review.ts`：generateReview（glm-4.5v generateObject：SUMMARY+AREAS，TESTS RUN 确定性生成）+ mergeGate（fail→block/unknown→warn/pass→allow）+ buildMrComment（GitLab Markdown：三段式+触达路径+证据链接+防假绿尾注）→ 落盘 out/mr-comments/ | **✅ 冒烟 16/16**：假绿 Run→unknown→[high]「退款幂等未触达」→gate=warn→评论 935B 三段齐全；对照 pass→allow「可以合并」。真实 GitLab API 回写待 token（stub 落盘） | D3 | ✅ |

## Epic E · 插件与发布（W9-10）

| # | 工单 | 范围 | 验收标准 | 依赖 | 状态 |
|---|---|---|---|---|---|
| E1 | ToolRegistry + 工具 | agent-core `registry.ts`：ToolRegistry（权限三档门控：ask→ApprovalManager 弹卡/forbidden 拒绝/auto 直执行 + 全量审计 args/via/duration + onAudit 回调）+ 内置工具（db.query 只读强制 LIMIT / db.exec ask / http / browser 等占位） | **✅ 冒烟 14/14**：query auto 执行+LIMIT / 非 SELECT 拒 / exec 批准后真实落库 / 人工拒绝 DELETE 未执行 / forbidden 拒 / 审计三 via 全量；data 透传 bug 已修 | A4 | ✅ |
| E2 | 概览后端 | GET /api/overview + web 概览 Dashboard + 执行历史屏 + PR 验证屏 + 轻路由 + **QA 点库/应用地图/凭据管理三真屏**（真 PG 数据 + SVG 地图 + AES-256 加密增删）+ **POST /api/explore 一键探索闭环 API**（Crawler→Approval→Graph→QA 全链路落库） | **✅ 真库实测**：QA 点 6 条（psql 确认）/ 地图 5 节点 9 边 / 凭据加密保存（credential=1）；持久化达成（重启不丢） | C1 | ✅ |
| E5 | 执行历史持久化 + 全栈验收 | RunsService 落 run 表（verdict/duration/llmCalls→output jsonb，重启不丢）+ Overview 从 PG 聚合（FILTER 统计 + recent 从库 + QA 总数）+ Triage 卡「→ 转 issue」按钮（失败步骤一键入问题库） | **✅ 实测**：Run 落库（psql run=1）+ overview total=1/QA=30 + **compose 全栈实测**：prod 编排起服（pg/redis healthy + server /health 8082 ✓ + web nginx 反代 200 + /api 经容器网络可达）——「30 分钟起服」真实验证 | 全部 | ✅ |
| E6 | 加固与闭环（QA 联动 + 移动 Web + 探活） | ①ensurePool 探活重建（PG 抖动后自动重连/降级，不再连续 ECONNREFUSED）②QA 点 → verification 一键生成（POST /api/verifications：登录前置 + 断言 + targetRef=sourceUrl，可选自动触发）+ QA 屏「✨ 生成验证」按钮 ③移动 Web driver（Runner device 参数 → contextOptions 设备模拟：iPhone 13/Pixel 9/iPhone SE/iPad Mini 视口/UA/触控）+ 移动屏选设备触发 | **✅ 实测**：QA→ver_poi8kj 生成+触发 / 移动 Run（iPhone 13）verdict=pass llmCalls=1 / 连接加固 tc 过。原生 App（Maestro/Appium）仍 Phase 5+ | 全部 | ✅ |
| E7 | 移动结果展示 + 对话持久化 | ①run.output 存 device + overview recent 返回 device + 移动屏「最近一次移动 Run」卡（verdict/耗时/LLM/设备视口截图内嵌可点原图）②chat_message 表（DDL 幂等）+ GET /api/chat/history + server 端 POST /api/chat 自动持久化 user/assistant（card jsonb）+ ChatView 初始化从 PG 恢复历史 | **✅ 实测**：iPhone 13 Run 卡（PASS · 8854ms · 截图渲染）+ chat history=2 落库刷新恢复 | 全部 | ✅ |
| E8 | 凭据联动 + 事件持久化回放 | ①RunsService 触发前从凭据库读角色凭据注入登录步骤（fallback 默认，AES-256 解密）②run.output 落 events jsonb（全事件流持久化）+ GET /api/runs/:id/events（内存命中→memory，历史→PG source=pg） | **✅ 实测**：Run 完成 → 回放端点 12 事件（run.started→run.completed）+ psql events_n=12 落库确认；凭据联动 tc 过 | 全部 | ✅ |
| E9 | 历史 Run 回放 UI | 执行历史行点击 → 切验证·执行屏 → GET /api/runs/:id/events 回放完整事件流（步骤卡/思考/动作/断言/证据全还原）+ 回放标识 chip（显示 Run + 「返回实时」）+ Triage 失败状态还原 | **✅ 实测**：点击历史行 → 验证屏显示「▶ 回放中：run_mtn327g4」+ 事件流+Triage 全还原（shots/replay-live.png） | 全部 | ✅ |
| E10 | chat artifact + 筛选 + Triage 下钻 | ①chat show_qa_points 动作直接渲染 QA 点列表卡（fetch 前 5 条带风险圈/置信度，不跳转）②执行历史 verdict 筛选 tabs（全部/通过/失败/无法验证）③Triage 卡加证据文件列表（截图/trace/HAR 可点击下载） | **✅ 实测**：chat 回复「📋 QA 点候选」卡 36 条前 5 条渲染（shots/chat-artifact.png） | 全部 | ✅ |
| E11 | QA 筛选 + 验证编辑器 | ①QA 点库风险筛选 tabs（全部/高/中/低）+ 搜索框（标题/ID）+ 计数 x/y ②验证·执行屏步骤定义列可编辑（每步编辑展开表单：标题/AI 指令/断言值/targetRef）+ 添加步骤（＋AI/＋断言）+ 删除 + 「💾 保存」存为验证（POST /api/verifications/blank）+ triggerRun 用编辑器状态 steps | **✅ 实测**：编辑展开表单渲染 + 添加步骤（shots/editor-open.png） | 全部 | ✅ |
| E12 | 演示动线脚本 | DELIVERY.md（一页式 8 分钟演示流程：开场→探索闭环→QA 点→验证生成→执行证据→移动→对话→PR 影响分析→问题库→历史回放→私有化部署→FAQ，带 shots 截图引用） | **✅ 文档就绪**（汇报可直接用；验证编辑器屏之前已是完整实现无需重复） | 全部 | ✅ |
| E13 | 地图详情 + QA 状态机 + Run 报告导出 | ①应用地图节点详情卡（MapView 已有完整实现：sel 状态/覆盖数据/verdict chips，核对后无需改动）②PUT /api/qa-points/:shortId/status 状态机流转 + QA 屏「✓ 确认」按钮 ③GET /api/runs/:id/report Markdown 报告导出（判定表/步骤表/触达校验/触达 URL/证据清单；内存命中→全量明细，PG 回退→events 重建）④step.completed 事件增强（+durationMs/llmCalls）+ run 落库 output 增存 evidenceKeys/visitedUrls/reachability | **✅ 实测**：QA discovered→selected 流转 ✓ / Run 报告 HTTP 200（内存路径 6 证据+3 URL 全量；PG 回退路径 st_03 LLM=1·7.2s 真实值重建 ✓ 证据/URL 齐） | 全部 | ✅ |
| E14 | chat 探索完成卡 + 容器浏览器化 | ①ChatView 订阅 WS explore.event：phase=done → 「探索完成 · 结果统计」卡（页面节点/跳转边/QA 候选 + 触达 URL 预览），有候选时链式追加 QA 建议卡；phase=error → 失败卡——替代旧的 60s 盲等定时器（F2 网站分析卡语义补齐，F2 三卡全齐：分析卡/凭据卡/QA 建议卡）②HistoryView 验证列渲染 verTitle 文本 ③Dockerfile.server 运行层 alpine→bookworm-slim + playwright install --with-deps chromium（容器可真实执行爬取/Run）④FIXTURE_DIR 修正 /app/fixtures→/app/fixtures/site（对齐宿主机语义） | **✅ 实测**：宿主机 WS done 事件（2 节点·2 边·6 QA）✓ / **容器内探索闭环**（登录页 4 交互·1 链接 → 2 页 2 边 6 QA，43s）✓ / **容器内 Run** verdict=pass（12s）✓ / web 镜像含 explore-done 打包确认 ✓。MapView 节点覆盖率 % 有意跳过（节点覆盖是二元状态，% 无诚实数据源——原型数字为装饰） | 全部 | ✅ |
| E15 | Live Findings 多类型 + 需求导入补强 | ①F4-LF：crawler 页粒度遥测（HTTP status/loadMs/consoleErrors——console error + pageerror 双通道计数）→ explore.service 转三类 finding（HTTP≥400 red / 慢响应>2.5s amber / JS 错误 amber）WS 即时出卡 ②F3-matrix：parse 顺序扫描归属功能域 + 规则文本角色提及检测 → 模块×角色矩阵（单元格=规则条数，角色行多角色拆分，无提及计「通用」）③F3-ignore：import_ignore 表（fingerprint UNIQUE）+ POST /api/imports/ignore + GET /api/imports/ignores + cross-check 过滤；**fp 粒度**（标题::关键词——同类不同关键词疑点独立忽略）④F3-flag：标记给产品 → POST /api/issues 真入问题库（[需求标记] 前缀 + source.kind=import-finding + open 标题去重） | **✅ 实测**：404 页探索 → red「HTTP 404」+ amber「JS 控制台错误」双卡 ✓ / 矩阵 员工管理×（管理员1·普通用户1·通用2）账户安全×（通用1）✓ / fp 忽略「Specification Gap::删除」后 3→2（ignoredCount=1）✓ / 标记入问题库 id=5 ✓ / 常驻栈 :8082 全端点复验 ✓ | 全部 | ✅ |
| E16 | F4-deep 接管导航记录与恢复合并 | ①crawler：暂停期间 framenavigated 记录人工导航（主框架+isPaused 过滤）+ 恢复时合并 context.pages() 当前 URL → 同源/未访问去重 → unshift 队首（depth=1）→ `takeover` 进度事件 ②BFS 循环条件含 isPaused（暂停时队列空也不退出，恢复后人访问页可并入）③explore.service takeover 分支 → WS「[接管] 人工访问 N 个页面已并入探索队列」④ExploreView 接管横幅文案告知「你访问过的页面会自动并入探索队列」 | **✅ 引擎级实测**（CDP 模拟人过登录墙）：暂停 → 人填表登录 → 恢复 → [TAKEOVER] /list.html → Agent 爬完墙内 list/about/detail1/detail2（1 页→5 页全图）✓。服务端链路（service 分支→WS）为同型事件透传。环境限制：沙箱会 SIGKILL 后台任务的有头浏览器，服务端 headful 全链路须在真实终端跑（引擎测试前台已证） | 全部 | ✅ |
| E17 | F11-dyn PR 动态探索（探索式回归） | ①webhook 触发定向 Run 后异步启动 mini-explore（maxActions=5 + 演示凭据过墙）收集 Live Findings（E15 三类 + 登录墙）②并发守卫：controlState().running 时诚实标注「引擎忙跳过」（explore 全局状态并发会互染）③完成后合并 mr.review：dynamicFindings + dynamicStats（pages/edges/qaCount）+ bot 追加探索摘要 ④PrView MR 详情新增「动态探索新发现」卡（故障/风险信号 chip + 逐条「转 QA 点」接 from-finding），findings 未就绪时显示进行中提示 | **✅ 实测**：合成 MR !77 webhook → 201（runId + dynamicExplore=started + 1 issue）→ ~50s 后 GET /api/mrs/77：dynamicStats={5 页·9 边·6 QA 候选} + dynamicFindings（登录墙 amber）+ bot 摘要齐 ✓ / web 镜像含 dynamicFindings 打包 ✓ | 全部 | ✅ |
| E4 | AI 工作区对话 | server `POST /api/chat`（glm-4.5v generateObject 意图解析：explore/run_tests/show_qa_points/show_map/chat + 中文 reply）+ 自动调度（explore/run 服务端直接触发）+ web ChatView（对话流/用户气泡/AI 卡片/快捷 chips） | **✅ 实测**：「帮我探索演示站，关注员工管理权限」→ AI 专业回复 + 🌐 探索任务卡 + **后台探索落库（QA 点 12→18）** | 全部 | ✅ |
| E3 | 私有化打包 | `docker-compose.prod.yml` + `Dockerfile.server`（pnpm deploy 展平 workspace）/`Dockerfile.web` + `infra/nginx.conf` + `DEPLOY.md` | **✅ docker build 实测全过**：verifyos-server:test 构建 ✓ 启动 ✓ /health ✓；verifyos-web:test 构建 ✓（踩坑记录：corepack pin pnpm@9.15.9（pnpm10 供应链误报）+ tsconfig.base.json 必须 COPY + pnpm deploy 处理 workspace 内部包 + npmmirror 源） | 全部 | ✅ |

## 近期顺序（本周执行）

1. **A1 → A2 → A3 → A4**（今天骨架落地）
2. A5（PoC 门禁，决定是否继续 Stagehand 主方案）
3. B1 → B6（依赖链调度器，Orchestrator 骨架）

---

## F 系：原型对齐补全（2026-09-04 晚逐屏核对产出）

> 核对方法：遍历 prototype.html 全部 15 屏（getComputedStyle + DOM 骨架提取），逐功能点对照 web 实现。
> 结论：web 已有 9 真屏，但原型有 **4 屏完全缺失**（需求导入/验证编辑器/工具插件/欢迎页）+ 8 屏存在功能点差距。
> P0=引擎已就绪只差 UI，演示价值最高；P1=演示完整性；P2=大特性。

| # | 工单 | 原型功能点（缺失部分） | 现状/依赖 | 优先级 |
|---|---|---|---|---|
| F1 | 欢迎页（s-welcome） | 新建项目表单 + 「开始探索」+ 特性卡（18 页面/4 类步骤/6 种证据）+ 双入口（创建验证/运行已有） | 纯静态屏，路由加 welcome | P1 |
| F2 | 对话富卡片 | 对话内渲染：网站分析卡 / 登录墙凭据表单卡 / QA 点建议卡（原型 ChatDemo 语义） | chat 引擎已就绪，差卡片渲染 | P2 |
| F3 | **需求导入**（s-import，整屏缺失） | 来源连接（docx/Figma/飞书）+ 上传 + 结构化拆分（模块×角色矩阵）+ **交叉验证（需求×原型×运行系统）发现测试缺口** + 草稿→审核流 + 转 QA 点/标记给产品/忽略 | QaExtractor 引擎可复用；来源连接器是主要工作量 | P2 |
| F4 | **探索可视化+人工接管**（s-explore 核心差距） | 探索路径树（34 页面·132 交互·17 流程）+「Agent 正在做什么」卡（当前动作+理由+**Intent Score 相关性评分**）+ Agent 状态面板（元素统计）+ **人工接管**（暂停/我来操作/交还）+ **Live Findings**（探索途中即时发现 + 加入 QA 点/忽略） | Crawler 引擎已有；接管需 Stagehand pause/手动控制；Live Findings 需爬取中增量产出 | **P0** |
| F5 | QA 点批量生成验证（s-qa） | 复选框多选 + 「只选 High Risk」过滤 + **批量生成验证**（勾选 QA 点→一键生成 VER）+ 新建议分组 | qa_point 表已有 status 字段；生成验证=从 QA 点模板化产 StepDef（引擎可复用 DEMO_STEPS 模式） | **P0** |
| F6 | **验证编辑器**（s-editor，整屏缺失） | 步骤编辑表单（4 类步骤）+ 验证信息卡（凭据绑定/QA 关联回跳）+ **AI Resolution 自愈 UI**（旧 selector→新 selector 语义匹配 92% 接受/拒绝）+ 缓存说明（规划→写缓存/回放不调 LLM/未命中自愈）+ 失败操作（失败分析/创建问题/清理重跑）+ 运行预估 | LocatorCache/自愈引擎 B 系已有（未命中链路 C 系已实现）；差编辑表单+自愈 UI | **P0** |
| F7 | 执行历史增强（s-run） | VER 名称关联列 + 每行「查看证据 →」直达 + 定时任务按钮（schedule 占位） | run 表已有；evidenceKeys 可查 | P1 |
| F8 | **Triage 完整屏**（s-triage 独立屏） | AI 归因置信度（92%）+ Network 请求详情 + DB 日志 + **分类表单（人工确认：Bug/环境/测试）** + 处理动作（创建缺陷（禅道/Jira 占位）/重新运行/隔离 Quarantine）+ **全链路追溯链**（RUN→VER→QA→需求→证据） | C2 证据管道已有；TriageCard 升独立屏 + 分类表单 + 追溯链组装 | **P0** |
| F9 | 应用地图增强（s-graph） | 节点覆盖率标注（75%/失败标记）+ 节点关联 QA/ISS 徽标 + **「生成缺失验证」**（对未覆盖流程一键生成）+ 查看关联 QA 点 | graph 表有 intentBand；缺覆盖率计算与关联查询 | P1 |
| F10 | 概览增强（s-dashboard） | 覆盖趋势图 + 「未覆盖关键流程」卡 + 「开始发现」「一键生成验证」行动按钮 + PR 验证次数副标题 | run/graph 数据已有；趋势=按日聚合 | P1 |
| F11 | **PR 详情视图**（s-pr 核心差距） | MR 列表统计（8 open/4 merged/3 running）+ Filters + **MR 详情**（Review 对话/动态生成 9 项验证 8 通过/**动态探索新发现卡**（HTTP failed/金额 0 可提交/连点两条日志））+ 操作（调整策略/生成 QA 点/关联验证/**回写 MR 状态**/View on GitLab）+ 阻止合并/警告徽标 | D4 review 数据可渲染；「PR 动态探索生成验证」是 qa.tech 核心语义，需 PR-Dynamic 引擎（探索式回归） | **P0**（先做列表+详情静态渲染，动态探索 P2） |
| F12 | 凭据+浏览器状态（s-cred） | **Browser State 卡组**（admin_logged_in 等可继承复用+刷新——browser_state 表 B1 已有！）+ 「测试连接」按钮 + 安全说明卡（AES-256/项目隔离/使用留痕/轮换吊销） | browser_state 表已有；测试连接=用凭据跑一次登录探测 | P1 |
| F13 | 问题同步外部（s-issues） | 「同步外部」按钮（禅道/Jira 同步占位——MCP 连接器语义） | issue 表已有；同步为占位 | P1 |
| F14 | 移动测试只读屏（s-mobile） | 移动执行详情展示（设备 Pixel 9 Pro/步骤列表/output values/发现卡）——**不做 driver，只做数据结构与展示**（为 Phase 5 备好 UI） | mock 数据展示 | P1 |
| F15 | **工具与插件屏**（s-plugins，整屏缺失） | 8 工具卡（ToolRegistry 数据直接渲染）+ 权限三档说明（自动/弹卡/禁用）+ **调用审计列表**（E1 audit 数据）+ MCP 连接器卡（CMDB/禅道/GitLab 占位 + 添加按钮） | E1 registry+audit 全部就绪，纯渲染 | **P0** |
| F16 | 新建项目路由 | 侧栏「新建项目」navitem（当前无此路由）→ 接 F1 欢迎页 | 随 F1 | P1 |
| F17 | 执行页事件流按 Run 重置（F6 实测发现） | API 触发的 run（编辑器/QA 点/Chat）不清空旧事件流 → banner/Triage 残留上一 Run 判定（f6-run-pass.png 实证） | socket run.started 时 setEvents([]) 或按 runId 分段 | P1 |

## Epic G · PR 验证原型升级（2026-09-18，源自 prototype-pr-review.html + qa.tech 对标）

> 目标：把 PR 验证模块升级到对标 qa.tech 的完整形态——门禁可配、分档计划、证据进 MR 评论、探索发现闭环。
> 切片原则：每个工单独立可验收；webhooks.controller.ts 同一时间只归一个工单所有（防并行冲突）。

| # | 工单 | 范围 | 验收标准 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G1 | 门禁模式 + 分档计划配置 | pr-config.ts：gateMode 'blocking'|'reporting'（默认 blocking）+ plan 'smoke'|'full' + fullTriggers:{branches:['release/*'],labels:[]}；normalizePr/mergePrConfig/loadPrConfig/extractPrLayers 同步；GitLab payload 提取 labels 进 PrContext；webhooks.controller.ts writeBackComment 按 gateMode 出评论（reporting→「非阻塞」标注+不拦合并）并落 mr.review.gateMode/plan；agent-core review.ts buildMrComment 加 gateMode 可选参；verifyos.config.yaml 补示例键 | cfgcheck 风格脚本断言 merge 产出 gateMode/plan/fullTriggers + 分支/label→full 档解析正确；agent-core+server build 过；8082 health ok（杀-构建-再杀-watchdog 拉起流程） | — | 🚧 |
| G2a | 证据深链·前端 hash 路由 | App.tsx：启动解析 location.hash（#/pr/<iid>→route 'pr' 并选中该 MR；#/runs/<runId>→route 'run' 回放该 run，语义对齐 HistoryView 行点击回放）；选中变化时回写 hash（history.replaceState）；PrView/HistoryView 接初始选中 props | 刷新 http://localhost:5173/#/pr/7 直达 MR !7 详情、#/runs/run_xxx 直达回放；web tsc --noEmit 过 | — | 🚧 |
| G2b | 证据深链·MR 评论内嵌截图+报告链接 | webhooks.controller.ts writeBackComment：从 run.output.evidenceKeys 选 ≤2 张关键截图经 GitLab uploads API（POST /projects/:id/uploads multipart）得 markdown 链接嵌入评论；评论尾加 [查看完整报告](WEB_BASE_URL/#/pr/<iid>)；.env 补 WEB_BASE_URL（默认 http://localhost:5173） | 真实 push 触发后 MR 评论含 2 张图片链接+报告深链；浏览器打开深链直达 MR 详情 | G1（同文件顺序）、G2a | ⬜ |
| G3 | 发现去重+降级+覆盖标注（纯模块，不接线） | agent-core 新文件 findings-dedupe.ts（指纹=归一化标题::关键词，与 qa_point 标题比对→相似则置信度合并升级不新建；kind 分 defect/risk/navigational，URL 启发式 /login /register 密码表单→navigational 折叠）+ area-coverage.ts（review.areas × targetSteps 关键词/文件匹配→每 area 得 coveredBy=step#N 或 uncovered）+ 冒烟自检脚本（纯函数全路径断言） | 自检脚本全过；npx tsc --noEmit -p packages/agent-core 过；不改任何既有文件 | — | 🚧 |
| G4 | PrView 原型升级 | 按 prototype-pr-review.html 重排 MR 详情：门禁模式 chip + 三档计划条（smoke/full/post-merge，full 显示触发条件）+ 结论横幅+证据条（截图缩略图/trace/HAR，数据源 run.output.evidenceKeys→既有 evidence 端点）+ AREAS 覆盖徽章（coveredBy→「✓已回归覆盖·step#N」/uncovered→「未覆盖」+转QA点按钮占位）+ 动态探索新发现卡（kind chip + 去重标注「已存在相似 QA 点」+ navigational 折叠「N 条已内部消化」）+ TESTS RUN 每步证据链接 + Bot 卡（GitLab/禅道深链+回写状态 chip） | 浏览器截图与原型对照结构齐全；数据全部来自真实 mr.review/run（无 mock）；web tsc 过 | G1,G2a,G3（含 G3 接线进 controller mini-explore 块） | ⬜ |
| G5 | Full 档执行引擎（P1） | plan=full → 触发时批量生成/串行执行该环境 QA 点 verification（复用 E6 QA→verification 语义）+ 聚合报告写 mr.review | 手动构造 release/* 分支 MR → full 档聚合报告落库 | G1,G4 | ⬜ |
| G6 | 端到端集成验收 | 全量 build（agent-core+server）+ 重启 server + 真实空 commit push 触发 + 三端核对：GitLab 评论（截图+深链+门禁标注）/禅道 bug#5 回写不回归/UI 新版详情页 | e2e-check.py 全绿 + 新版 UI 截图存 shots/ + MR 评论截图存档 | G1,G2b,G3,G4 | ⬜ |

**G 系实施顺序**：G1+G2a+G3 并行（文件集不相交）→ G2b、G3 接线 → G4 → G5(P1) → G6。

**建议实施顺序**（按 P0 → P1）：
1. F15 插件屏（纯渲染，1 轮）→ 2. F5 QA 批量生成（引擎复用，1 轮）→ 3. F8 Triage 完整屏（1-2 轮）→ 4. F6 验证编辑器（2 轮）→ 5. F11 PR 详情（2 轮）→ 6. F4 探索可视化（2-3 轮，接管最重）→ 7. 其余 P1 零碎 → 8. F3 需求导入/F2 富卡片（P2）
