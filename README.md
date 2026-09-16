# VerifyOS · 中文 AI 测试平台 — 交付包 V0.1

基于两段竞品深读会话（QA.tech / Momentic 复刻路线）产出的完整设计资产。

## 交付物清单

| 文件 | 说明 |
|---|---|
| `PRD.md` | 产品需求文档：对象模型 / 六大场景 / 逐页面功能需求 / 数据模型 / API 与 WebSocket 事件 / 分期计划 / 视觉规范（Chat 采用 assistant-ui 组件范式） |
| `prototype.html` | **高保真可交互原型**（浏览器直接打开）：14 个核心屏 + 完整产品影片脚本演示（V4：Lucide 图标体系 + QA.tech 黑主色 + 动效系统） |
| `技术选型.md` | 技术选型专题（V0.2 已切 React）：决策矩阵 / License 合规 / 11 项 PoC 清单 / 风险应对 / 移动执行层 |
| `styles.html` | 三版风格方向样张（QA.tech 精修 / Linear 精密 / Vercel 精度），正式方向已选 A 并铺进原型 |
| `archive/` | 历史版本备份（如 `prototype-20260903-before-icon-upgrade.html` = 图标升级前版本） |
| `promo/` | Remotion 宣传片工程（源码 + 配音脚本） |
| `promo/out/verifyos-promo.mp4` | **宣传片成片**：1920×1080 · 49.6s · **9 场景**（含移动测试）· CosyVoice 中文配音 |

## 原型使用指南

浏览器打开 `prototype.html`（单文件、零依赖）：

1. **▶ 播放演示**（AI 工作区）：完整复刻 QA.tech 产品影片主链 ——
   一句话 → 网站分析 → 发现登录墙 → **聊天内动态凭据表单（需你亲手点"保存并继续"）** → 认证爬取 18 页 → 建议 QA 点勾选（Safe AI Mutation）→ **点"创建所选验证"** → 依赖树 → 快捷入口
2. 探索工作台：三栏实时视图 + Intent Score + Live Findings + 「👤 我来操作」人工接管
3. QA 点列表：点任意行 → 右侧 Drawer 展示来源追溯（PRD 引用 + Figma + 置信度）
4. **验证 · 执行（合并单页，QA.tech 式三态）**：点「▶ 运行测试」—— 步骤逐个点亮（黄绿高亮→时间戳）→ 右侧浏览器实时切换（登录→列表→表单→填写→500 报错）→ 自动切证据面板：AI 分析 NOTES/HYPOTHESES / 最终截图 / 视频回放 / Network / Console / Trace 六 Tab
5. **执行历史**：结果列表（含「? 无法验证」防假绿），点失败行直达验证页证据态
6. 失败分析：AI 归因 92% + 人工分类 + 全链路追溯（Run→验证→QA点→需求→证据）
7. 应用地图：SVG 覆盖着色图，点击「删除订单」节点看缺口面板
8. 需求导入：PRD/Figma/飞书来源 → 交叉验证发现（Mismatch / Specification Gap / Undocumented / 缺失需求推导）
9. PR 验证报告：Webhook 自动流水线（Preview 环境 → 影响分析 → 定向回归 → 动态探索）+ 失败分解 + MR 评论回写 + 合并门禁 +「无法验证 ≠ 通过」防假绿
10. **📱 移动测试（与 QA.tech 第四动图同构的结果页）**：Steps 厚步骤卡（Launch app 设备卡 + 多段 💭 思考 + 子动作截图缩略）+ Issues/Steps/Settings Tab + 右侧手机三态画面与元信息（Classification: Positive · Last 5 Runs）+ 底部持久日志；发现"详情页缺少添加备注入口" → 💬 Fix in chat → Before/After 修复对比（PR !88）——「▶ 重播演示」可看完整动画
11. 凭据与浏览器状态：运行时请求优先 + Browser State 免重复登录复用
12. 右下角 ✨ AI 助手浮窗：Chat → Artifact 模式演示

## 私有化部署（30 分钟起服）

```bash
cp .env.example .env   # 填 LLM_API_KEY / CREDENTIAL_ENCRYPTION_KEY（生成命令见文件内注释）
docker compose -f docker-compose.prod.yml up -d --build
# Web 控制台 http://localhost:8081 · API http://localhost:8080/api/health
```

完整步骤 / 运维 / 备份 / 安全清单见 **[DEPLOY.md](DEPLOY.md)**。

## 宣传片（Remotion）

```bash
cd promo
pnpm install          # 已安装
npx remotion studio   # 预览（可逐帧调试）
npx remotion render Promo out/verifyos-promo.mp4   # 重新渲染
```

- 场景源码：`src/scenes1.tsx` / `src/scenes2.tsx`（V4 视觉：黑主色 + lime 品牌 + Lucide 图标 `src/icons.tsx`，与原型一致）
- 配音：`scripts/generate_tts.py`（CosyVoice · 中文女；重生成后自动更新 `src/durations.json` → 场景时长自适应）
- 改文案：编辑 `generate_tts.py` 中的 `NARRATIONS` → 重跑 → 重渲染
- 本地渲染注意：WorkBuddy 的 node 环境有 fs shim 注入，需用干净环境跑（`env -u NODE_OPTIONS -u ELECTRON_RUN_AS_NODE PATH="系统node路径:/usr/bin:/bin" npx remotion ...`），否则 remotion 临时目录创建会报 EEXIST

## 下一步建议

1. 用原型过一轮内部评审（重点：探索工作台信息密度、QA 点 Drawer 字段）
2. 跑《技术选型.md》P1–P4、P11 PoC（~4.5 人天）验证 Stagehand + 国产模型 + assistant-ui 集成
3. Phase 1 开发排期：QA 点提取闭环（PRD §9）
