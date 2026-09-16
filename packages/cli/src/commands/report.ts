import {
  EXIT_FAIL,
  EXIT_INFRA,
  fetchJson,
  formatMarkdownReport,
  joinUrl,
  resolveBaseUrl,
  type RunDetail,
} from "../common.js";

// verifyos report <runId>：拉取指定 Run 详情并输出 Markdown/JSON 报告

interface ReportArgs {
  runId?: string;
  baseUrl?: string;
  format?: "json" | "md";
}

function parseReportArgs(args: string[]): ReportArgs {
  const result: ReportArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--format" || arg === "--report-format") {
      result.format = args[++i] === "json" ? "json" : "md";
    } else if (arg.startsWith("--format=") || arg.startsWith("--report-format=")) {
      const v = arg.slice(arg.indexOf("=") + 1);
      result.format = v === "json" ? "json" : "md";
    } else if (arg === "--base-url") {
      result.baseUrl = args[++i];
    } else if (arg.startsWith("--base-url=")) {
      result.baseUrl = arg.slice("--base-url=".length);
    } else if (arg.startsWith("--")) {
      console.error("未知参数：" + arg);
      process.exitCode = EXIT_FAIL;
    } else if (result.runId === undefined) {
      result.runId = arg;
    } else {
      console.error("多余参数：" + arg);
      process.exitCode = EXIT_FAIL;
    }
  }
  return result;
}

export async function runReport(args: string[]): Promise<void> {
  const opts = parseReportArgs(args);
  if (!opts.runId) {
    console.error("用法：verifyos report <runId> [--format json|md] [--base-url <url>]");
    process.exitCode = EXIT_FAIL;
    return;
  }

  const baseUrl = resolveBaseUrl(opts.baseUrl, process.cwd());
  if (!baseUrl) {
    console.error("未配置 baseUrl。请先运行 verifyos init 生成项目配置，或用 --base-url 指定服务地址。");
    process.exitCode = EXIT_INFRA;
    return;
  }

  let status: number;
  let data: unknown;
  try {
    const res = await fetchJson(joinUrl(baseUrl, "api/runs/" + opts.runId), { method: "GET" });
    status = res.status;
    data = res.data;
  } catch (err) {
    console.error("服务不可达：" + (err instanceof Error ? err.message : String(err)));
    process.exitCode = EXIT_INFRA;
    return;
  }

  if (status < 200 || status >= 300) {
    console.error("查询失败：HTTP " + status + " " + JSON.stringify(data));
    process.exitCode = EXIT_FAIL;
    return;
  }

  const detail = data as RunDetail | null;
  if (!detail || !detail.found) {
    console.error("未找到 Run：" + opts.runId);
    process.exitCode = EXIT_FAIL;
    return;
  }

  if (opts.format === "json") {
    console.log(JSON.stringify(detail, null, 2));
  } else {
    console.log(formatMarkdownReport(opts.runId, detail));
  }
  process.exitCode = 0;
}
