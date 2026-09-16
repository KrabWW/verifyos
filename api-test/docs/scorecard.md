# 九模块能力评分表（P 系 · 完成标准核对依据）

业界 API AI 测试按九大模块组织（Keploy / Akto / Schemathesis / Postman / Specmatic / Speedscale / Tricentis 综合口径，2026-09-08 定稿）。
本文是 api-test 的官方能力评分表：每模块 5 分制打分，分数以**代码文件 + 可复跑验证脚本**为证据，不接受口头达成。

打分日期：2026-09-09（P1 短板补齐 + P2 AI Intelligent Layer 全部交付后终核）

## 九模块评分

| # | 模块 | 分 | 关键代码（证据） | 验证脚本 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | 流量捕获 | 4.5 | src/recorder/（proxy.ts 代理录制 + classify.ts 三级分级 + session.ts）+ extension/（Chrome MV3 DevTools panel，HAR 捕获 HTTPS 明文含 body）+ src/cli/import-har.ts | verify:record / verify:record-to-test / demo:classify | 代理 + 插件双通道，缺 eBPF（P 系外立项，后置） |
| 2 | API 发现/清单 | 4.5 | src/inventory/（normalize.ts 归一 + classify.ts 语义标注 security/external/deprecated/internal + store.autoAnnotate + openapi.ts spec 导入） | demo:inventory 37 PASS | 流量 + spec 双源建清单，对标 Akto inventory |
| 3 | 契约管理 | 4.5 | src/inventory/drift.ts（漂移检测）+ src/insight/spec-diff.ts（P2.5：端点/参数/schema/枚举/响应码五级 diff + breaking/warning/info 分级 + reviewDiff 中文审查） | verify:insight 21 PASS（含 spec-diff 部分） | spec 导入/diff/漂移齐；反向生成契约属 P3.1 |
| 4 | 测试生成 | 4.5 | src/generator/（A3 录制→用例 + noise.ts 噪音）+ src/spec-test/（edge-case 嵌套 P1.5）+ src/assertion/generate.ts（schema 断言）+ src/ai/（P2.1 gen 模式 + P2.4 方法论 + P2.3 勾选人审） | verify:record-to-test / verify:ai-assert / verify:ai-core / verify:doc-model | 三源（流量/spec/AI）齐 |
| 5 | Mock/依赖隔离 | 4 | src/generator/mock.ts + schema.ts（P1.3 extractSchemaTree 动态字段标记 + generateMockValue 按类型回放 + 敏感值不入产物） | test:mock-schema 40 断言 | schema 化 mock 已落地；场景内联 mock 的编排接入可再加强 |
| 6 | 覆盖率与治理 | 4.5 | src/coverage/（engine.ts 运算 + store.ts + board.ts 看板）+ src/spec-test/（P1.5 嵌套 edge 扩用例）+ demo:coverage | demo:coverage / demo:spec-test | operation/response-code 维度 + 看板；CI 门禁在 CLI 侧（主仓） |
| 7 | 执行与编排 | 4.5 | src/scenario/（expr.ts 安全表达式求值器无 eval + engine.ts 条件/循环三模式/DataSet 笛卡尔积 + MapScope 作用域 + 环境变量） | demo:scenario 39 PASS | 对标 MeterSphere 场景引擎原语齐 |
| 8 | 自愈与维护 | 4 | src/assertion/self-heal.ts（P1.8 两级映射：同值字段优先 + 同名挪位 + changes 人审 + broken 诚实列表）+ src/insight/spec-diff.ts（P2.5 维护信号） | verify:heal 6 节 | API 版自愈（运行时新字段名自动映射属 P3.2 增强） |
| 9 | 监控与安全 | 2 | 录制层可作基础采集；inventory 有 security 语义标注 | 无 | **shift-right 生产流量监控（P3.5）/ 混沌注入（P3.4）/ OWASP 安全测试扫描均未做——P3 远期范围** |

## P 系完成标准核对（2026-09-09 终核）

- [x] **九模块每项 ≥ 4/5**（**模块 9 用户豁免** 2026-09-09）：模块 1-8 达成（4~4.5）；模块 9=2，补齐项（shift-right/混沌/OWASP）全在 P3.4/P3.5 远期清单，经用户决策豁免归 P3，P 系按 1-8 达标关账。
- [x] **AI 能力覆盖模块 1-8 中 ≥6 个**：实测 6 个——模块1（P2.2 录制后 AI 洞察总结）、模块2（P1.4 classifyWithLLM 预留 + P2.1 chat 注入 API 清单上下文）、模块3（P2.5 Spec Diff AI 审查）、模块4（P2.1 gen + P2.4 方法论注入 + P2.3 AI 生成→人审入库）、模块7（P2.4 场景法方法论生成场景用例）、模块8（P2.1 diag/explain + P2.6 自愈后文档）。模块5/6/9 仅规则式（AI 增强点已列）。
- [x] **tsc 零错**：api-test 全仓 `tsc --noEmit` 零错（2026-09-09 集成后实测）。
- [x] **全站 0 JS 报错**：prototype.html 89/89 组件断言 + 6 用户故事 E2E 26 步 + web/stream-demo.html file:// 直开无 console error（2026-09-09 实测）。
- [x] **E2E 全链路真跑通**：录流量→AI 生成→勾选人审入库→跑→报告 在原型 26 步用户故事覆盖（2026-09-09 重跑）。

## 遗留 AI 增强点（模块 5/6/9，不阻塞关账）

- 模块5 Mock：生成后 LLM 润色（解释型字段/中文注释），provider 层已就绪（src/ai/provider.ts）。
- 模块6 覆盖率：LLM 生成「覆盖率缺口→补测建议」（coverage_gaps 已注入 P2.1 chat 上下文，缺专门 gen 模式）。
- 模块9 监控安全：全在 P3.4/P3.5。
