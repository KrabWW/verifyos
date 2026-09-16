# UI 丑点清单（L1b · 2026-09-07 全站审视）

来源：用户反馈（探索路径绿✅丑、问题页状态色丑、全站 icon 检查）+ playwright 14 屏截图审视（/tmp/fullsite-shots）。
设计参考（web search 结论）：状态徽章=浅底 tint + 深字 + 圆点锚；色彩克制（Linear「less color, more meaning」——灰度优先，颜色只留给有语义处）；判定图标用细线 icon（icon 独立于颜色传达语义，色盲友好）。

| # | 位置 | 丑点 | 方案 |
|---|---|---|---|
| U1 | 探索 · 探索路径 | 每个节点实心绿圆白✓（35 节点全是绿勾=视觉噪音） | 已访问→细线 CircleCheck（灰绿描边无底）；当前→lime 实心圆点 + pulse |
| U2 | 问题 | 「待处理」chip 列窄折行成两行；严重度实心 H/M 圆丑 | .schip pill（圆点+深字+浅底）+ white-space nowrap + 列宽 88 |
| U3 | QA 点 | 风险列实心 H/M 圆；状态列纯灰字；🔴🟡筛选 emoji；✓✨⚡🗑按钮 emoji | .schip 体系 + lucide（Check/Wand2/Zap/Trash2） |
| U4 | 需求导入 | 🧩🔍✨ 标题 emoji；连接器行 🎨🔧 emoji | lucide（Layers/SearchCheck/Sparkles/Palette/Wrench） |
| U5 | 新建项目 | 三卡 ✨🧪▶️ emoji；🇨🇳 旗帜；📦 新建项目；🧭 按钮 | lucide（Sparkles/FlaskConical/Play/Package/Compass），kicker 去旗帜 |
| U6 | 全站判定点 | 实心圆✓✕?（历史判定列/移动/地图已验证/概览最近执行） | shared 新增 VerdictIcon 细线图标（CircleCheck/CircleX/TriangleAlert），替换判定语义处；编号圈保留数字 |
| U7 | PR 验证 | Review 列 👍 emoji；legend 💡 | lucide（Lightbulb/ThumbsUp→TextQuote? 用 Lightbulb+Sparkles） |
| U8 | 执行历史 | ⏰ 定时任务按钮 | Clock |
| U9 | 应用地图 | ⚡ 生成缺失验证 | Zap |
| U10 | 凭据 | ⚡ 运行时请求优先 | Zap |
| U11 | 移动测试 | ▶ 跑一遍验证按钮 | Play |
| U12 | 工具插件 | ▶ 试运行按钮（两处） | Play |
| U13 | 探索 msg 文案 | ⏸ 已暂停 / ▶ 已继续 / ⏹ 已停止 字符 | 纯文字 |
| U14 | App 回放 chip | ▶ 回放中 | Play icon |
| U15 | Triage | ⛔ 阻止合并 / ⚠️ 警告合并 chip | Ban/TriangleAlert（与 App.tsx 同） |
| U16 | 地图 URL 标签过密（信息布局问题） | —— | 记录，L2 后视情况处理（不在本轮） |

## 状态（2026-09-07 11:05 更新）
- ✅ 已修：U1（探索路径细线CircleCheck+当前lime点）、U2（.schip 体系+列宽）、U3（QA页 schip+lucide）、U4（ImportView 全量+ConnectorCard 组件化）、U5（WelcomeView 全量）、U6（VerdictIcon 细线判定图标：History/Mobile/Dashboard，地图绿环语义清晰保留）、U7（Lightbulb/Check）、U8 Clock、U9 Zap、U10 Zap、U11 Play、U12 Play、U13 纯文字、U14 Play、U15 Ban/TriangleAlert。
- ⏸ 挂起：U16（地图 URL 标签过密——信息布局问题，L2 后视情况）。
- 设计系统沉淀：.schip（八态语义徽章）、.vtext+VerdictIcon（细线判定）、.lico a-*（动作彩色徽标）、.pathdot（探索路径当前点）。
| U17 | 验证·执行 回放态花花绿绿（用户截图反馈 14:25） | ①动作徽标去彩色→中性灰（形状已区分语义）；②Triage 卡去琥珀左边条/边框（高卡拉满显笨重）→白底细灰边；③观察成功行绿字→中性（绿点已表意）；④失败截图限高 220 缩略（zoom-in 看原图） | ✅ 2026-09-07 14:30 截图对比验收 |
| U18 | QA 点页满屏彩色 pill（20 行×风险红黄+状态蓝紫=40+ 彩块，用户截图反馈 14:29） | 风险列=色点+灰字（.riskcell，扫读靠点色）；状态列=中性灰 pill（.stcell），仅 discovered（待确认行动项）保留淡靛；筛选行同语言；修类名 r-high→high 不匹配 bug | ✅ 2026-09-07 14:32 截图验收 |
| U19 | 验证编辑器是「盲编」——无浏览器预览，效果要跳执行页跑完整 Run 才知道（用户产品级质疑 15:11） | 编辑器内嵌试运行：agent-core 加 stopAfterStepIndex + POST /api/runs/dry-run（同步返回截图/步骤结果/ai 定位候选）+ 右列试运行预览舞台 + 每步「▶ 到此步」；ai 步 selector 顺带写入 LocatorCache | ✅ 2026-09-07 15:15 实测验收（1.6s 暴露 ver_poi8jk 断言错误） |
| U20 | AI 工作区附件按钮是占位 toast（用户点名要开发 15:33） | 双通道真实现：文本类前端解析注入消息（docx=mammoth）、图片类 dataURL 走 glm-4.5v 视觉（parseChatIntent 多模态 messages）；待发 chips+气泡展示+限流（文本 12k 字符/图片 2 张 4MB） | ✅ 2026-09-07 三链实测通过 |
| U21 | QA 点抽屉「编辑」弹占位 alert、「生成验证」只 toast 不跳转——QA/验证/执行三环无动线（用户指出 15:43） | App 加 editorFocus 传参；编辑=查 qa_short_id 关联验证跳编辑器自动选中；生成验证=生成后跳编辑器（运行交给「保存并运行」）；EditorView 支持 focusVerId 二次聚焦 | ✅ 2026-09-07 E2E 实测 qa_2d499l→ver_sp7s7p 选中成功 |
| U22 | 三环跳转审查发现 3 断链：执行页 ver chip=验证库第一条（假关联）、Run 详情无编辑入口、编辑器 QA 来源不可点（用户要求全查 16:00） | verShortId 双路返回（内存 map+PG JOIN）、chip 真关联可点跳编辑器、Run 详情「编辑这条验证」、编辑器 QA 来源→QA 页自动开抽屉 | ✅ 2026-09-07 E2E 三项全绿 |
| U23 | QA 点点谁都跳 ver_jbghtl（用户反馈 16:06） | 根因=U21 editQa patch 静默失败跑旧码（透传 QA id→find miss→回退 rows[0]）+U21 E2E 假阳性；精确重打补丁+EditorView 聚焦单 effect 化+探针实测 | ✅ 2026-09-07 双路径终验全绿（ver_sp7s7p / ver_p2tsmi 各自 QA 来源匹配） |
| U26 | 旅程困惑（QA→编辑器→验证绕路）+ 编辑态左列拥挤 + 编辑器职责不清（用户三问 16:54） | QA「生成验证/编辑」改道直接进执行页（runFocusVer 载入步骤）；编辑态左列加宽 300-360px+隐藏圆点；职责终态=QA 需求层/执行页工作台/编辑器资产页 | ✅ 2026-09-07 E2E 全绿（onRunPage/ver载入/加宽） |
| U28 | RUN LOG 的 Console/Network tab 空壳（用户反馈 17:04） | 引擎采集 console/pageerror（上限 100）落盘 evidence；前端 Console 拉日志按级别着色、Network 解析 HAR 渲染请求表（状态色）；空态诚实说明 | ✅ 2026-09-07 实测 Console(2)着色正确 + Network(3) 请求表 |