# VerifyOS 桌面端技术选型报告

> 对应 ticket `11-desktop-client.md`，本文是「技术选型 + 最小桌面壳 PoC」的选型结论与理由。
> 打包分发（Mac dmg / Win 安装包 / 自动更新）为后置项，本报告只说明路径，不在本 ticket 落地。

## 1. 结论

**选用 Electron。**

桌面端定位是「未来给非命令行用户的可视化操作入口」（低优先级后置）。在 CLI-first + Web 控制台已覆盖工程师用户的前提下，桌面壳的首要目标是**用最低工程成本把现有 Web 控制台包成桌面应用**，而不是追求极致体积或性能。

对纯 TypeScript 团队而言，Electron 是零新语言、零新工具链的选择；Tauri 的体积优势在此场景收益有限，却要引入整套 Rust 工具链与跨平台编译矩阵，工程与维护成本明显更高。故结论为 Electron。

## 2. 对比维度

| 维度 | Electron | Tauri | 结论 |
| --- | --- | --- | --- |
| Mac/Win 覆盖 | ✅ 成熟，官方支持 | ✅ 支持，但 Win 交叉编译需额外配置 | 平手（Electron 更省事） |
| 应用体积 | ❌ 约 150–250MB（自带 Chromium + Node） | ✅ 约 5–20MB（复用系统 WebView） | Tauri 优，但本场景收益低 |
| 内存占用 | ❌ 偏高（每窗口独立渲染进程） | ✅ 更低 | Tauri 优，但非核心诉求 |
| 开发语言 | ✅ 纯 JS/TS，团队零门槛 | ❌ 需 Rust（前后端分离 + IPC 命令） | Electron 优 |
| Node 能力需求 | ✅ 原生 Node，token 文件读写 / 进程 spawn CLI / 本地录制直接可用 | ⚠️ 需通过 Rust sidecar 或插件桥接 | Electron 优（本需求强相关） |
| 签名/公证打包 | ✅ electron-builder / Forge 生态成熟（dmg、nsis、公证、自动更新） | ⚠️ 打包尚可，公证/更新链路更繁琐 | Electron 优 |
| 自动更新 | ✅ electron-updater 成熟 | ⚠️ 需第三方方案（tauri-plugin-updater 较新） | Electron 优 |
| 生态/心智 | ✅ 大量现成示例与团队经验 | ⚠️ 团队无 Rust 储备 | Electron 优 |

## 3. 关键决策理由

1. **团队是纯 TS 技术栈**：`apps/web`（React + Vite）、`apps/server`（NestJS）、`packages/*` 全部 TypeScript。引入 Tauri 意味着新增 Rust 语言、Cargo 依赖、跨平台编译与 CI 矩阵，违背「最小成本包壳」的目标。

2. **Node 能力是刚需**：本 ticket 的本地能力（token 持久化到本地文件、未来「启动本地录制会话」「系统托盘通知」）都天然是 Node/Electron 主进程的拿手活；Tauri 要用 Rust 实现同等功能，还要为「复刻 CLI 能力」额外做 sidecar 桥接。

3. **体积/内存不构成瓶颈**：桌面端目标用户是非命令行用户，在开发机上运行一个 200MB 的桌面工具完全可接受；Tauri 的「小体积」优势在消费级分发（如 IM、笔记）里更重要，对私有化部署的测试平台收益有限。

4. **签名/打包/自动更新更省事**：Electron 的 `electron-builder` + `electron-updater` 是成熟主路，Mac 公证（notarization）与 Win 代码签名都有大量现成实践；Tauri 侧更新与公证链路相对更年轻。

## 4. 打包分发路径（后置，不在本 ticket 落地）

- **Mac**：`electron-builder` 产出 `.dmg`，配合 Apple Developer 证书做 `codesign` + `notarytool` 公证。
- **Win**：`electron-builder` 产出 NSIS 安装包（`.exe`），可选代码签名证书。
- **自动更新**：`electron-updater`，Mac 走 dmg/zip + 公证，Win 走 NSIS；需要托管更新源（静态存储 / release 页）。
- **分发形态**：桌面端加载打包后的静态页（`apps/web` 的 `vite build` 产物）而非 dev server，后端地址改为可配置（本地 `127.0.0.1:8080` 或远程私有化地址）。

## 5. 本 PoC 已落地内容

- `desktop/src/main.js`：主进程，窗口 + 菜单 + token 文件读写 IPC + 回退逻辑。
- `desktop/src/preload.js`：`contextBridge` 暴露 `verifyosDesktop` API（getToken/saveToken/clearToken/openConsole）。
- `desktop/src/shell.html`：本地页（标题栏 + token 输入 + web 控制台连接状态 + 打开按钮）。
- token 持久化路径：`app.getPath('userData')/token.json`（JSON：`{ token, updatedAt }`）。

## 6. 遗留 / 后续

- 打包分发、自动更新、系统托盘通知、本地录制会话启动均为后置项。
- Web 控制台当前未接入 token 鉴权；桌面壳已预留 `verifyosDesktop.getToken()` 注入点，等后端鉴权就绪后接入。
