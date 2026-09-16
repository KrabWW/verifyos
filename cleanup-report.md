# 磁盘清理扫描报告

> **执行记录（2026-09-04 22:15）**：用户确认后已将以下项目移入**废纸篓**（未直接删除，可恢复）：
> - D 个人大文件：Downloads 视频×3 + dmg×2 + 安装包/（6.7G）、JNPF zip+zipBK（3.9G）、Codex 全部 mp4（5.8G）、Rust target×2 + .next dev cache（~1.9G）
> - Claude 桌面版数据 12G + Claude-3p 7.8G（**Claude.app 本体保留**）
> - TRAE 全套：数据 5.4G+1.9G + 缓存 1.7G + ~/.trae-cn 1.9G + 两个 .app 本体（~2G）—— Trae 已完全卸载
> - **合计约 51G 在废纸篓，清空后空间才真正释放**。未动：Movies 7.9G、老项目目录（GitHub/Codex 整目录/Testcompilot-ui/autoTest 2）。

> 扫描时间：2026-09-04 21:50 · 本报告为**只读扫描**结果，未删除任何文件。
> ⚠️ 此操作非常危险，可能导致不可逆的数据丢失！任何删除动作都需要你逐项确认后才会执行。

## 0. 磁盘现状（紧急）

| 卷 | 总容量 | 已用 | 可用 | 使用率 |
|---|---|---|---|---|
| Macintosh HD (Data) | 460G | 418G | **326MB** | 100% |

**空间地图（主要去向）：**

| 位置 | 大小 | 位置 | 大小 |
|---|---|---|---|
| ~/Library | 117G | ~/Movies | 7.9G |
| /Applications | 53G | ~/Downloads | 7.2G |
| ~/Documents | 56G | ~/IdeaProjects | 4.9G |
| ~/Applications | 19G | ~/openClaw | 13G |
| ~/code | 14G | 废纸篓 | 已空 |

---

## A. 可再生缓存 —— 最低风险，建议先清（约 60~80G）

| # | 项目 | 路径 | 大小 | 说明 |
|---|---|---|---|---|
| A1 | Docker 数据 | ~/Library/Containers/com.docker.docker | **32G** | Docker Desktop → Troubleshoot → Clean/Purge data；或启动后 `docker system prune -a --volumes`。**若已不用 Docker，可整体删除**（镜像/容器全没，重装即回） |
| A2 | pnpm 全局仓库 | ~/Library/pnpm | **8.1G** | `pnpm store prune` 清无用包；项目重装即回 |
| A3 | ~/.cache | ~/.cache | **7.2G** | uv 2.4G、huggingface 2.0G、codex-runtimes 1.6G、puppeteer 425M、rod 288M —— 全部自动重建 |
| A4 | npm 缓存 | ~/.npm | **4.1G** | `npm cache clean --force` |
| A5 | WorkBuddy 迁移缓存 | ~/Library/Caches/com.workbuddy.workbuddy.BundleMigration（3.1G）+ com.tencent.workbuddy.mac.BundleMigration（1.0G） | **4.1G** | 升级迁移残留，可直接删 |
| A6 | Playwright 浏览器 | ~/Library/Caches/ms-playwright | **3.0G** | 用时 `npx playwright install` 一键回 |
| A7 | 其他工具缓存 | Google(Chrome) 1.2G、TRAE SOLO CN 873M、Trae CN 808M、pnpm 722M、pypoetry 457M、cocraft 448M、openclaw-updater 332M、Codex 286M、node-gyp 240M | ~5.5G | 均可再生 |
| A8 | node_modules（不活跃项目） | 见下方 Top 列表 | **~20G** | 删了随时 `pnpm i` 回来。重点：Testcompilot-ui 两个 worktree 4.4G、deepseek-harness 1.3G、ui-dojo 1.3G、Codex 一次性项目 ~1.9G |
| A9 | Gradle/pip/brew 等 | ~/.gradle 1.0G、pip 93M、Homebrew 60M | ~1.2G | `brew cleanup` 等 |

**node_modules Top 10：**

| 大小 | 路径 |
|---|---|
| 3.5G | Documents/Testcompilot-ui/.worktrees/agentic-guided-recovery |
| 1.3G | code/deepseek-harness |
| 1.3G | Documents/learn/ui-dojo |
| 960M | Documents/Testcompilot-ui（主目录） |
| 900M | Documents/Testcompilot-ui/.worktrees/full-ui-automation-p0a |
| 810M | Documents/autoTest |
| 801M | Documents/temp/verifyos（当前工作区） |
| 740M | GitHub/temp/himarket …/himarket-frontend |
| 726M | code/oh-my-pi |
| 720M | Codex/2026-08-04 …/cinematic-video |

## B. 开发工具链 —— 按需精简（约 25G）

| # | 项目 | 大小 | 建议 |
|---|---|---|---|
| B1 | ~/.codex | 6.5G | 先看内部构成再删（可能含会话历史/运行时） |
| B2 | ~/Library/Android | 8.8G | SDK+模拟器；**不做安卓开发可整体删** |
| B3 | ~/.nvm | 4.8G | `nvm ls` 后删旧版本，只留 22/24 |
| B4 | ~/.vscode | 3.0G | 卸载不用的扩展 |
| B5 | ~/.bun | 2.7G | `bun pm cache rm` 清缓存部分 |
| B6 | ~/.claude | 2.5G | 含项目/会话数据，谨慎 |
| B7 | ~/.local / ~/.rustup / ~/.gradle / ~/.cargo | 1.5G / 1.2G / 1.0G / 390M | 不用 Rust 可删 rustup+cargo |
| B8 | ~/.real / ~/.openclaw / ~/.lingma / ~/.trae-cn / ~/.hermes | 3.0G / 2.9G / 2.1G / 1.8G / 1.5G | 各 AI 编程工具（灵码/Trae 等）的数据目录，**已不用的工具可删**，共 ~11.3G |

## C. 应用本体与数据 —— 确认不用再删

| 项目 | 大小 | 说明 |
|---|---|---|
| /Applications | 53G | 逐个过一遍不用的应用 |
| ~/Applications（JetBrains 全家桶） | 19G | IDEA 3.9G、PyCharm 3.2G、GoLand 3.2G、RustRover 3.1G、Android Studio 3.0G、WebStorm 2.7G —— 不用的卸载 |
| Claude 桌面版数据 | 12G + 7.8G(Claude-3p) | 应用内清理缓存/重装 |
| TRAE SOLO CN + Trae CN | 5.4G + 1.9G + 缓存 1.7G | 不用 Trae 可连数据一起删 |
| 优酷 / 微信 / QQ音乐 / 企业微信 | 2.5G / 2.2G / 1.8G / 1.4G | 各应用内"清理缓存" |

## D. 个人大文件 —— 你来挑（约 20G+）

| 文件 | 大小 | 位置 |
|---|---|---|
| lv_0_20260807073902.mp4 | 3.1G | Downloads |
| JNPF3.6_Java_cloud.zip + zipBK 备份 | 2.7G + 0.9G | Documents/GitHub/micro_zhpt |
| dji_mimo 视频 | 1.0G | Downloads |
| AI公司的优势_完整剪辑版.mp4 | 1.0G | Downloads（Codex  outputs 里还有一份 1.0G 重复） |
| Codex 视频产物（渲染输出/分段） | ~4.5G | Documents/Codex/2026-08-* |
| 各类 .dmg 安装包 | ~1.1G | Downloads（DSH 267M、Claude 253M、Pencil 208M、Openscreen 208M、Recordly 210M） |
| Rust 编译产物 target/*.a | ~1.0G | autoTest 2 / prompt-advisor |
| .next dev 缓存 | 0.45G | Testcompilot-ui |
| Movies | 7.9G | ~/Movies |
| 老项目目录 | GitHub 22G、Codex 10G、Testcompilot-ui 7.1G、autoTest 2 6.1G | 如已结项可整体归档到移动盘 |

## E. 系统项

- Time Machine 本地快照：3 个 OS 更新快照，系统自动管理，满盘时会自动清理，无需手动处理。
- 废纸篓：已空。

---

## 建议执行顺序

1. **先解燃眉之急（零风险，~15G）**：A5 WorkBuddy 迁移缓存 4.1G → A4 npm 4.1G → A3 ~/.cache 7.2G
2. **Docker 清理（最多 32G）**：确认是否还用 Docker
3. **A2 pnpm store + A6 Playwright（11G）**
4. **A8 不活跃 node_modules（~15G）**
5. **B 工具链精简**：nvm 旧版本、Android SDK、bun 缓存
6. **D 个人文件逐个挑**
7. **C 卸载不用的应用**

> 每步清理后用 `df -h /System/Volumes/Data` 验证释放效果。
> **在逐项确认之前，我不会移动、重命名或删除任何文件。**
