import {
  EXIT_FAIL,
  EXIT_INFRA,
  EXIT_PASS,
  EXIT_UNKNOWN,
  formatMarkdownReport,
  resolveBaseUrl,
  triggerAndPollRun,
} from "../common.js";
import { readProjectConfig } from "../config.js";

// verifyos run：触发一次验证并轮询到终态，按 verdict 返回退出码（0=pass/1=fail/2=unknown/3=基础设施错误）

interface RunArgs {
  ver?: string;
  project?: string;
  env?: string;
  baseUrl?: string;
  timeoutMs?: number;
  format?: "json" | "md";
}

// 解析 run 参数：支持 --key value 与 --key=value
function parseRunArgs(args: string[]): RunArgs {
  const result: RunArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let key = arg;
    let value: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq >= 0) {
        key = arg.slice(0, eq);
        value = arg.slice(eq + 1);
      } else {
        value = args[++i];
      }
    } else {
      console.error("未知参数：" + arg);
      process.exitCode = EXIT_FAIL;
      continue;
    }
    switch (key) {
      case "--ver":
        result.ver = value;
        break;
      case "--project":
        result.project = value;
        break;
      case "--env":
        result.env = value;
        break;
      case "--base-url":
        result.baseUrl = value;
        break;
      case "--timeout":
        result.timeoutMs = value ? Number(value) : undefined;
        break;
      case "--format":
      case "--report-format":
        result.format = value === "json" ? "json" : "md";
        break;
      default:
        console.error("未知参数：" + key);
        process.exitCode = EXIT_FAIL;
    }
  }
  return result;
}

// 从项目配置解析启动 URL：仅 --env 显式指定环境时使用其 url；
// 未指定时省略 startUrl，交由后端使用其默认被测入口（本地 fixture/真实目标）。
function resolveStartUrl(envFlag: string | undefined, cwd: string): string | undefined {
  if (!envFlag) {
    return undefined;
  }
  const project = readProjectConfig(cwd);
  const found = project?.environments.find((e) => e.name === envFlag);
  if (found && found.url) {
    return found.url;
  }
  console.error("警告：未在配置中找到环境 " + envFlag + "，将使用后端默认启动 URL。");
  return undefined;
}

// 执行 run
export async function runRun(args: string[]): Promise<void> {
  const opts = parseRunArgs(args);
  if (opts.timeoutMs !== undefined && (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0)) {
    console.error("--timeout 需为正整数（毫秒）。");
    process.exitCode = EXIT_FAIL;
    return;
  }
  const timeoutMs = opts.timeoutMs ?? 120000;
  const cwd = process.cwd();

  const baseUrl = resolveBaseUrl(opts.baseUrl, cwd);
  if (!baseUrl) {
    console.error("未配置 baseUrl。请先运行 verifyos init 生成项目配置，或用 --base-url 指定服务地址。");
    process.exitCode = EXIT_INFRA;
    return;
  }

  const startUrl = resolveStartUrl(opts.env, cwd);
  const projectName = opts.project ?? readProjectConfig(cwd)?.projectName;

  console.error("触发验证：" + baseUrl + (projectName ? "（项目 " + projectName + "）" : ""));

  const result = await triggerAndPollRun({
    baseUrl,
    verificationShortId: opts.ver,
    startUrl,
    timeoutMs,
  });
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = EXIT_INFRA;
    return;
  }

  const { runId, detail } = result;

  // 输出报告
  if (opts.format === "json") {
    console.log(JSON.stringify(detail, null, 2));
  } else {
    console.log(formatMarkdownReport(runId, detail));
  }

  // 退出码：按 verdict 映射
  const verdict = detail.verdict ?? "unknown";
  if (verdict === "pass") {
    process.exitCode = EXIT_PASS;
  } else if (verdict === "fail") {
    process.exitCode = EXIT_FAIL;
  } else {
    process.exitCode = EXIT_UNKNOWN;
  }
}
