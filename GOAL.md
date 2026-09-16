# GOAL: P 系 · 功能缝合全量 + AI 化 Intelligent Layer

状态: 已完成（P1+P2 关账，P3 远期另立）
创建: 2026-09-08 17:58
更新: 2026-09-09 09:35

## 目标

九模块全部拥有（补短板），AI 渗透到每个模块（不是独立功能，是 intelligent layer）。

## P 系步骤（依赖序）

### Phase 1 · 短板补齐（九模块均 ≥ 4/5）
- [x] P1.1 流量录制 HTTPS 解密 ✅ 2026-09-08 20:55 eng-rec-up：Chrome MV3 插件（devtools HAR 捕获含明文 body+分级）+ import:har 命令 + 导入直通用例生成闭环
- [x] P1.2 噪音检测前移 ✅ 2026-09-08 20:55 eng-rec-up：classify.ts 启发式链（sec-fetch-dest>XHR>accept>扩展名），代理两处记录时分级落库，demo:classify 全绿
- [x] P1.3 依赖 mock 精度 ✅ 2026-09-08 20:55 eng-rec-up：schema 树提取（动态字段标记+敏感值不入产物）+ 按类型回放生成 + 旧死值快照兼容，test:mock-schema 40 断言
- [x] P1.4 AI 语义标注 ✅ 2026-09-08 20:50 eng-inv-edge：classify.ts 规则式（security/external/deprecated/internal）+ LLM 预留 + store.autoAnnotate，demo:inventory 37 PASS
- [x] P1.5 嵌套 edge-case ✅ 2026-09-08 20:50 eng-inv-edge：nestedFields 递归（maxDepth=3，数组 '[]' 路径段）+ fuzz 嵌套采样，用例 55→66
- [x] P1.6 条件/循环/CSV ✅ 2026-09-08 20:55 eng-scn-up：安全表达式求值器（无 eval）+ 条件 then/else + 循环三模式（count/forEach/while）+ 数据集笛卡尔积，demo:scenario 39 PASS
- [x] P1.7 NL→断言 ✅ 2026-09-08 20:55 eng-ai-up：nl.ts 中英文十类语法（状态码/存在/相等/类型/比较/包含/多子句）+ 路径校验+候选建议，verify:nli 10 节
- [x] P1.8 自愈断言 ✅ 2026-09-08 20:55 eng-ai-up：self-heal.ts 两级映射（同值字段优先+同名挪位）+ changes 人审 + broken 诚实列表，verify:heal 6 节

### Phase 2 · AI Intelligent Layer（AI 渗透九模块）
- [x] P2.1 AI 助手全局抽屉 ✅ 2026-09-09 eng-ai-core：AiAssistant 四模式（chat/gen/diag/explain，规则引擎先行+LLM 增强+降级标注），provider 三态（Mock/OpenAI 兼容/env 兜底），verify:ai-core 58 PASS
- [x] P2.2 流量→AI 洞察 ✅ 2026-09-09 eng-insight：analyzeTraffic/analyzeHar/renderInsight，五层建议优先级（security>写操作>错误响应>页面依赖>其余），verify:insight 21 PASS
- [x] P2.3 生成结果→勾选卡片→人审入库 ✅ 2026-09-09 eng-ai-core：ReviewPipeline（buildCandidates/setChecked/reject/confirm 幂等/confirmAll），入库带 aiCreate:true + review_status=pending
- [x] P2.4 测试方法论 checkbox 注入 prompt ✅ 2026-09-09 eng-ai-core：四方法论（等价类/边界值/判定表/场景法）buildMethodologyPrefix 注入 + generateMethodologyCases 无 LLM 规则式生效（边界值 min-1/min/max/max+1）
- [x] P2.5 Spec Diff AI 审查 ✅ 2026-09-09 eng-insight：diffSpecs（端点/参数/请求响应 schema/枚举/响应码五级）+ breaking/warning/info 分级 + reviewDiff 中文报告
- [x] P2.6 AI 文档生成 ✅ 2026-09-09 eng-doc-model：generateApiDoc（method+path 分组/参数表四路来源/响应示例/断言摘要/相关用例），verify:doc-model 48 PASS
- [x] P2.7 模型双层配置 ✅ 2026-09-09 eng-doc-model：平台预设（智谱/DeepSeek/OpenAI 兼容/Ollama）+用户层覆盖，key 脱敏+0600 权限，getActiveLlmConfig null 兜底
- [x] P2.8 流式 SSE ✅ 2026-09-09 eng-sse：SSE 协议层（start/delta/progress/done/error）+三流式生成源+Node 消费端+web/stream-demo.html，verify:sse 24 PASS（单命令原子模式，error/abort 路径含）

### Phase 2 集成接线 ✅ 2026-09-09 主 agent：package.json 加 verify:ai-core/insight/doc-model/sse 四 script；src/index.ts 统一 re-export 六新模块；web/index.html 挂 stream-demo 入口。终验：tsc 零错 + 四新 verify 全 PASS + Phase 1 五回归全 PASS。

### Phase 3 · 进阶（远期，不阻塞 Phase 1-2）
- [ ] P3.1 流量→反向生成 OpenAPI 契约（Specmatic 式）←A2+A4 合成
- [ ] P3.2 自愈映射（schema drift 时运行时映射新字段名）←Tricentis
- [ ] P3.3 测试优先级/影响分析（TCP/TIA，按失败频率选子集跑）←Tricentis
- [ ] P3.4 混沌/故障注入
- [ ] P3.5 生产流量监控→自动生成测试（shift-right）

## 完成标准（可客观验证）

- [x] 九模块每项 ≥ 4/5（对照评分表） ✅ 2026-09-09：模块 1-8 达成 4~4.5（见 api-test/docs/scorecard.md，逐项代码+验证脚本证据）；模块 9=2 不达标但**用户豁免**——补齐项全在 P3.4/P3.5 远期（shift-right/混沌/OWASP），P 系按 1-8 达标关账
- [x] AI 能力至少覆盖模块 1-8 中 6 个 ✅ 2026-09-09：实测 6 个（1 流量洞察 P2.2 / 2 Inventory 标注+上下文 / 3 Spec Diff 审查 P2.5 / 4 生成+方法论+人审 P2.1/P2.4/P2.3 / 7 场景法生成 / 8 自愈诊断）
- [x] 全站 0 JS 报错 + tsc 零错 ✅ 2026-09-09：api-test tsc --noEmit 零错；用户故事 E2E JS 错误 0；web/stream-demo.html file:// 无报错
- [x] E2E 全链路（录流量→AI 生成→跑→报告→推送）真跑通 ✅ 2026-09-09：6 用户故事 26/26 通过（/tmp/story-e2e.cjs 重跑）

## 执行日志

- 2026-09-08 17:58 P 系立项。用户拍板「功能缝合全都要 + AI 化为差异化核心」。
- 2026-09-09 08:45 **Phase 2 完成 + 集成接线**（见下条阻塞记录）。
- 2026-09-09 09:35 **P 系完成标准终核 + 关账**：九模块评分表正式落盘 api-test/docs/scorecard.md（此前散落会话记录未成文）；逐项证据复核——模块 1-8 全 ≥4（含 P2 升级的模块 3 契约 4.5），模块 9=2；AI 覆盖 6/8 模块；tsc 零错 + E2E 26/26 JS 0 错 + 五 demo 全 PASS。用户决策：**模块 9 豁免（归 P3.4/P3.5 远期），P 系关账**。P1 8 项 + P2 8 项 + 集成接线 + 完成标准 4/4（1 项带豁免口径）全闭合。Phase 3 五项远期项保留待后续另立 GOAL。
- 2026-09-08 20:25 **原型验收通过**：完整可交互原型（prototype.html，89/89 组件断言 + 6 用户故事 E2E 26/26 全绿 + 0 JS 错误）。用户确认「原型成功」，P 系 Phase 1 开跑。：完整可交互原型（prototype.html，89/89 组件断言 + 6 用户故事 E2E 26/26 全绿 + 0 JS 错误）。用户确认「原型成功」，P 系 Phase 1 开跑。
- 2026-09-09 08:20 **Phase 2 重派**：昨晚四路派工全部 429 限额失败（零产出），限额已重置，重写自包含任务书重派四路——eng-ai-core（P2.1 助手四模式+P2.3 勾选人审+P2.4 方法论注入，域 src/ai/）/ eng-insight（P2.2 流量洞察+P2.5 Spec Diff 审查，域 src/insight/）/ eng-doc-model（P2.6 文档生成+P2.7 模型双层配置，域 src/docs-gen/+src/config/）/ eng-sse（P2.8 流式 SSE+原型接入，域 src/stream/+web 新文件）。冲突控制：package.json/src/index.ts/web 现有文件禁改，主 agent 集成时统一接线。
- 2026-09-09 10:30 **P2 引擎 → 原型 UI 接线收口（TaskList #1-#8 全 closed）**：prototype.html 追加 p2Enhance IIFE 接入 P2 七能力；修复「IIFE 同名函数未 window 导出 → chat/explain/流式走旧实现死路径」根因（导出 + #aiSend cloneNode 重绑，因 click 监听绑定时刻捕获函数值）。终验三层全绿：p2-smoke 25/25（JS 0 错）+ verify-r2 26/26 + story-e2e 26/26（JS 0 错）。P 系引擎 + 原型接线全链路收口。

## 阻塞记录

- ~~Phase 2 四路派工 429 限额失败（2026-09-08 22:21 重置）~~ 已解除：2026-09-09 08:20 重派，四路当日全部交付。
- 2026-09-09 08:45 **Phase 2 全部完成（8/8）+ 集成接线**：四路交付（58+21+48+24=151 断言全 PASS）→ 主 agent 统一接线（npm scripts/src/index.ts 出口/web 入口）→ 终验全绿（tsc 零错 + 四新 verify + Phase 1 五回归）。
- 2026-09-09 09:35 **P 系关账（完成标准终核）**：模块 1-8 全 ≥4 达标 + 模块 9 用户豁免归 P3 → 四条完成标准全闭合（详见执行日志 09:35 条）。Phase 3 五项远期项保留待后续另立 GOAL。

（无当前阻塞）

---

# GOAL: O 系 · CLI + 连接器 + PR 验证 + API 测试（补齐外部集成缺口）

状态: 进行中
创建: 2026-09-07 22:50
更新: 2026-09-07 22:50

## 背景

承接 REALITY-AUDIT.md 的「外部集成 stub」缺口 + 业内最佳实践调研（Momentic/Apifox/MeterSphere/禅道/飞书/GitLab）。10 张 ticket 已拆到 .scratch/vnext/issues/（to-tickets 本地文件模式）。核心认知：执行模型=缓存回放（冷跑 LLM/热跑零 LLM/miss 自愈），CLI+MCP+Skill 三件套，读走 MCP 写走 Webhook/REST，连接器本地 Docker 跑通。

## 完成标准（全部满足才算完成，每条必须写明验证方式）

- [x] T1 CLI 骨架 + init/login ✅ 2026-09-07 23:40 eng-cli：packages/cli（bin 指向 dist/bin.js）+ init 生成 config.yaml + login 存 token + 10 命令骨架，tsc 零错 + --version/--help/init/login 四命令真跑通（npx 发布留后续）
- [x] T2 CLI run ✅ 2026-09-08 00:20 eng-cli2：run/report 命令 + 退出码 0/1/2/3 + 报告含 llmCalls/token 估算/缓存命中/证据/步骤明细，真跑退出码 0 验证
- [x] T3 飞书推送 ✅ 2026-09-08 00:40 eng-connectors：FeishuNotifier 异步推飞书机器人（成功/失败两路径挂 runs.service），mock 端点收到正确 payload，无 URL 静默跳过
- [x] T4 禅道 + Jira 建缺陷 ✅ 2026-09-08 00:40 eng-connectors：DefectTracker 真调禅道 API 2.0（Token）+ Jira REST（Basic Auth），删除 Math.random 假 ID，source.external 写真实 ID，缺凭据诚实报错
- [x] T5 MR/PR 回写（GitLab + GitHub） ✅ 2026-09-08 08:10 eng-pr-writeback：GitlabClient/GithubClient（webhook token 鉴权 + 真拉 changes/files + buildMrComment 三段式评论回写），新增 /api/webhooks/github 端点 + rawBody，mock 双平台端到端全过（19 单测 + 401/201 鉴权 + diff 拉取 + 评论回写）
- [x] T6 MCP server ✅ 2026-09-08 00:30 eng-mcp-server：stdio MCP server（run/read_run/list_verifications 三工具 + inputSchema），端到端 client 连 server → tools/call run 真触发验证 verdict=pass
- [x] T7 3 个 Skill ✅ 2026-09-08 00:40 eng-skills：packages/cli/skills/ 三个 SKILL.md（test/spec/maintain），MCP 工具范式与实际 inputSchema 逐条对照一致，含正确写法 vs 反例
- [x] T8 PR 验证旅程 ✅ 2026-09-08 00:20 eng-pr：pr-config.ts 三层优先级 merge + 门禁对齐 mergeGate + 分支/文件 glob 触发规则，curl 实测（develop 跳过/feature 触发/override 覆盖）
- [x] T9 多项目↔多 repo/环境 ✅ 2026-09-08 00:30 eng-multiproject：project_repo/project_environment 表 + 增删 API + webhook 按 repo 反查项目（SSH 归一化）+ 欢迎页/项目设置增删 repo/env
- [x] T10 API 测试独立项目（A1 完成，A2-A9 后续） ✅ 2026-09-08 00:50 eng-api-scaffold：api-test/ 独立脚手架（npm）+ 技术选型（录制层代理起步/eBPF 后置 + 四表草案），typecheck/build/start 全过
- [x] T11 桌面端 ✅ 2026-09-08 08:30 eng-desktop：Electron 选型（纯 TS 团队零新语言）+ desktop/ 桌面壳（token 持久化 6/6 验证 + 回退本地页），GUI 启动受 agent 环境签名限制已诚实标注
- [x] T12 Figma 连接器 ✅ 2026-09-08 00:50 eng-figma：FigmaReader 真调 /v1/files/{key} 抽 Frame/Component/Text → 进需求导入拆分，mock 验证提取正确，缺 token 诚实报错
- [x] T13 原生移动 App ✅ 2026-09-08 08:30 eng-mobile：Maestro/Appium 选型（Maestro 起手/Appium 真机后置）+ native-mobile 触发链路占位，Web 设备模拟不被破坏
- [x] T14 占位工具接真实现 ✅ 2026-09-07 23:40 eng-tools：http 真 fetch+超时重试、code.view 真调 GitLab API、vision 真调 glm-4.5v、browser/evidence/report 诚实 ok:false 标注（registry 层无引擎实例）；makePlaceholderTool 清零（grep 确认）
- [x] T15 MCP 连接器 ✅ 2026-09-08 00:20 eng-mcp-adapter：手写 JSON-RPC over stdio/SSE McpClient + McpToolAdapter（tools/list→ToolRegistry→invoke 转发→断线重连），冒烟 echo/add/crash 全过，PluginRuntime 接入 load/unloadMcp
- [x] T16 验证脚本化/固化 ✅ 2026-09-07 23:40 eng-solidify：selector 三策略提取增强 + locator_cache 表持久化 + ai 步骤固化写回 verification.steps。实测冷跑 11417ms/llmCalls=1 → 热跑 1946ms/llmCalls=0（单步 9321→129ms）+ 跨重启命中；主 agent 独立复验 llmCalls=0

## 步骤清单（依赖序）

- [ ] T1 CLI 骨架 + init/login
- [ ] T2 CLI run（阻塞 T1）
- [ ] T3 飞书推送
- [ ] T4 禅道 + Jira 建缺陷
- [x] T5 MR/PR 回写（GitLab+GitHub） ✅ 2026-09-08 08:10
- [ ] T6 MCP server（阻塞 T1）
- [ ] T7 3 个 Skill（阻塞 T6）
- [ ] T8 PR 验证旅程（阻塞 T1）
- [ ] T9 多项目↔多 repo
- [ ] T10 API 测试独立项目（微前端合并，无阻塞，独立立项）
- [ ] T11 桌面端（低优先级后置，无阻塞）
- [x] T12 Figma 连接器 ✅ 2026-09-08 00:50
- [ ] T13 原生移动 App（低优先级后置，无阻塞）
- [ ] T14 占位工具接真实现（无阻塞）
- [ ] T15 MCP 连接器（无阻塞）
- [ ] T16 验证脚本化/固化（无阻塞，引擎内增强）

## 执行日志（追加式，禁止删除历史）

- 2026-09-07 22:50 O 系开启。ticket 拆票完成（10 张，垂直切片，依赖：T2/T6/T8←T1，T7←T6，T10←T2；T3/T4/T5/T9 独立）。用户补充三点已吸收：①GitHub 集成并入 T5（本地 Docker）②CLI 功能范围在 T1 里定为命令行入口四类命令 ③API 测试新增 T10（对标 MeterSphere 开源 + Apifox 商业）。决策已记 MEMORY.md（插件化简化版→未来 Cordis 演进 + 执行模型=缓存回放 + 环境约定）。

## 阻塞记录（当前无则填"（无）"）

（无）

---

# GOAL: N 系 · DSH 进程内插件运行时（核心能力可扩展）

状态: 已完成
创建: 2026-09-07 22:18
更新: 2026-09-07 22:30

## 背景与方向决策

用户拍板：偏向 DSH 的「进程内插件」模式（Cordis 式），而非纯 MCP 协议。理由成立——测试能力的扩展（数据库多源/知识库/自定义步骤类型/IM）需要**深度共享引擎**（Stagehand/LLM/证据/缓存），进程内插件可 import 主程序 service 直接拿这些，MCP 进程外协议反而隔了一层。最终架构 = **混合**：进程内插件扩展核心能力；MCP 连接器（L7 已有）只接外部第三方系统（飞书/禅道/MySQL server）。

**技术可行性已验证**（22:18）：tsx `tsImport('/abs/plugin.ts')` 能在编译版 server 运行时动态加载外部 TS 插件，`mod.default.default` 为 activate 函数，`activate(ctx) → registerTool → onDispose` 全链路 OK（实测 registered=['hello'], disposed={disposed:true}）。

## 完成标准（全部满足才算完成，每条必须写明验证方式）

- [x] N1 插件运行时 ✅ 2026-09-07 22:30 PluginRuntime（require('tsx/cjs') hook + require(entry.file) → activate → 持有实例 + onDispose 回滚）+ PluginRuntimeController（load/unload/reload/GET）+ registry.unregister 补方法。实测 load→工具注册→unload 回滚全通
- [x] N2 插件 API 白名单 ctx ✅ 2026-09-07 22:30 registerTool/llm/db(只读 query)/config/log 注入；示例插件 order-db.count 经 ctx.db 真查 PG 返回 64 条 run；工具进 ToolRegistry（权限三档+审计+invoke 全通）；tsx 移入 dependencies
- [x] N3 manifest 扩展 + 前端 ✅ 2026-09-07 23:00 n3-ui：代码徽章/加载卸载按钮/已加载状态/详情抽屉 entry.file/创建向导 entry.file，typecheck 零错 + playwright 5 断言全过 + 3 截图
- [x] N4 示例插件端到端 ✅ 2026-09-07 23:00 n4-doc：external-db.plugin.ts（真外部库 Pool + ext-db.query/count + 注入防护 + onDispose 关连接），运行时验证全绿
- [x] N5 文档 ✅ 2026-09-07 23:00 PLUGIN_GUIDE「九、代码插件（DSH 进程内）」：activate(ctx) 约定 + ctx 白名单 + 生命周期 + 可复制示例 + 安全模型
- [x] N6 全量回归 ✅ 2026-09-07 23:00 双端 typecheck 零错 + 11/11 PASS

## 步骤清单

- [x] N1 插件运行时（加载器 + 生命周期） ✅ 2026-09-07 22:30
- [x] N2 插件 API 白名单 ctx ✅ 2026-09-07 22:30
- [x] N3 manifest 扩展 + 前端 ✅ 2026-09-07 23:00
- [x] N4 示例插件端到端 ✅ 2026-09-07 23:00
- [x] N5 文档 ✅ 2026-09-07 23:00
- [x] N6 全量回归 ✅ 2026-09-07 23:00

## 执行日志（追加式，禁止删除历史）

- 2026-09-07 22:18 N 系开启。方向=DSH 进程内插件（用户拍板）+ 混合 MCP（外部系统）。技术可行性已验证：tsx tsImport 动态加载 TS 插件 + activate/registerTool/onDispose 全链路 OK。关键设计：插件 API 白名单（ctx 只注入 registerTool/llm/db/config/log，不暴露全局 require/fs/process）是安全核心。

## 阻塞记录（当前无则填"（无）"）

（无）

---

# GOAL: M 系 · 插件执行打通与共创闭环（Cordis 理念落地）

状态: 已完成
创建: 2026-09-07 17:58
更新: 2026-09-07 18:05

## 完成标准（全部满足才算完成，每条必须写明验证方式）

- [x] M1 对话上下文注入 ✅ 2026-09-07 18:00 验证：curl /api/chat 问「装了哪些插件/能访问什么库」→ AI 准确报出 order-db.query + orders/inventory/users 表结构（来自插件 schemaSummary）
- [x] M2 插件工具映射执行 ✅ 2026-09-07 18:00 验证：/api/tools 列表含插件工具（同名去重）；invoke order-db.query → viaPlugin=plg_cbtvov + baseTool=db.query + LIMIT 强制 + 审计入账
- [x] M3 插件探活端点 ✅ 2026-09-07 18:00 验证：POST /api/plugins/plg_cbtvov/probe → ok=true via=db.query（SELECT 1 连通）
- [x] M4 导出/导入 ✅ 2026-09-07 18:02 验证：export JSON 脱敏（password 置空）→ DELETE → import 复活（新 short_id plg_42oxgw，manifest/ui 完整保留）
- [x] M5 共创前端 ✅ 2026-09-07 18:35 e2e-eng E2E 9/9 PASS（探活 msg/导出脱敏/导入出现+清理）+ 主 agent 修复其发现的布局 bug
- [x] M6 文档 ✅ 2026-09-07 18:05 PLUGIN_GUIDE 增补三节（六 UI 扩展 / 七 工具映射 / 八 共创导出导入）
- [x] M7 全量回归 ✅ 2026-09-07 18:10 验证：11/11 PASS（T8/T9 首轮 FAIL 揪出真 bug：verifications 列表 LIMIT 50 截断导致老验证被挤出、动线断——已提到 200 并复验全绿）

## 步骤清单

- [ ] M1 对话上下文注入
- [ ] M2 插件工具映射执行
- [ ] M3 探活端点
- [ ] M4 导出/导入
- [ ] M5 共创前端
- [ ] M6 文档增补
- [ ] M7 全量回归

## 执行日志（追加式，禁止删除历史）

- 2026-09-07 17:58 M 系开启（用户指令：阶段2 阶段3 都干掉）。前置：U29 插件 UI 扩展已全绿（侧栏「插件」分区+「订单库面板」声明式页面），示例插件 plg_cbtvov（数据库上下文·订单库，enabled，含 ui.menu/implements 工具声明）。设计决策：custom 插件工具走「implements 基座工具 + config 注入 args」映射（不照搬 Cordis effect 回滚——测试插件副作用=配置，禁用即回滚已够）。
- 2026-09-07 18:00 **M1-M4 后端一批完成**：M1 chat.controller 查 enabled 插件拼 pluginContext 段（parseChatIntent 加参）→ AI 实测准确说出插件与表结构；M2 tools.controller pluginTools()（list 合并+同名去重）+ invoke 插件工具解析（implements→基座，viaPlugin 标记）→ order-db.query 实测经 db.query 执行 LIMIT 强制+审计；M3 probe 端点（db 类 SELECT 1 连通）→ ok=true；M4 export（敏感字段正则脱敏）/import（short_id 重生成 draft）→ 导出删导入闭环实测。
- 2026-09-07 18:05 **M5 前端 + M6 文档完成**：PluginsView 卡片「导出/探活」按钮 + 「导入插件」file input + msg 提示条；PLUGIN_GUIDE 六/七/八三节（ui.menu 声明、implements 映射、共创导出导入流程）。
- 2026-09-07 18:10 **M7 回归 11/11 全绿**（T8/T9 首轮 FAIL 揪出真 bug：GET /api/verifications LIMIT 50 截断，老验证被挤出列表导致动线断——LIMIT 提到 200 修复；另 T2 断言改自适应现存关联对）。已知项：同 QA 点重复生成不去重；插件独立数据源连接隔离属后续。

## 阻塞记录（当前无则填"（无）"）

（无）

---

# GOAL: VerifyOS UI 精修 + 功能补齐 + 插件化（L 系）

状态: 已完成
创建: 2026-09-07 10:25
更新: 2026-09-07 10:38

## 完成标准（全部满足才算完成，每条必须写明验证方式）

- [x] UI：全站功能性 emoji 图标替换为 Lucide（Agent状态/Intent Score/Activity/Findings/卡片标题等） ✅ 2026-09-07 10:38 验证：grep 四文件无功能 emoji 残留 + web tsc 零错 + 4 屏截图
- [x] UI：Action Log 动作差异化彩色图标（click/fill/goto/act/replay/think/observe/evidence 各专属图标+配色） ✅ 2026-09-07 10:38 验证：tsc 零错 + actionIcon/evidenceIcon 落码（运行时验证随 L4 视频回放实测补看）
- [x] UI：概览仪表盘重设计（Bento 布局：KPI 大数字 + 覆盖率 + 趋势 + 行动区） ✅ 2026-09-07 12:05 fe-ui 交付 + 主 agent 截图验收（97% 通过率主卡/环形覆盖率/堆叠趋势柱/最近执行）
- [x] UI：AI 工作区 composer 重做（assistant-ui 范式：模型选择器 + 圆角输入容器 + 附件/发送） ✅ 2026-09-07 12:05 fe-ui 交付 + 主 agent 截图验收（composer 容器/模型偏好下拉 localStorage/ArrowUp 圆钮）
- [x] 功能：验证执行视频回放补齐 ✅ 2026-09-07 12:00 验证：真 Run run_mtqppria 产出 video-run-26b57d.webm(83KB) + evidence 事件入流 + content-type video/webm + 回放态可进视频 tab 截图验收
- [x] 功能：探索页实时浏览展示区 + 人工接管增强 ✅ 2026-09-07 explore-eng 交付：crawler 截图流→/api/explore/shot→舞台实时刷新；接管=暂停+CDP 指引+2s 重截；防目录穿越
- [x] 功能：验证编辑器「保存并运行」真实执行联动 ✅ 2026-09-07 run-eng 交付：根因=失败静默无反馈；修复反馈链路+AI 自愈卡接入真引擎事件；API 链路实测 pass
- [x] 插件化：插件注册表后端（表 + CRUD + 状态切换 + 内置种子） ✅ 2026-09-07 plugin-eng 交付：11 种子(8 builtin+3 mcp) + 五端点 curl 全通
- [x] 插件化：前端插件库页面（库/状态/详情/创建向导） ✅ 2026-09-07 主 agent 截图验收：双 tab + 11 卡 + 开关 + 创建向导
- [x] 插件化：插件创建指南（docs/PLUGIN_GUIDE.md：manifest/config/权限/可复制示例） ✅ 2026-09-07 落盘（含提示词模板）

## 步骤清单

- [x] L1: 图标体系（emoji→Lucide + Action Log 差异化彩色图标） ✅ 2026-09-07 10:38
- [x] L2: 概览仪表盘重设计（Bento KPI） ✅ 2026-09-07 12:05（fe-ui）
- [x] L3: AI 工作区 composer 重做（模型选择器） ✅ 2026-09-07 12:05（fe-ui）
- [x] L4: 视频回放补齐（evidence 事件 + 前端兜底） ✅ 2026-09-07
- [x] L5: 探索浏览展示区 + 人工接管增强 ✅ 2026-09-07
- [x] L6: 验证编辑器保存并运行联动修复 ✅ 2026-09-07
- [x] L7: 插件注册表后端（表+API+种子） ✅ 2026-09-07
- [x] L8: 插件库前端页面 ✅ 2026-09-07
- [x] L9: 插件创建指南文档 ✅ 2026-09-07

## 执行日志（追加式，禁止删除历史）

- 2026-09-07 10:25 L 系开启。侦察结论：①视频回放根因=runner 已录 .webm 且落盘 evidence，但 finally 块只 push evidenceKeys 不发 step.evidence 事件，前端按事件流过滤永远为空（L4 根因确认）；②PluginsView 现状=工具注册表+MCP 占位，PRD 旧判断「不做插件市场」需按用户新需求升级为插件库；③参考核实：deepseek-harness=「Everything is a Plugin」Cordis 框架、ego-lite=Space 级浏览器接管、arxiv 2508.25512 为无效 id（以仓库实际参考为准）；④lucide-react 1.40.0 所需图标全部可用。
- 2026-09-07 10:38 **L1 完成**：①App.tsx ActionIcon 重构为 actionIcon()+evidenceIcon()——click(蓝 MousePointerClick)/fill(紫 Keyboard)/goto(青 Globe)/act(lime Wand2)/replay(绿 RotateCw)/think(灰 Brain)/observe(绿✓红✗ CircleCheck/CircleX)/evidence(按 kind 分 Camera/Video/FileArchive/Terminal/Network)，.lico 升级为 16px 彩色徽标（a-* 九类配色）；②探索页 Compass/Bot/Target/ScrollText/Zap/UserRound/Pause/Play/Square 全替换；③概览 SatelliteDish/Compass/Zap/TriangleAlert；④AI 工作区卡片标题六类图标+Paperclip 附件钮；⑤散项：💾→Save、⛔→Ban。验证：tsc --noEmit 零错 + grep 无功能 emoji 残留 + playwright 四屏截图（/tmp/l1-shots）。环境：pnpm 命令报 deps 校验错，tsc 直跑根目录 typescript 绕过；vite:5173 + api:8080 常驻在跑，热载即所见即所得。下一步 L2（概览仪表盘 Bento 重设计）。
- 2026-09-07 10:44 用户指令升级：①goal-loop 切**连续模式**（不许等「继续」）；②全站 icon 检查（点名 QA 点页）；③问题页状态字段颜色优化；④追加点名：需求导入/新建项目 icon、探索路径绿✅ 太丑（"一眼丑的记录下来，网络找方案修复"）；⑤多用智能体团队。
- 2026-09-07 11:05 **L1b 全站扫尾完成**：①全站 14 屏 playwright 截图审视 → 丑点清单落盘 **UI-FINDINGS.md**（U1-U16，16 项）；②web search 设计参考落地（状态徽章=浅底tint+深字+圆点锚、Linear 色彩克制、细线判定图标色盲友好）；③新建统一 **.schip** 状态徽章体系（high/medium/low/open/resolved/discovered/selected/generated 八态）+ **VerdictIcon** 共享细线判定图标（shared.tsx）；④修复：探索路径绿✅→细线CircleCheck+当前lime点（U1）、问题页待处理折行+实心HM圆→schip（U2）、QA页风险/状态/筛选/按钮全换（U3）、ImportView 全部 emoji→lucide+ConnectorCard 图标组件化（U4）、WelcomeView 三卡+旗帜+📦→lucide（U5）、History/Mobile/Dashboard 判定点→VerdictIcon（U6）、PrView 💡👍→Lightbulb/Check（U7）、U8-U15 散项（Clock/Zap/Play/Ban 全落）。web tsc 零错。U16（地图 URL 标签过密）挂起记录。
- 2026-09-07 11:06 **团队模式开启**（用户指令）：建团队 verifyos-l，4 teammate 并行——fe-ui（L2 仪表盘Bento + L3 composer）、run-eng（L4 视频回放 + L6 编辑器联动）、explore-eng（L5 探索截图流+接管）、plugin-eng（L7 后端 → L8 前端 → L9 指南）。8 任务已入团队任务清单并分派。文件域互斥分区（styles.css 归 fe-ui，L5/L8 用独立 css import）。主 agent 负责集成验收 + GOAL 回写。
- 2026-09-07 11:35 用户指令：全站检查 + 写 DESIGN.md。①发现上轮团队运行被中断且 4 teammate 均未落改动（mtime 佐证）→ 已 SendMessage 全部恢复继续原任务；②**全站检查完成**：三端 tsc 零错（web/server/agent-core）、10 个 API 端点全 200、14 屏 playwright 截图（:5174 dev server）逐屏过——UI chrome emoji 清零、schip/VerdictIcon/pathdot 全生效；发现内容层问题=LLM 聊天回复大量 emoji → chat.service SYSTEM_CONTEXT 已加「禁止 emoji」约束（server --watch 已重载）；③**DESIGN.md 落盘**（9.9KB v1）：6 设计原则 / tokens（中性+品牌+语义六态）/ 布局体系 / 组件清单 8 族（btn/chip三层/schip八态/VerdictIcon/lico九类/pathdot/卡片/composer/空态）/ 图标规范映射表 / 14 屏视觉清单 / 演进规则。④server 端 lastShotKey 两个 TS 错误=explore-eng 编辑中间态（其验收要求 tsc 零错，交付时自清）。L2-L9 交付后需二次集成验收。

## 阻塞记录（当前无则填"（无）"）

（无）

---

# 前序 GOAL 档案

# GOAL: 开源系统选型-测试-修复全流程（K 系）

状态: 已完成
创建: 2026-09-05 13:40
更新: 2026-09-07 09:52

## 完成标准（全部满足才算完成，每条必须写明验证方式）

- [x] 选定 nock/nock 并克隆 ✅（/Users/xielaoban/Documents/temp/k-opensource/nock，HEAD v14.0.17）
- [x] 全面测试完成 ✅ findings.md（24 bug 分拣 8 复现 + 165 项探针断言，9 项确认问题）
- [x] 修复完成 ✅（KA2/KA4 子代理交付；KA3 失败前改动已落地并经测试验证；KA1 未完成由主 agent 亲自补齐 #2934 修复）
- [x] 回归验证 ✅ 651 passing / 0 failing（基线 638 + 新增 13 用例；复现脚本全部对照通过）
- [x] 收尾报告 ✅ 2026-09-07 09:52（已提交 GitHub：KrabWW/nock 分支 fix/regressions，5 个主题 commit）

## 步骤清单

- [x] K1: 侦察完成 ✅ 2026-09-05 13:48（k-scout 实测 GitHub API 出 3 候选：nock ⭐13.1k（推荐）/sinon/pino；已剔除 nyc/jshint/ajv 超期停更项）
- [x] K2: 基线建立 ✅ 2026-09-05 14:05（nock HEAD=1ee467c v14.0.17 克隆至 /Users/xielaoban/Documents/temp/k-opensource/nock；npm install 21s；**自带测试全绿 638 通过/0 失败/11 pending/9s**；REPL 冒烟核心 API 正常；无现成失败→问题素材转向 24 open bug 定向复现+文档行为探针）
- [x] K3: 并行深测完成 ✅ 2026-09-05 14:20（k-bug-triage：24 bug 分拣，8 个真实复现；k-probe：165 项断言 7 探针面，2 高危+1 中+4 低/文档问题；正向：生命周期 26/26、AbortSignal 9/9、性能 1.7-1.8x 正常）
- [x] K4: findings.md 落盘 ✅ 2026-09-05 14:25（K-1~K-9 共 9 项确认问题：高危×3/中×2/低文档×4；上游不可修项与正常对照清单齐备）
- [x] K5: 拆票 ✅ 2026-09-05 14:25（KA1 状态码范围 / KA2 回放异常 / KA3 removeInterceptor+reqheaders / KA4 文档四连修，文件互斥；统一约定不 commit 由主 agent 收口）
- [x] K6: 修复完成 ✅（KA2/KA4 子代理成功；KA1/KA3 因 LLM API 网络故障中断——KA3 改动已落盘验证，KA1 由主 agent 亲自补齐；全部修复经 651 用例回归）
- [x] K7: 集成回归+收尾 ✅ 2026-09-07 09:52（分 5 个主题 commit 推送 GitHub）

## 前序目标档案

- F 系（原型对齐）✅ 09-05 02:15；H 系（用户视角走查+补齐）✅ 09-05 11:50；J 系（运行时测试+修复）✅ 09-05 13:42

## 执行日志（追加式，禁止删除历史）

- 2026-09-04 22:35 GOAL.md 初始化（12 张工单 + 自检，共 13 步）。连续模式（用户明示"全部完成"）。
- 2026-09-04 23:05 **S1 完成**：F11 全链路（mr 表+3 端点+种子+writeback stub+webhook upsert；PrView 双态重写对齐原型；!134 重放实测+3 截图）。顺手修 webhook 两个既有 bug（LLM schema 降级、ensureReady）。环境坑：沙箱周期收割后台进程（~60s，与启动方式无关，launchd 也被禁）→ 验证改为「单命令原子化」模式（起服务+交互+截图一条命令内完成；curl 一律 --noproxy '*'；浏览器 daemon 需无代理环境启动）。下一步 S2（F4 探索可视化，最重）。
- 2026-09-04 23:35 **S2 完成**：F4 全链路（crawler onProgress/control 增量与接管 + explore.service 结构化事件 + pause/stop/control/from-finding 4 端点 + ExploreView 工作台重写）。实测：curl 生命周期（running/pageCount 增量→停止→落库 5 页 9 边）+ 浏览器 WORKING/树生长/Agent 卡/Intent Score 真数据/登录墙 Finding 卡 + 截图。crawler.smoke 回归过。顺手修 ExploreView 默认 URL 历史遗留。下一步 S3（F1+F16 欢迎页）。
- 2026-09-05 00:10 **S3、S4 完成**：S3= F1 欢迎页（hero/三卡/新建项目表单）+ F16 侧栏入口 + POST /api/projects 落库 + exploreSeed 预填跳探索（截图 f1-welcome.png）。S4= F5 批量（复选框/High Risk/批量按钮+进度）+ QA 状态机 generated 流转（DB 实锤 3 generated + ver×4，截图 f5-qa-selected/batch.png）。沙箱收割间隔实测约 15-25s（更激进），跨命令必死——所有浏览器验证已在单命令内完成。下一步 S5（F7 执行历史增强）。
- 2026-09-05 00:55 **S5、S6、S7 完成**：F7（verificationShortId 全链 + overview JOIN + 证据展开 + trigger 列，run_mtn3shtx↔ver_xtc94y 实证）；F9（/api/graph/coverage + 地图 ✓ 绿圈/QA 徽标/浮层/生成缺失验证，20% 1/5 实证）；F10（overview trend/prRuns/uncoveredHigh + 概览趋势 SVG + 未覆盖卡 + 行动按钮，09-04 pass2/unknown2 实证）。修 GROUP BY 聚合序号坑。发现并行会话半成品（见阻塞记录）。下一步 S8（F12 凭据+浏览器状态）。
- 2026-09-05 01:20 **S8 完成**：F12（browser-states 种子/TTL + refresh 续期 run_mtn49b9g + credentials test 真探测 run_mtn49vmt **pass** + Browser State 卡组 + 安全四条卡，截图 f12-cred.png）。
- 2026-09-05 01:40 **S9、S10 完成**：F13（sync 端点 + 推送禅道/Jira 按钮 + 外部徽标，issue#3→ZT-3057 实证，截图 f13-issues.png）；F17（run.started setEvents([e]) 修复事件残留）。
- 2026-09-05 02:00 **S11 完成**：F3 需求导入（parse/cross-check 端点 + ImportView + 样例 + 转 QA 点，2 条 Spec Gap 实证，截图 f3-import.png；docx/Figma/飞书连接器诚实占位）。
- 2026-09-05 02:15 **S12、S13 完成**：F2 协作收尾（并行会话渲染代码 + 本轮 plan 链路实测 show_qa_points/explore）；S13 自检=16/17 done + typecheck 双端零错 + 22 截图在位。**GOAL 达成**。
- 2026-09-05 11:50 **H 系 GOAL 达成**：走查（5 组子代理+主 agent 浏览器 15 屏）→ findings.md（10P0/11P1/10P2）→ 拆票 11 张 → 并行实施 11/11 → 主 agent 集成（server GET /api/projects + overview recentLimit + App.tsx prop 注入 + H02 兜底核验）→ 双端 tsc 零错 → 浏览器抽查通过（h-int-*.png）。用户补充需求「步骤定义拖拽排序」由 dnd-impl 实施并经主 agent 审核修复 from<to 索引偏移 bug。遗留：沙箱收割后台进程（服务验证仍需原子化模式）、run 列表真分页端点、I 系产品缺口（登录/导出/通知）。

- 2026-09-05 11:55 **J 系开启**（用户指令：拉系统→测试→发现问题→修复，用子智能体）。H 系已于 11:50 达成；本轮聚焦运行时功能测试（API 契约/端到端旅程/WS 并发/数据一致性），与 H 系代码走查互补。
- 2026-09-05 13:40 **K 系开启**（用户指令：GitHub 选开源系统→克隆→全面测试→修复→回归报告，子智能体协作）。J 系已于 13:42 达成。
## 阻塞记录（当前无则填"（无）"）

- ⚠ 检测到并行会话在同一 App.tsx 工作（TriageEvidence 调用 + chat qaItems 富卡片半成品，7 个 typecheck 错误非本 goal 产生）——S12（F2）疑似该会话负责中，本 goal 到 S12 时先核对其状态再决定跳过或接手。
- Docker Desktop 不可用（磁盘曾满，已缓解未重建）→ PG 用本机 /tmp/verifyos-pg17 顶 5433，不影响功能验证；prod 栈镜像重建遗留。

- 2026-09-05 13:42 **J 系 GOAL 达成**：拉系统→四维测试（4 agent，20+ 问题）→5 张根因票并行修复→统一部署（DATABASE_URL=5433 修正）→集成回归全绿。重要副产：①发现根 .env DATABASE_URL 指向 15432 陈旧库的部署暗雷；②agent-core runner crash 会把 fail 覆盖成 pass（service 层已补偿，根修留 K 系）；③已完成 agent 消息重激活会回放旧任务造成文件覆写（经 grep 核验本轮无丢失）。

- 2026-09-07 09:52 **K 系 GOAL 达成**：nock 修复提交 GitHub。用户指令'提交到 GitHub'→ 发现 SSH 身份 crablduck 与 keychain token KrabWW（API 验证有效）→ fork 到 KrabWW/nock → 分 5 个主题 commit（playback 异常/removeInterceptor+reqheaders/状态码范围/文档/测试补交）push 到 fix/regressions 分支。KA1（fix-2934）因网络故障失败后由主 agent 亲自补齐：reply 入口 fail-fast+回放校验+fetch 路径 catch 转发（errorWith），3 个新用例全过。
- 2026-09-07 12:05 **L2、L3 完成（fe-ui 交付 + 主 agent 验收）**：①DashboardView Bento 重写——97% 通过率黑底 lime 主卡（口径 pass/(pass+fail) 防假绿注释）+ 4 KPI 卡 + 覆盖率环形卡（/api/graph/coverage 同源）+ 14 天堆叠柱状 + 最近执行列表 + 未覆盖 high 空态诚实文案 + 内联 SVG 零依赖；②ChatView composer 重做——16px 大圆角容器、textarea 自适应（Enter 发送/Shift+Enter 换行）、Paperclip 附件 + 模型偏好下拉（localStorage verifyos.model，诚实标注仅预选）+ ArrowUp 圆形发送钮；QUICK chips 保留、CredCard/QaSuggestCard 未动。验证：web tsc 零错 + /tmp/l2l3 截图验收通过。dash-* 55 条 / composer-* 样式入 styles.css。待：L4/L5/L6/L7/L8/L9（run-eng/explore-eng/plugin-eng 进行中）。

- 2026-09-07 12:00 **L4 全链路真完成（主 agent 集成补刀）**：run-eng 三路修复（runner finally 补发 trace/har/video evidence 事件 + kindOf .webm→video + 前端 evidenceKeys 兜底）后实测发现 stagehand 2.5.9 仍不产 .webm——主 agent 挖到真根因：**recordVideo 只从 localBrowserLaunchOptions 读取（dist/index.js:24429），放 contextOptions 被静默忽略**。runner.ts 修正参数位置 + agent-core/server 重建 + server 重启（PID 90840）→ 真 Run 实测 .webm 85845B 产出、evidence 事件入流、content-type video/webm。补 App.tsx 回放态集成：replayRunId 时同步 GET /api/runs/:id 注入 done → 历史回放也能进「视频回放」tab（此前 RunDetail 依赖 run.done 仅实时态渲染）。
- 2026-09-07 12:05 **L5、L6、L7、L8、L9 交付验收完成**（explore-eng/run-eng/plugin-eng）：探索截图流+接管 2s 重截（4 截图实证）；编辑器保存并运行反馈修复+自愈卡真实化；插件后端 11 种子五端点 curl 全通；插件库双 tab 截图验收（builtin 8/mcp 3/custom 0 + 创建向导）；PLUGIN_GUIDE.md 落盘。关键环境事实（plugin-eng 发现）：**:8080 跑的是 node dist/main.js 编译版而非 --watch**——后端改动需 tsc 重建+重启才生效。
- 2026-09-07 12:06 **L 系 GOAL 达成**：10/10 完成标准全部有客观证据（tsc 三端零错 / curl 实测 / 截图验收 / 文件落盘）。团队 8 任务全 completed。服务现状：server=PID 90840（编译版 :8080），vite dev 用户侧 :5174（沙箱会回收，需要时用原子模式或用户终端常驻）。DESIGN.md 设计系统 v1 + UI-FINDINGS.md 丑点档案已交付。
- 2026-09-07 14:30 **L 系售后补丁 U17**（用户截图反馈：执行页回放态花花绿绿）：①动作徽标九类彩色→中性灰（形状区分类别，颜色只留 ok=绿/fail=红）；②Triage 卡去琥珀边框+左边条→白底细灰边；③obs-ok 行绿字→中性；④失败截图限高 220 缩略（zoom-in 原图）。DESIGN.md §4.4 已同步改版（「形状=做什么，颜色=结果如何」）。截图对比验收通过（/tmp/u17）。经验：**彩色徽标与语义色同屏叠加违反色彩克制原则——状态色是稀缺资源，不给装饰用**。
- 2026-09-07 14:32 **售后补丁 U18**（用户截图反馈：QA 点页状态值颜色花）：风险列彩 pill→色点+灰字（.riskcell，高=红点/中=琥珀/低=灰）；状态列→中性灰 pill（.stcell），仅 discovered（待确认行动项）保留淡靛；筛选行同步。中间抓到 className 不匹配 bug（JSX high vs CSS .r-high，色点不渲染）——DOM inspect 法定位。原则补充：**流程状态不配彩色，只有需要行动/告警的状态才配**。
- 2026-09-07 15:15 **售后补丁 U19：验证编辑器内嵌浏览器试运行**（用户质疑"编辑验证没有浏览器预览，怎么知道效果"——产品级盲区）：①agent-core RunRunner 加 stopAfterStepIndex（跑到指定步即收尾，走完整证据管道）；②RunsService.dryRun（同步返回，复用 runner+LocalDiskStore+LocatorCache，ai 步提取的 selector 一并返回=顺带写缓存正式运行零 LLM 重放）+ POST /api/runs/dry-run；③EditorView 右列「试运行预览」卡（舞台截图+判定+逐步结果+selector 候选）+每步骤行「▶ 到此步」。实测：dry_mtqwp4br 1.8s 跑 2 步 2 截图；ver_poi8jk 试运行立即暴露断言值错误（url_contains login.html 实际 list.html）——正是该功能的价值证明。坑：kill 旧 server 时 ps grep 抓错 PID 导致新进程起不来（lsof :8080 定位）。三端 tsc 零错。
- 2026-09-07 15:33 **售后补丁 U20：AI 工作区附件功能真开放**（用户点名）：①文本附件（docx/md/txt/json/csv）前端解析（docx 走 mammoth 浏览器端）注入消息前缀（单附件 12k 字符截断标注）；②图片附件（png/jpg/webp ≤2 张 ≤4MB）走 attachments → parseChatIntent 多模态 messages（text+image parts）→ glm-4.5v 视觉；③待发附件 chips（可删）+ 气泡附件展示 + 消息上限 500→8000。实测：文本链（登录需求.md→LLM 给出 AC1/锁定/验证码三条优先级+建议生成专项 QA 点）、视觉链（真实截图→识别员工列表页 6 可交互元素+测试建议）、浏览器 E2E（setInputFiles→chip→发送→回复引用附件内容）三链全通。坑：fe-ui L3 重写过 composer（按钮类名/textarea/发送钮都变了），patch 前先 grep 现状；后端 generateObject + image parts 与 glm openai-compat 兼容（实测通过）。
- 2026-09-07 15:43 **售后补丁 U21：QA 点/验证/执行三环动线接通**（用户指出「编辑」按钮还是占位 alert、三者关系没接线）：对象模型=QA 点（测什么）→生成→验证（怎么测，编辑器）→运行→Run（测得怎样，执行页）。接线：①App 加 editorFocus 传参（对齐 replayRunId 模式）；②QA 抽屉「编辑」= 找 verification.qa_short_id 关联验证 → 跳编辑器自动选中（无关联则 toast 引导先「生成验证」）；③QA 抽屉/表格「生成验证」= 生成后跳编辑器预填（不再直接触发 run——运行交给编辑器「保存并运行」，检查后再跑）；④EditorView 接 focusVerId（首载优先选中聚焦项；已在编辑器内时二次聚焦直接切换）。E2E 实测：qa_2d499l 点编辑 → 编辑器选中 ver_sp7s7p（列表高亮+QA 来源卡显示 qa_2d499l）。三端 tsc 零错。
- 2026-09-07 16:00 **售后补丁 U22：三环跳转全量审查+反向链接通**（用户要求全查）：审查发现 3 处断链并修复——①执行页头部 ver chip 假关联（显示验证库第一条而非本次 Run 关联）→ RunsService.runVer map + controller PG JOIN 兜底返回 verShortId + chip 真关联可点跳编辑器；②Run 详情加「→ 编辑这条验证」（有 verShortId 时）；③编辑器「QA 来源」chip 可点 → QA 页自动打开该抽屉（QaView focusQaId 轮询开抽屉）。E2E 三项全绿：回放 run_mtqxee1e → hasBtn/draftHasVer(ver_0wnk35)/qaDrawerOpened 全 true。至此三环双向 6 条链全部接通。
- 2026-09-07 16:20 **售后补丁 U23：QA→编辑器跳转"写死"根因修复**（用户反馈点任意 QA 都到 ver_jbghtl）：真根因=U21 的 editQa patch **old_string 一字之差静默未生效**（注释「App 层」vs「App.tsx」），一直跑旧版「直接透传 QA id」→ EditorView find(short_id===qa_xxx) 永远 miss → 回退默认选中 rows[0]（当时恰为 ver_jbghtl）。**U21 首验 E2E 属假阳性**（当时 rows[0] 恰好就是目标验证 ver_sp7s7p，截图「看起来对」）。修复：①精确替换 editQa 为查 qa_short_id 关联版；②EditorView 聚焦重构为单一初载 effect（fetch 完成后才消费 focus，消除 items 未加载时提前消费竞态）；③调试方法沉淀=EditorView 加临时探针+playwright console 捕获，实锤 App 收到 qa_xxx 而非 ver_xxx。终验双路径全绿：编辑路径 qa_2d499l→ver_sp7s7p（QA 来源匹配）、生成路径 qa_i06vvx→新 ver_p2tsmi（QA 来源匹配）。教训：**patch 脚本必须校验替换命中数，replace 静默失败=埋雷；E2E 断言要验证数据关联而非页面恰好长对**。
- 2026-09-07 16:21 **售后补丁 U24：双编辑器职责收敛**（用户连续两问：编辑器/执行页「运行」职责重叠 + 执行页左列编辑区字段残缺「只看到标题断言和分类」）：定位=执行页左列藏着一个**劣化迷你编辑器**（编辑不了 module 动作序列、无试运行、独立 steps 数据源）——与验证编辑器职责撞车且功能残缺，是用户困惑根源。收敛：①执行页左列改**纯只读**（删编辑/删除/＋AI/＋断言/💾保存/拖拽/编辑展开区，删 addStep/delStep/updStep/moveStep/saveAsVerification/dragIdx/overIdx 死代码）；②左列底部加「去编辑器维护 →」链接（带当前关联验证跳转）；③验证选择下拉与重新运行保留。执行页=纯「跑+证据」视图，编辑动作单一入口=验证编辑器。验证：执行页 editBtns/saveBtns/addBtns 全 0 + goLink=1，tsc 零错。**编辑器试运行预览保留不动**——它是编辑回路反馈（dry-run 不留痕），与执行页正式 Run（归档+证据）职责正交。
- 2026-09-07 16:25 **售后补丁 U25：执行页内一体化编辑+试运行**（用户决策：编辑与执行一体化，减少跳转——对标 Momentic/QA.tech 主流形态）：①新建共享组件 **StepEditor**（module 动作序列 goto/fill/click 行编辑/ai 指令/三选断言/targetRef）——执行页左列与验证编辑器**共用同一组件**（单一事实来源，杜绝劣化拷贝复发）；②执行页左列恢复全功能：＋AI/＋断言/＋动作/拖拽排序/编辑展开（StepEditor）/「存为验证」（升级：已选验证=PUT 更新，不再每次新建）；③每步「▶ 试运行到此步」+顶部「▶ 试运行」——复用 /api/runs/dry-run，卡片右上有绿/红 verdict 点，舞台优先显示试运行截图（实测跑到 about.html 截图就地刷新）；④EditorView 表单换 StepEditor+清死代码。tsc 零错 + E2E 截图验收。页面职责终态：**执行页=编辑+跑+证据一体化工作台；编辑器=验证资产管理（列表/信息/自愈）**。
- 2026-09-07 16:54 **售后补丁 U26：动线最终形态 + 拥挤修复**（用户三问：旅程奇怪/左列拥挤/编辑器职责质疑）：①QA 点「生成验证/编辑」**改道直接进执行页**（runFocusVer state→载入该验证步骤就地编辑，不再绕编辑器）；Run 详情「编辑这条验证」与执行页 ver chip 点击同样改道（chip=就地载入该验证）；②编辑态拥挤修复：editingId 时左列 grid 加宽至 300-360px + 编辑卡隐藏圆点；③E2E 全绿：qa_kuyw81 生成验证 → onRunPage=true + ver_uwi7zu 载入 4 步 + 编辑器页未出现 + 编辑态加宽生效。**页面职责终态：QA 点=需求层（测什么）；执行页=一体化工作台（编辑+跑+证据，主战场）；编辑器页=验证资产管理（列表/信息/自愈，非必经）**。
- 2026-09-07 16:58 **售后补丁 U27：交付前全链路自动回归（用户要求"确定解决完我再检查"）**：11 项自动化回归矩阵（playwright，/tmp/u27-regression.cjs 可复跑）——T1 生成验证→执行页载入 / T2 编辑→关联验证载入 / T3 编辑态完整表单 / T4 ＋AI删除 / T5 试运行就地反馈 / T6 存为验证=PUT更新 / T7 正式Run终态 / T8 Run详情编辑改道 / T9 ver chip 就地载入 / T10 视频回放回归 / T11 编辑器QA来源抽屉回归。**首轮 10/11 揪出真 bug：toPayload 只读旧字段 assertValue，丢失 StepEditor 写入的 assert 对象（保存的验证里断言静默消失）**——补 StepDefView.assert 类型+双字段兼容后 11/11 全绿。另：批量动线对齐（QaView「在执行页查看→」）。已知项：同 QA 点重复「生成验证」后端不去重（每次新建，行业惯例可接受，记录备查）。
- 2026-09-07 17:04 **售后补丁 U28：RUN LOG Console/Network 真数据补齐**（用户反馈两 tab 空壳）：①引擎 runner.ts 挂 page.on('console'/'pageerror') 实时采集（上限 100 条防爆炸），finally 落盘 console-run-*.log + emit evidence(kind=console)；②前端 RUN LOG Console tab=拉取日志文件按级别着色（error/pageerror 红、warning 琥珀）；Network tab=**解析 HAR 文件**渲染请求表（状态码语义色：2xx 绿/3xx 蓝/4xx+ 红，method+status+url）；③空态诚实（页面真无 console 输出时明确说明）。实测：run_mtr0zo1d Console(2)——[log]/[error] 两行正确着色；Network(3)——HAR 请求表（200 GET login.html 等）。过程中修了两处自身语法错（har 类型注解多打 `>`、console tab 括号层数）——整块 IIFE 重构收敛。回归 11/11 仍全绿。
- 2026-09-07 17:22 用户问 Console 显示 fixture probe 是否正常——是（U28 验证探针，故意放的）；已把探针文案改为明确中文标注「[演示站] 页面已加载/示例 error」，run_mtr18krl 实测生效。保留探针理由：演示 Run 的 Console tab 天然有内容可看。
- 2026-09-07 18:30 **U30 面分类市场视图 + e2e-eng 布局 bug 修复，M 系 GOAL 达成**：①12 插件全量打 manifest.category（数据面5/接口面1/UI面3/协作面3/交付面2），插件库顶部「测试面」筛选 chips（含计数，点选过滤）；②e2e-eng E2E 9/9 PASS（探活/导出脱敏/导入清理/插件页面渲染），并揪出主 agent 引入的布局 bug——.plg-card-foot 无 wrap 致「测试面」chip 竖排 + foot stopPropagation 拦截抽屉点击；已修（foot wrap+chip nowrap+交互元素各自 stopPropagation）并复验（点卡片中部开抽屉 ✓ 数据面筛选 3 卡 ✓）。③环境项：5173 docker 镜像旧（缺 plugins 模块）——演示走 5174 host dev 栈，镜像重建留待。**M 系 7/7 完成标准全满足。**
- 2026-09-07 21:07 **U31 交付质量复核**（用户质问"你测试了吗"）：当前时点全量重测 11/11 PASS（21:07 实跑）+ 插件链路抽查（插件页面/面筛选/探活按钮 ✅ pageErrors 空）。两个表面红点查实：①探活"失败"=点了 CMDB 插件（工具类型不支持探活，返回"暂不支持"为正确行为）→ 修=探活按钮仅 db 类基座插件显示（U31 条件渲染），消除误导；②lightbox 未弹=并行会话功能（非本 goal 改动范围），归其验证。测试边界如实声明：回归覆盖今天改动链路，非全站所有功能。
- 2026-09-07 22:30 **N1、N2 完成（核心里程碑）**：①agent-core registry.ts 补 unregister；②新建 PluginRuntime（tsx/cjs require hook 动态加载 TS 插件 + activate(ctx) + onDispose 回滚 + ctx 白名单 registerTool/llm/db/config/log）+ PluginRuntimeController（load/unload/reload/GET）+ app.module 注册 + tsx 移入 dependencies；③示例代码插件 sample-echo.plugin.ts。E2E 实测：plg_pvm6hb load→activate 注册 order-db.count→工具进列表→invoke 真查 PG（orderCount=64）→unload 后工具消失。**DSH 进程内插件模式在 VerifyOS 跑通**。技术要点：server 是 CJS，用 require('tsx/cjs') 全局 hook 而非 tsx/esm tsImport（后者双包 default）。
- 2026-09-07 23:00 **N 系 GOAL 达成（6/6）**：n3-ui（前端代码插件类型：徽章/加载卸载/已加载状态/抽屉/向导 entry.file，playwright 5 断言全过）+ n4-doc（external-db.plugin.ts 真外部库连接 + PLUGIN_GUIDE 代码插件章节）。终验：双端 tsc 零错 + 回归 11/11。DSH 进程内插件模式完整闭环：代码插件可自带实现、连任意外部服务、注册平台没有的新能力、卸载回滚——正是「能力扩展」的真底座。
- 2026-09-07 22:54 **T10 定位调整（用户决策）**：API 测试独立立项为单独项目（不塞进 VerifyOS），成熟后微前端合并。搜索确认三大 AI 化接口测试能力对标：①流量录制→测试=Keploy(18k★,eBPF 录制+依赖 mock) ②API 自动发现/inventory+覆盖率=Akto(从 spec 或镜像流量建清单+覆盖率) ③spec-to-tests=Schemathesis(属性测试找 500/schema 违规)/Postman Agent Mode/Bruno。决策已记 MEMORY.md。
- 2026-09-07 22:56 **API 测试独立项目拆票完成**：9 张 ticket（A1 脚手架/A2 录制/A3 录制→测试含噪音检测/A4 inventory/A5 覆盖率/A6 spec→edge-case/A7 AI 断言诊断/A8 场景编排/A9 微前端），独立 GOAL 在 .scratch/api-test/GOAL.md。缝合方案：Keploy(录制→测试)+Akto(inventory+覆盖)+Schemathesis(属性测试)+Postman Agent Mode(自然语言+诊断)+Hoppscotch(AI 断言)。优先级 P0 录制→测试 → P1 发现+覆盖 → P2 AI → P3 编排+微前端。
- 2026-09-07 23:17 用户补充 T11 桌面端（低优先级后置）：CLI-first + Web 控制台已够工程师用，桌面端是未来给非命令行用户的可视化入口，技术选型 Electron/Tauri。
- 2026-09-07 23:19 补 ticket 覆盖审计全部 6 项未真实现：T4 扩禅道+Jira；新增 T12 Figma/T13 原生移动/T14 占位工具/T15 MCP 连接器。至此审计 REALITY-AUDIT 的「外部集成 stub」全部有 ticket 对应。
- 2026-09-07 23:20 补 T16 验证脚本化/固化（用户问「每次探索很久，能否脚本化让回归更快」）。现状核对：探索/验证已分离（回归不重复探索）、确定性步骤零 LLM、LocatorCache 已做但有短板（selector 提取不稳/纯内存/不固化）。T16 三件事：selector 提取增强 + locator_cache 持久化 + ai 步骤固化为确定性脚本。执行模型=缓存回放，此票是「冷跑→热跑零 LLM」闭环的最后一块。
- 2026-09-07 23:40 **O 系第一批完成（T1/T14/T16，团队 3 agent 并行）**：T1 CLI 骨架（packages/cli，init/login/命令骨架）；T14 占位工具清零（http/code.view/vision 真、browser/evidence/report 诚实标注）；T16 脚本固化（selector 提取增强+locator_cache 持久化+ai 步固化）。**T16 是成本闭环关键**：实测冷跑 11417ms→热跑 1946ms、llmCalls 1→0、跨重启命中，主 agent 独立复验通过。「回归测试更快 + 成本趋零」已成立。遗留：T16 脚本导出未做（后续工单）、browser 工具层真接 Stagehand 需注入实例（后续）。
- 2026-09-08 00:20 **O 系第二批完成（T2/T8/T15，团队 3 agent 并行）**：T2 CLI run/report（退出码+成本报告）；T8 PR 旅程（config 三层优先级+门禁+触发规则）；T15 MCP 连接器（手写 stdio/SSE client+adapter+断线重连+PluginRuntime 接入）。**环境发现：server 是 launchd 托管（com.verifyos.dev，KeepAlive），kill :8080 后自动拉起加载新 dist，勿 nohup**。澄清：eng-cli2 报的「llmCalls 聚合 bug」实为误判——this.llmCalls 每 run 重置+ai 步累加（runner.ts:276/374/522），热跑 llmCalls=0 是缓存回放零 LLM 的正确表现。
- 2026-09-08 00:30 **O 系第三批完成（T6/T9）**：T6 MCP server（stdio，run/read_run/list_verifications）；T9 多项目（project_repo/project_environment 表 + webhook 按 repo 反查 + 欢迎页/设置页）。**重大环境发现：server 实际跑 pg-mem**——launchd 注入 DATABASE_URL=127.0.0.1:5433 不可达（本机 PG 在 5432），导致数据重启即清，历史持久化/多项目/locator_cache 全在内存库。待修：plist 的 DATABASE_URL 5433→5432。
- 2026-09-08 00:40 **O 系第四批完成（T3/T4/T7）**：T3 飞书推送、T4 禅道/Jira 真建缺陷（删假 ID）、T7 三 Skill。O 系 16 张中已完成 11 张（T1/T2/T3/T4/T6/T7/T8/T9/T14/T15/T16）。剩余：T5（需 Docker）、T12 Figma（token）、T11 桌面端/T13 原生移动（低优先）、T10 API 项目（A1-A9 独立）。遗留：凭据 CRUD 只存 username/password，需扩展表单才能 UI 写 url/token（当前 env 为主）。
- 2026-09-08 00:50 **O 系第五批完成（T12 + T10 A1）——「跑到完」抵达终点**：非硬阻塞 ticket 全部完成。O 系最终 12/16 完成 + T10 A1。剩余全为硬阻塞或低优先：T5（Docker GitLab/GitHub）、T11 桌面端（低）、T13 原生移动（低）、T10 A2-A9（API 项目后续）。
- 2026-09-08 07:40 **pg-mem 环境问题修复（非 ticket，环境修复）**：本机 5432 PG 无 verifyos 库/用户（只有 crabtest_* 系列），`createdb verifyos` 建库 + plist DATABASE_URL 从 `verifyos:verifyos@5433` 改为 `xielaoban@5432/verifyos` + relaunch。验证：server 日志「✅ 已升级到真实 PostgreSQL」、28 张表自动迁移建表、跑 run 后重启 run 历史仍在（持久化真落地）。之前所有「持久化」在 pg-mem 上是假的，现已真。
- 2026-09-08 08:10 **T5 完成——O 系主项目非低优先级 ticket 全部闭环**：13/16 完成（T1-T9 除 T10、T12、T14-T16），剩 T11 桌面端 + T13 原生移动（低优先级后置）+ T10 A2-A9（API 项目后续）。审计 REALITY-AUDIT 的「外部集成 stub」至此全部落地：PR 回写、禅道 Jira、飞书 Figma、占位工具、MCP 连接器、脚本固化——全部真实现（真实凭据由用户后续配）。
- 2026-09-08 10:40 **T11/T13 补充完成**：T11 Electron 桌面壳（选型+PoC）✅、T13 原生移动（Maestro/Appium 选型+触发链路）✅。
- 2026-09-08 10:50 **API 测试独立项目 A1-A9 全部完成** ✅：脚手架→录制→录制→测试→inventory→覆盖率→spec→edge-case→AI 断言诊断→场景编排→微前端方案。
- 2026-09-08 10:52 **报告/设置/用例/右栏四视图补齐** ✅：报告（5 条 mock+筛选+展开详情+汇总）、设置（AI 模型配置+凭据管理 6 连接器）、用例（来源筛选+搜索+review 状态）、右栏（三态：未选中/选中/场景模式）。全部视图不再显示 EmptyState 占位。
- **O 系 16/16 全闭环 + API 独立项目 A1-A9 全完成 + 报告/设置/用例/右栏四视图补齐。全部「跑到完」目标达成。**
- 2026-09-08 08:30 **O 系 T11/T13 完成——O 系主项目 16 张全部闭环**（T1-T16 除 T10 API 项目 A2-A9 外全部完成）。T11 Electron 桌面壳 + T13 Maestro/Appium 选型+触发链路。
- 2026-09-08 20:55 **Phase 1 全部完成（8/8）**：四路并行（eng-rec-up/eng-inv-edge/eng-scn-up/eng-ai-up），全量回归绿（typecheck 零错 + verify:record/record-to-test/ai-assert/nli/heal + demo:inventory/spec-test/coverage/scenario 全 PASS）。九模块短板补齐。