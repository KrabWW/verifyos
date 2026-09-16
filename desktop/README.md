# VerifyOS Desktop（Electron 最小壳 PoC）

对应 ticket `11-desktop-client.md` 的「技术选型 + 最小桌面壳 PoC」部分。打包分发（dmg / Win 安装包 / 自动更新）为后置项，不在本目录落地。

## 技术选型结论

**Electron**。理由详见 `docs/tech-selection.md`。一句话：纯 TS 团队零新语言、零新工具链，Node 能力（token 文件读写 / 未来 spawn CLI / 托盘通知）直接可用，体积劣势对私有化测试平台不构成瓶颈。

## 目录结构

```
desktop/
  package.json           独立 npm 包（不进 pnpm workspace）
  .npmrc                 使用 npmmirror 镜像 + electron 二进制镜像
  docs/tech-selection.md 技术选型报告
  src/
    main.js              主进程：窗口 + 菜单 + token IPC + 回退逻辑
    preload.js           contextBridge 暴露 verifyosDesktop API
    token-store.js       token 持久化纯模块（可独立验证）
    shell.html           本地页：标题栏 + token 输入 + 控制台状态
  scripts/
    verify-token-store.js token 持久化验证脚本（纯 Node）
```

## 运行

```bash
# 前置：Web 控制台已在运行（默认 http://localhost:5174，可 VERIFYOS_WEB_URL 覆盖）
node /Users/xielaoban/.workbuddy/binaries/node/versions/22.22.2-2/bin/npm install
npm start          # 启动桌面壳，加载 Web 控制台
npm run smoke      # 冒烟模式：加载后打印标记并自动退出（无头验证用）
npm run verify     # 验证 token 持久化逻辑（纯 Node，无 Electron）
```

## 能力说明

- **加载 Web 控制台**：主窗口默认加载 `http://localhost:5174`（`VERIFYOS_WEB_URL` 可覆盖）。
  控制台不可达时自动回退本地 `shell.html`（标题栏 + token 输入）。
- **本地 token 持久化**：token 存到 `app.getPath('userData')/token.json`
  （`{ "token": "...", "updatedAt": "..." }`）。通过菜单「VerifyOS → Token 设置」打开设置窗口。
- **注入点**：渲染层（含 Web 控制台页面）可通过 `window.verifyosDesktop.getToken()` 读取 token，
  供后续后端鉴权接入。

## 遗留

- 打包分发（Mac dmg / Win NSIS）、自动更新（electron-updater）、系统托盘通知、
  本地录制会话启动 —— 均为后置项。
- Web 控制台当前未接入 token 鉴权，桌面壳已预留注入点。

## 验证记录

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 源码语法 | 通过 | `node --check` main.js / preload.js / token-store.js 全部 OK |
| token 持久化逻辑 | 通过 | `npm run verify` 6/6 通过（读写/覆盖/清除/损坏容错） |
| Electron 依赖安装 | 通过 | `@electron/get` 官方流程装好 `electron@37.10.3`（arm64，与宿主同版本） |
| Web 控制台可达 | 通过 | `curl http://localhost:5174/` 返回 200（后端 :8080 也 200） |
| 桌面壳 GUI 启动 | **环境受限** | 见下方说明 |

**GUI 启动的环境限制说明**：本开发环境（CodeBuddy agent 会话）无法执行
`adhoc/linker-signed` 的 Electron 二进制 —— 进程在 `dyld` 阶段即挂起（`sample` 显示卡在
`_dyld_start`，`DYLD_PRINT_LIBRARIES` 零输出，任何模式含 `ELECTRON_RUN_AS_NODE` 均如此）。
而宿主的 Developer-ID 签名 Electron（WorkBuddy 自身，同为 37.10.3）在相同 shell 下可正常启动，
证明是签名/环境策略差异，而非代码或版本问题。

在正常桌面终端（开发者机器）上，直接 `npm start` 即可启动窗口并加载 Web 控制台；
`npm run smoke` 会在 `/tmp/verifyos-desktop-smoke.log` 写入加载结果（url / token）供无头验证。

