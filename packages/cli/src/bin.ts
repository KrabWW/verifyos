#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInit } from "./commands/init.js";
import { runLogin } from "./commands/login.js";
import { runMcp } from "./commands/mcp.js";
import { runReport } from "./commands/report.js";
import { runRun } from "./commands/run.js";

// 命令集（第一版）；已实现的：init / login / run / report / mcp，其余标注「规划中」
const PLANNED_COMMANDS = ["explore", "qa", "ver", "api", "review"];

const HELP = `VerifyOS CLI —— 中文 AI 测试平台命令行入口

用法:
  verifyos <命令> [参数]

命令:
  init        生成仓库内 verifyos.config.yaml（项目/环境/凭据/模型）
  login       持久化 API token 到本地 ~/.verifyos/config.json
  run         触发一次验证并轮询到终态（退出码 0/1/2/3）
  report      查看指定 Run 报告（Markdown/JSON）
  explore     探索应用（规划中）
  qa          问答（规划中）
  ver         版本校验（规划中）
  api         API 调试（规划中）
  mcp         启动 MCP server（给编码 Agent 连接）
  review      评审（规划中）

全局选项:
  --help, -h     显示帮助
  --version, -V  显示版本号

示例:
  verifyos init
  verifyos login https://app.example.com
  verifyos login https://app.example.com --token <TOKEN>
`;

// 从 packages/cli/package.json 读取版本号（src/ 与 dist/ 均向上找一级）
function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(HELP);
    return;
  }

  const cmd = args[0];
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "-V" || cmd === "-v") {
    console.log(readVersion());
    return;
  }

  switch (cmd) {
    case "init":
      runInit(process.cwd());
      break;
    case "login":
      await runLogin(args.slice(1));
      break;
    case "run":
      await runRun(args.slice(1));
      break;
    case "report":
      await runReport(args.slice(1));
      break;
    case "mcp":
      runMcp();
      break;
    default:
      if (PLANNED_COMMANDS.includes(cmd)) {
        console.log("命令 " + cmd + " 尚未实现（规划中）。");
      } else {
        console.error("未知命令：" + cmd);
        console.error("运行 verifyos --help 查看可用命令。");
        process.exitCode = 1;
      }
  }
}

void main();
