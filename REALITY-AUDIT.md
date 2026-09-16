# VerifyOS 全站实现度审计（REALITY-AUDIT · 完整版）

> 生成：2026-09-07 22:10-22:20 · 用户质疑「很多任务没真实实现」，3 个审计 agent 并行逐域代码核查 + team-lead 亲自审计 PR/插件。
> 分级：✅ 真实现 / 🟡 半真实（骨架真、某环节 stub）/ ⚪ 占位。

## 核心结论（一句话）

**本地 CRUD + 内部引擎基本是真的；对「外部世界」的边界几乎全是 stub/占位。** 移动测试是「换壳 Web 测试」，不是真移动 App 自动化。

---

## 一、PR 验证（GitLab / GitHub）

| 环节 | 状态 | 证据 |
|---|---|---|
| Webhook 接收 merge_request | ✅ | webhooks.controller.ts:16-29 |
| 影响分析（diff→LLM） | ✅ 真调 LLM | webhooks.controller.ts:39（降级启发式） |
| 定向回归 Run | ✅ 真浏览器 | webhooks.controller.ts:81 |
| 高风险→issue 落库 | ✅ | webhooks.controller.ts:68-78 |
| MR 落库 + 动态探索 | ✅ | webhooks.controller.ts:87-135 |
| **preview 环境** | ⚪ stub | 用 fixture（webhooks.controller.ts:80） |
| **diff 来源** | 🟡 stub | 只读 body 字段，未真调 GitLab API（:27 注释自认） |
| **MR 评论回写** | ⚪ 未实现 | 无 POST 回 GitLab |
| **webhook 鉴权** | ⚪ 未实现 | 无 token 校验 |
| **GitHub** | ⚪ 未实现 | 仅 gitlab 端点 |

## 二、移动测试

| 功能 | 状态 | 证据 |
|---|---|---|
| 设备模拟（viewport/UA/触控）真生效 | ✅ | runner.ts:79-84,173-176 |
| 移动 Run 真执行+真落 PG | ✅ | runs.service.ts:70-113 |
| mobile.controller 真查 PG | ✅ | mobile.controller.ts:13-69 |
| **原生 App（Maestro/Appium）** | ⚪ 占位 Phase5+ | runner.ts:77 仅注释 |
| **真机/云真机** | ⚪ 占位 | 全库无代码 |
| **UA/classification 落库** | ⚪ 占位 | 恒 null |
| **修复闭环（Fix/Analyze）、Before/After 卡** | ⚪ 占位 | MobileView.tsx:320-336 |

结论：**换壳 Web 测试**——设备模拟真、执行真、落库真；原生移动层整体占位。

## 三、应用地图 + 需求导入 + QA 点

| 功能 | 状态 | 证据 |
|---|---|---|
| 地图爬取/落库/覆盖率 | ✅ 真（真算 pct，非写死） | crawler.ts:94-103；graph.controller.ts:20-75 |
| intent 分档 | 🟡 启发式关键词打分，非 LLM | graph.ts:20-34（自认待 LLM 替换） |
| docx 解析 | ✅ 真（mammoth 浏览器端） | ImportView.tsx:54-58 |
| 文本拆分/矩阵 | ✅ 真（启发式正则） | imports.controller.ts:16-68 |
| 交叉验证 | 🟡 关键词级匹配（硬编码表） | imports.controller.ts:104-121 |
| LLM 边界推导 | ✅ 真（可选开关） | imports.controller.ts:127-134 |
| Figma / 飞书连接器 | ⚪ 占位说明卡 | ImportView.tsx:136-145 |
| QA 提取 | ✅ 真 LLM（generateObject structured output） | qa-extract.ts:37-80 |
| QA 状态机流转 | ✅ 真守卫+真 UPDATE | qa-points.controller.ts:29-52 |
| 去重 | ✅ 真（批内+库内） | explore.service.ts:537-556 |

## 四、凭据 + 浏览器状态 + 执行历史 + 问题库 + MR

| 功能 | 状态 | 证据 |
|---|---|---|
| 凭据加密 | ✅ 真 AES-256-GCM | crypto.ts:18-24 |
| 凭据落 PG | ✅ | credentials.controller.ts:44-51 |
| 浏览器状态落库/TTL | ✅ | browser-states.controller.ts:58-63 |
| 浏览器状态「复用登录」 | 🟡 storage_uri 占位+硬编码登录 | browser-states.controller.ts:53,79-90 |
| 执行历史落 PG | ✅ | runs.service.ts:97-110 |
| 历史重启保留 | 🟡 有条件（无真 PG 时 pg-mem 重启清空） | explore.service.ts:117-168 |
| 证据磁盘枚举 | ✅ | runs.service.ts:286-310 |
| 问题落库 | ✅ | issues.controller.ts:22-44 |
| **问题同步禅道/Jira** | ⚪ Math.random 假 ID | issues.controller.ts:96 |
| MR 落库 | ✅ | mrs.controller.ts:102-139 |
| MR review 生成 | 🟡 静态 seed 文案 | mrs.controller.ts:33-99 |
| **MR writeback 回 GitLab** | ⚪ 本地落 md 不调 API | mrs.controller.ts:151-182 |

## 五、工具与插件（team-lead 亲自审计）

| 功能 | 状态 |
|---|---|
| 插件注册表/CRUD/创建向导 | ✅ |
| 工具映射（implements→基座）/上下文注入/探活 | ✅（但对内置能力的编排） |
| 导出导入/UI 声明/测试面分类 | ✅ |
| **code.view 等工具** | ⚪ makePlaceholderTool 占位 |
| **MCP 连接器 McpToolAdapter** | ⚪ 占位（无真 spawn/握手/转发） |

## 六、核心引擎层（真实，今日 11 项回归真浏览器验证）

✅ 探索闭环（真爬→PG→LLM 提取）、执行引擎（Stagehand×glm-4.5v + 截图/trace/HAR/视频/console）、试运行、三环动线、编辑器一体化、AI 工作区（含真视觉附件）。

---

## 七、统计与待办

- ✅ 真实现：本地持久化（AES 加密/PG 落库/磁盘证据）、内部引擎（探索/执行/提取）、三环 UI 闭环、插件编排
- 🟡 半真实：intent 分档、交叉验证、浏览器状态复用、MR review、历史保留（受 pg-mem 降级）
- ⚪ 占位：**GitLab/GitHub 外部集成、禅道/Jira 同步、飞书/Figma、原生移动、MCP 内核、code.view、UA/classification**

**待办（按价值）**：
1. **MCP 执行内核**（能力扩展的真正底座）→ 数据库多源/飞书/知识库插件化才成立
2. PR 验证补真：GitLab token 鉴权 + API 拉 diff + MR 评论回写
3. 问题同步真推送（禅道/Jira API）
4. code.view 等占位工具接真实实现
5. 移动原生 App（Maestro/Appium）按需推进

**关于 DSH 适配性**：我们缺的「外部能力接入层」与 DSH 的 Cordis 内核是同一件事——MCP 是更轻的行业标准路径。当前形态 =「内部引擎真、外部边界 stub」的演示级实现，离「能力无限扩展」还差 MCP 内核一座山。

---

## 八、TICKETS.md 工单核对（34 ✅ / 2 🚧 / 0 ⬜）

核对方法：对照每张工单的「验收标准」证据（冒烟/psql/浏览器实测）与今日代码审计，判定 ✅ 是否名副其实。

### 总体可信，但 4 张「✅ 含水分」

| 工单 | 标 ✅ 的名头 | 实际含 stub | 今日审计印证 |
|---|---|---|---|
| **D4** Review 生成 + 回写 | 「回写」是 ticket 名一半 | 真实 GitLab API 回写 = stub（本地落盘 out/mr-comments/，注释「待 token」） | PR 验证审计：MR 评论回写 ⚪ 未实现 |
| **E1** ToolRegistry + 工具 | 8 内置工具 | code.view/http/browser/vision = `makePlaceholderTool` 占位（仅 db.query/db.exec 真） | 工具审计：code.view ⚪ 占位 |
| **D1** 证据面板六 Tab | 六 Tab 完整版 | Console/Trace 实时流待 Stagehand（Trace 现为 zip 下载非实时流） | 今日 U28 已补 Console；Trace 实时流仍缺 |
| **C2** 证据管道 | video 录制 | video 曾「软降级」（今日 U4 已修，真 .webm 产出）；MinIO 待 Docker 起后切换 | U4 已闭环 video；MinIO 仍待 |

### 2 张 🚧（诚实标注，未虚报）

- **A2** docker-compose：待 Docker Desktop 启动后验证三服务 healthy
- **A4** LLM Gateway：待填 LLM_API_KEY 实测（但已被 B/C 系真调用覆盖验证——实际已是真实现，标记保守）

### 一张已由今日工作「超车」修正

- **C2 video**：原标「软降级已知限制」→ 今日 U4 定位 Stagehand recordVideo 参数位后**真 .webm 产出**，此限制已消除。

### 结论

TICKETS 的 ✅ **整体诚实**（引擎级功能都有真实证据，stub 处文本多有标注），但 **D4「回写」、E1「工具」、D1「六 Tab」三张把「核心动作的 stub 部分」也带进了 ✅ 标记**——这正是「内部真、外部边界 stub」缺口的 ticket 层镜像。F 系工单（F1-F17）当时列 P0/P1/P2 优先级，今日 L/M 系已落地大半，未逐票回填状态。
