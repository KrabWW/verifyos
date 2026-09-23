# VerifyOS 设计系统 · DESIGN.md

> 适用范围：apps/web 全部页面 + 新增页面。本文档是唯一视觉规范来源；改动视觉前先读这里，改动后回写这里。  
> 维护约定：新增组件必须登记到 §4 组件清单；新颜色必须进 §2 tokens，禁止散落硬编码。  
> 丑点追踪与设计决策过程见 [UI-FINDINGS.md](UI-FINDINGS.md)。

---

## 1. 设计原则（按优先级，冲突时以上面的为准）

1. **色彩克制**（Linear 式）：灰色是默认，颜色只留给有语义的地方。如果一个颜色去掉不影响理解，它就是噪音——去掉。
2. **语义色不挪用**：绿=通过/健康、红=失败/高危、琥珀=无法验证/待处理、蓝=进行中、灰=未知/空闲。品牌元素（黑底 lime）不与语义色混用。
3. **图标一律 Lucide（lucide-react），禁止 emoji**：包括标题、按钮、卡片、空态。LLM 生成的聊天文本同样约束（chat.service SYSTEM_CONTEXT 已写明）。
4. **状态徽章 = 浅底 tint + 深字 + 圆点锚**，不用实心饱和底色（对比刺眼、色盲不友好）。
5. **判定用细线图标**：icon 形状独立于颜色传达语义（色盲友好），`✓✕?` 字符一律换 `VerdictIcon`。
6. **诚实降级**：数据不可得时空态明说原因与下一步动作，不造假数据、不放空空白。

---

## 2. Design Tokens

### 2.1 中性色（结构层）

| Token                    | 值                              | 用途                  |
| ------------------------ | ------------------------------ | ------------------- |
| `--ink`                  | `#18181b`                      | 主文字/主按钮底/侧栏激活项      |
| `--text`                 | `#27272a`                      | 正文                  |
| `--sub`                  | `#71717a`                      | 次级文字/日志             |
| `--muted`                | `#a1a1aa`                      | 弱提示/占位              |
| `--bg`                   | `#f7f7f8`                      | 页面底                 |
| `--panel`                | `#ffffff`                      | 卡片底                 |
| `--border` / `--border2` | `#e5e7eb` / `#d4d4d8`          | 常规边 / 输入框边          |
| `--card-shadow`          | `0 1px 2px rgba(24,24,27,.05)` | 卡片微阴影（唯一阴影层级，禁止重投影） |

### 2.2 品牌色（仅两处：logo mark、侧栏激活态）

| Token                                  | 值                                 |
| -------------------------------------- | --------------------------------- |
| `--lime` / `--lime-bg` / `--lime-deep` | `#a3e635` / `#fcffe8` / `#4d7c0f` |

### 2.3 语义色（状态层，全局唯一映射）

| 语义       | 主色        | 浅底 tint   | 边框        | 文字深色      |
| -------- | --------- | --------- | --------- | --------- |
| 通过/健康    | `#16a34a` | `#f0fdf4` | `#bbf7d0` | `#15803d` |
| 失败/高危    | `#dc2626` | `#fef2f2` | `#fecaca` | `#b91c1c` |
| 无法验证/待处理 | `#d97706` | `#fffbeb` | `#fde68a` | `#b45309` |
| 进行中/信息   | `#2563eb` | `#eff6ff` | `#bfdbfe` | `#2563eb` |
| 未知/空闲    | `#a1a1aa` | `#f8fafc` | `#e2e8f0` | `#475569` |
| AI/特调    | `#4f46e5` | `#eef2ff` | `#c7d2fe` | `#4f46e5` |

### 2.4 字体与字号

- 字体栈：`-apple-system, system-ui, PingFang SC, Hiragino Sans GB, Microsoft YaHei`；等宽 `ui-monospace, Menlo`。
- 基准 13px。阶梯：页面大标题 16px/700 → 卡片标题 h4 12px/600 → 正文 12.5px → 日志/辅助 10.8-11.5px → 时间戳 mono 9.5px。
- 数字一律 `font-variant-numeric: tabular-nums`（大数字 KPI、表格数值列）。

### 2.5 圆角与间距

- 圆角：卡片 `--r: 8px`、控件/输入 `--r-sm: 6px`、pill 徽章 `999px`、浏览器舞台 `12px`。
- 间距基准：卡片内边距 14-16px，紧凑卡 7-9px，栅格 gap 10-12px。

---

## 3. 布局体系

```
shell = sidebar(184px 固定) + main(flex-1, padding 20/24)
main  = runhead(页头) + pageview(内容滚动区) / cols(执行页三列)
```

- **页头 runhead**：16px 标题 + 上下文 chip（VER short_id / LIVE / 判定）+ 右侧主按钮。一页一个主按钮（primary），其余 ghost。
- **执行页三列 cols**：`minmax(205,225) | minmax(255,285) | minmax(360,1fr)`——步骤定义 / Action Log / 舞台+摘要；底部 RUN LOG 面板 180px 可折叠。
- **工作台栅格 exgrid**：三列 `230px | 1fr | 250px`（探索页）；底部两列 exbot。
- **Bento 仪表盘（dash- 前缀，L2）**：CSS grid 不等高卡片；首行 KPI 大数字，图表卡次之，列表卡收底。

---

## 4. 组件清单（新增组件必须登记）

### 4.1 按钮

- `.btn`：白底描边；`.btn.primary`：ink 底白字（一屏最多一个）；`.btn.ghost`。
- 按钮内图标：Lucide `size={10-11}`，与文字 gap 6。禁止 emoji 做按钮图标。

### 4.2 chip 家族（三层，按语义选层）

| 层        | 类名                                                                       | 用途                 | 示例                       |
| -------- | ------------------------------------------------------------------------ | ------------------ | ------------------------ |
| 中性       | `.chip`                                                                  | 分类/编号/只读元信息        | `module`、`Step 1`        |
| 彩色静态     | `.chip.p-green/p-amber/p-gray/p-red/p-blue/p-indigo`                     | 来源/连接器健康等静态标注      | `MR 影响`、`● 健康`           |
| **状态徽章** | `.schip.s-{high,medium,low,open,resolved,discovered,selected,generated}` | 会流转的状态/分级（圆点+pill） | `待处理`、`高风险`、`discovered` |

`.schip` 结构：`<span className="schip s-high"><i />高</span>`（`i` 为圆点锚；无风险态可省略）。

**用量红线（U17/U18 教训）**：同一屏彩色 pill 超过 ~10 个就是颜色滥用——

- 表格行级的风险/分级用 `.riskcell`（色点+灰字，无 pill 底）；
- 流程状态（selected/generated 等无需行动的态）用 `.stcell` 中性灰 pill；
- 彩色 pill（.schip/.chip.p-*）只给「需要行动」或「告警」的少数状态（如 discovered 待确认=淡靛、待处理=琥珀）；
- 密集日志里动作类一律中性（形状区分），颜色只表结果。

### 4.3 判定图标（VerdictIcon）

- 位置：`apps/web/src/shared.tsx` 导出；判定语义处一律用它替换字符点。
- 映射：pass→CircleCheck（绿）、fail→CircleX（红）、unknown→TriangleAlert（琥珀）、running→CircleDashed（蓝）、无→Circle（灰）。
- 用法：`<span className={`vtext ${vm.cls}`}><VerdictIcon v={r.verdict} size={13} /> {r.verdict}</span>`。
- 保留例外：SVG 地图节点的绿环+白✓（几何语义清晰）；步骤定义列表的编号圆圈（数字承载语义）。

### 4.4 Action Log 动作徽标（.lico a-*）

16px 圆角徽标，**形状区分类别、颜色一律中性灰**（U17 用户反馈：彩色徽标+语义色叠加=花花绿绿）。颜色只留给结果语义：

| 类别                                               | 图标                                                                    | 颜色                         |
| ------------------------------------------------ | --------------------------------------------------------------------- | -------------------------- |
| 动作类（click/fill/goto/act/replay/evidence/generic） | MousePointerClick/Keyboard/Globe/Wand2/RotateCw/按kind/CornerDownRight | 中性灰底 `#f4f4f5` + `#52525b` |
| think                                            | Brain                                                                 | 灰蓝 `#64748b`               |
| observation ok / fail                            | CircleCheck / CircleX                                                 | 绿 / 红（唯一保留的彩色）             |

缓存命中行级 lime 高亮（.cache-hit）保留。原则：**一行日志里，形状=做什么，颜色=结果如何**。

### 4.5 探索路径（.pathdot）

- 已访问节点：细线 CircleCheck（绿 65% 透明度，12px）——不抢焦点。
- 当前节点：唯一实心 `.pathdot.cur`（lime-deep 8px + pulse）。

### 4.6 卡片与容器

- `.sumcard`：标准白卡（14/16 内边距）；`.excol`：工作台列卡；`.stepcard`/`.alogcard`：执行页左中列卡；`.mstat-*`：移动测试结果卡组。
- 浏览器舞台 `.brow`：12px 圆角 + 1.5px ink 边 + 大投影 + 深色 bar（`.browbar`/`.browurl`）；空态 `.browempty`（图标+一句话）。
- 抽屉：`.qa-drawer*`（380px 右滑 + 遮罩）——QA 详情/插件详情复用此套。
- 开关：`.switch`（30×17）。

### 4.7 输入与表单

- `.inp`：白底 1px border2，focus 蓝 outline；`.field`：label 上置。
- **Composer（assistant-ui 范式，composer- 前缀）**：16px 大圆角容器 → 内部 textarea 自适应（Enter 发送 / Shift+Enter 换行）→ 底行：附件(Paperclip) + 模型选择器(下拉) + 圆形发送按钮(ArrowUp, 40px)。模型选择仅偏好预选（localStorage `verifyos.model`），运行时模型由服务端 `LLM_MODEL` 决定——诚实标注。

### 4.8 空态 / 加载 / 错误

- 空态：图标 + 「为什么空」+ 「下一步动作按钮」（例：QA 点空态→去探索）。
- 错误条：红底白字 + TriangleAlert + 可关闭；loading 优先 skeleton/文字态，禁白屏等待。

---

## 5. 图标规范

1. 来源统一 `lucide-react`；尺寸：标题内 12、按钮内 10-11、行内判定 13、空态 30-32。统一 `verticalAlign: -1~-2px` 微调基线。
2. 页面 section 图标映射（h4 内 12px）：探索路径=Compass、Agent 状态=Bot、Intent Score=Target、Activity=ScrollText、Live Findings=Zap、来源=FileText、连接器=Plug、结构化拆分=Layers、交叉验证=SearchCheck、提取 QA 点=Sparkles、运行时请求优先=Zap、定时任务=Clock。
3. 卡片标题映射（聊天卡）：探索=Globe、验证=Play、QA 候选=ClipboardList、凭据=Lock、QA 建议=ClipboardCheck、探索完成=Map。
4. **禁用 emoji**：UI chrome 全禁；LLM 文本输出由 chat.service SYSTEM_CONTEXT 约束（「禁止使用 emoji 表情符号」）。

---

## 6. 页面视觉清单（14 屏）

| 页面     | 视觉要点                                                     |
| ------ | -------------------------------------------------------- |
| 概览     | Bento KPI（dash-）；语义色只上数字与徽章                              |
| 探索     | 三列工作台 + 实时截图舞台（L5）+ schip 状态                             |
| QA 点   | 风险/状态全 schip；操作按钮 Check/Wand2/Zap/Trash2                 |
| 验证·执行  | 三列 + 动作彩色徽标 + RUN LOG 折叠面板 + 视频回放 tab（L4）                |
| 执行历史   | 判定列 VerdictIcon+文字                                       |
| 应用地图   | SVG 意图分档着色；绿环=已验证（保留）                                    |
| 问题     | schip 严重度/状态；行展开全链路追溯                                    |
| PR 验证  | Review 列 Check/Lightbulb 计数                              |
| 需求导入   | 双列 exgrid；连接器折叠卡（icon 组件化）                               |
| AI 工作区 | 消息流 + assistant-ui composer（composer-）                   |
| 验证编辑器  | pluggrid 双列；步骤编辑卡 + 右列试运行预览舞台（每步「▶ 到此步」浏览器实测，ai 步回显定位候选） |
| 新建项目   | hero（无旗帜）+ 三卡（靛蓝 Lucide）+ 表单                             |
| 工具与插件  | 双 tab：插件库（plugins-，L8）+ 工具注册表&审计                         |
| 移动测试   | mstat- 卡组 + VerdictIcon                                  |
| 凭据     | 凭据卡组 + Browser State                                     |

---

## 7. 演进规则

- **新 CSS**：优先追加到 `styles.css` 末尾并加区块注释（`/* L编号: 说明 */`）；跨页面复用的新组件库样式放独立 css 文件并 `import './x.css'` 进组件（如 explore.css / plugins.css），避免并行冲突。
- **新状态值**：先查 §2.3 语义表与 §4.2 schip 八态，映射不上再扩并回写本文档。
- **设计审查**：大改后跑 playwright 全站截图（参考 `/tmp/fullsite-shot.cjs`，dev server :5174——:5173 是旧构建静态版），对照本清单逐屏过。
- 丑点/回归记录持续追加到 [UI-FINDINGS.md](UI-FINDINGS.md)。

---

*Created 2026-09-07 · L 系 L1b 落地 · VerifyOS 前端设计系统 v1*
