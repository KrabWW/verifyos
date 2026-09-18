# VerifyOS 贡献插件目录

给 VerifyOS 加增强能力，不需要改核心代码：每个子目录是一个本地插件，
由 `apps/server/src/plugins/plugin-host.ts` 在 API 启动时自动加载。

**👉 完整开发文档：[docs/plugin-dev-guide.md](../docs/plugin-dev-guide.md)**

## 现有插件

| 插件 | 解决什么问题 | 主要端点 |
| --- | --- | --- |
| `live-run-events/` | 运行中 run 的事件流可读（排障不用翻 server.log） | `GET /api/plugins/live-run-events/runs`、`GET /runs/:id/events?since=N` |
| `page-structure/` | AI 生成验证步骤前先抓真实页面 DOM outline，杜绝臆测 UI | `POST /api/plugins/page-structure/capture` |
| `locator-composite/` | 采集多段交互（antd Select 等）动作序列，为固化回放备料 | `GET /api/plugins/locator-composite/sequences`、`/stats` |
| `code-forensics/` | 验证反复失败后自动检索代码仓库 + LLM 逆向分析「页面真实结构、该怎么测」，报告落 `out/code-forensics/`；支持 local 目录（配合开发平台 CLI 克隆真实仓库，见 plugin-dev-guide.md 案例 D）与 gitlab REST | `POST /api/plugins/code-forensics/analyze`、`GET /reports`、`GET /stats` |

## 快速开始

**装别人的插件**：「工具与插件」页 →「导入插件」→ 选分享的 `.zip` 安装包，即装即生效
（同名重装=热替换，删除=连目录一起卸载）。

> 每个插件背后都有一个真实踩坑现场——故事见 [../docs/plugin-stories.md](../docs/plugin-stories.md)。
> 贡献新插件请先讲故事（模板在该文末尾），再谈实现。

**自己开发**：

1. 新建 `plugins/<你的插件名>/verifyos.plugin.json` + `index.js`（见指南 §1 的 30 秒示例；
   事件时序与 glm reasoning 模型的坑见指南 §4 案例 D 的两条血泪教训）
2. 重启 API，看日志 `[plugin-host] ✓ <你的插件名>`（或压成 zip 走导入按钮热加载）
3. curl 自测 `/api/plugins/<你的插件名>/...`，「工具与插件」页会出现你的插件
4. 分享给别人：把插件目录压成 zip 发出去即可（指南 §5.5）

## 贡献约定

- 只动 `plugins/<你的插件>/` 与本文档；不碰 `apps/`、`packages/`
- 有副作用的端点 manifest 里声明 `"permission": "ask"`
- PR 描述里给出验证命令（curl 即可）
