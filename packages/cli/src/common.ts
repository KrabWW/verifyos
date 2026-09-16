import { readGlobalConfig, readProjectConfig } from "./config.js";

// run/report 共享：退出码、API 请求、baseUrl 解析、Markdown 报告格式化

// 退出码约定（与 ticket 对齐）：0=pass / 1=fail / 2=unknown / 3=基础设施错误
export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_UNKNOWN = 2;
export const EXIT_INFRA = 3;

// 判定终态集合：达到即停止轮询
const TERMINAL_VERDICTS = new Set(["pass", "fail", "unknown"]);

export function isTerminalVerdict(verdict: unknown): boolean {
  return typeof verdict === "string" && TERMINAL_VERDICTS.has(verdict);
}

// GET /api/runs/:id 返回的详情形状（内存/PG 兜底字段一致）
export interface RunDetail {
  found: boolean;
  verShortId?: string | null;
  verdict?: string;
  llmCalls?: number;
  cache?: { entries: number; totalHits: number };
  durationMs?: number;
  failedStep?: string;
  failureSummary?: string;
  stepResults?: Array<{ id: string; verdict: string; llmCalls: number; cacheHit: boolean; durationMs: number }>;
  visitedUrls?: string[];
  reachability?: Array<{ stepId: string; verdict: string; explanation: string; matchedUrl?: string }>;
  evidenceKeys?: string[];
}

// 带超时的 JSON 请求；返回 HTTP 状态与已解析数据（非 JSON 时返回字符串）
export async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: unknown = text;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// 拼接 URL：处理 baseUrl 末尾斜杠与 path 前导斜杠
export function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

// 解析服务地址：--base-url 参数 > 项目配置 baseUrl > 全局凭据 baseUrl > 环境变量 VERIFYOS_BASE_URL
export function resolveBaseUrl(flag: string | undefined, cwd: string): string | undefined {
  if (flag) {
    return flag;
  }
  const project = readProjectConfig(cwd);
  if (project?.baseUrl) {
    return project.baseUrl;
  }
  const global = readGlobalConfig();
  if (global?.baseUrl) {
    return global.baseUrl;
  }
  // 兜底：环境变量（MCP server 场景：Agent 进程无 config.yaml / 未 login 时用）
  return process.env.VERIFYOS_BASE_URL || undefined;
}

// 构造 Authorization 头（有全局 token 才带，服务端无鉴权时忽略）
export function authHeaders(): Record<string, string> {
  const global = readGlobalConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (global?.token) {
    headers["Authorization"] = "Bearer " + global.token;
  }
  return headers;
}

// ---------- 可复用的「触发 + 轮询」执行器（CLI run 与 MCP run 工具共用） ----------

export interface TriggerAndPollOptions {
  baseUrl: string;
  verificationShortId?: string;
  startUrl?: string;
  timeoutMs: number;
  pollIntervalMs?: number;
}

export type TriggerAndPollResult =
  | { ok: true; runId: string; detail: RunDetail }
  | { ok: false; error: string; infra: boolean };

// 触发一次验证（POST /api/runs）并轮询到终态，返回结构化结果（不打印，供 CLI 与 MCP 各自呈现）
export async function triggerAndPollRun(opts: TriggerAndPollOptions): Promise<TriggerAndPollResult> {
  const { baseUrl, verificationShortId, startUrl, timeoutMs } = opts;
  const pollIntervalMs = opts.pollIntervalMs ?? 1000;

  const body: Record<string, string> = { trigger: "cli" };
  if (verificationShortId) {
    body["verificationShortId"] = verificationShortId;
  }
  if (startUrl) {
    body["startUrl"] = startUrl;
  }

  // 触发 Run（POST /api/runs）
  let triggerStatus: number;
  let triggerData: unknown;
  try {
    const res = await fetchJson(joinUrl(baseUrl, "api/runs"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    triggerStatus = res.status;
    triggerData = res.data;
  } catch (err) {
    return { ok: false, error: "服务不可达：" + (err instanceof Error ? err.message : String(err)), infra: true };
  }

  if (triggerStatus < 200 || triggerStatus >= 300) {
    return { ok: false, error: "触发验证失败：HTTP " + triggerStatus + " " + JSON.stringify(triggerData), infra: true };
  }

  const runId = (triggerData as { runId?: string } | null)?.runId;
  if (!runId) {
    return { ok: false, error: "响应缺少 runId：" + JSON.stringify(triggerData), infra: true };
  }

  // 轮询 GET /api/runs/:id 直到终态或超时
  const deadline = Date.now() + timeoutMs;
  while (true) {
    let status: number;
    let data: unknown;
    try {
      const res = await fetchJson(joinUrl(baseUrl, "api/runs/" + runId), { method: "GET" });
      status = res.status;
      data = res.data;
    } catch (err) {
      return { ok: false, error: "查询 Run 状态失败：" + (err instanceof Error ? err.message : String(err)), infra: true };
    }

    if (status < 200 || status >= 300) {
      return { ok: false, error: "查询 Run 状态失败：HTTP " + status + " " + JSON.stringify(data), infra: true };
    }

    const current = data as RunDetail | null;
    if (current && current.found && isTerminalVerdict(current.verdict)) {
      return { ok: true, runId, detail: current };
    }

    if (Date.now() >= deadline) {
      return { ok: false, error: "轮询超时：Run 未在 " + timeoutMs + "ms 内达到终态。", infra: true };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

// 成本（token）粗估：每次 LLM 调用按约 1000 tokens 计（输入+输出），仅作可观测性参考
function estimateTokens(llmCalls: number): number {
  return llmCalls * 1000;
}

function icon(verdict: string): string {
  return verdict === "pass" ? "[PASS]" : verdict === "fail" ? "[FAIL]" : "[UNKNOWN]";
}

// 将 Run 详情渲染为 Markdown 报告
export function formatMarkdownReport(id: string, detail: RunDetail): string {
  const verdict = detail.verdict ?? "unknown";
  const durationMs = detail.durationMs ?? 0;
  const cache = detail.cache ?? { entries: 0, totalHits: 0 };
  const steps = detail.stepResults ?? [];
  const visitedUrls = detail.visitedUrls ?? [];
  const reachability = detail.reachability ?? [];
  const evidenceKeys = detail.evidenceKeys ?? [];
  // 总 LLM 调用：取 API 聚合值与各步骤之和的较大者（兼容后端聚合字段为 0 的场景）
  const apiLlmCalls = detail.llmCalls ?? 0;
  const stepLlmCalls = steps.reduce((acc, s) => acc + (s.llmCalls ?? 0), 0);
  const llmCalls = Math.max(apiLlmCalls, stepLlmCalls);

  const lines: string[] = [];
  lines.push("# VerifyOS Run 报告 · " + id);
  lines.push("");
  lines.push("## 结论");
  lines.push("");
  lines.push("| 指标 | 值 |");
  lines.push("| --- | --- |");
  lines.push("| 判定 | " + icon(verdict) + " " + verdict.toUpperCase() + " |");
  lines.push("| 耗时 | " + (durationMs / 1000).toFixed(1) + "s |");
  lines.push("| LLM 调用 | " + llmCalls + " 次 |");
  lines.push("| Token 估算 | ~" + estimateTokens(llmCalls) + " tokens |");
  lines.push("| 定位缓存 | " + cache.entries + " 条 / 命中 " + cache.totalHits + " 次 |");
  lines.push("| 证据文件 | " + evidenceKeys.length + " 个 |");
  lines.push("");
  if (detail.failureSummary) {
    lines.push("**失败摘要**：" + detail.failureSummary);
    lines.push("");
  }
  if (steps.length > 0) {
    lines.push("## 步骤明细（" + steps.length + "）");
    lines.push("");
    lines.push("| # | 步骤 | 判定 | LLM | 缓存 | 耗时 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    steps.forEach((s, i) => {
      lines.push(
        "| " + (i + 1) + " | " + s.id + " | " + icon(s.verdict) + " " + s.verdict +
        " | " + s.llmCalls + " | " + (s.cacheHit ? "命中" : "-") +
        " | " + (s.durationMs / 1000).toFixed(1) + "s |",
      );
    });
    lines.push("");
  }
  if (reachability.length > 0) {
    lines.push("## 触达校验");
    lines.push("");
    lines.push("| 步骤 | 判定 | 说明 |");
    lines.push("| --- | --- | --- |");
    for (const r of reachability) {
      lines.push(
        "| " + r.stepId + " | " + icon(r.verdict) + " " + r.verdict +
        " | " + r.explanation + (r.matchedUrl ? "（命中 " + r.matchedUrl + "）" : "") + " |",
      );
    }
    lines.push("");
  }
  if (visitedUrls.length > 0) {
    lines.push("## 实际触达 URL（" + visitedUrls.length + "）");
    lines.push("");
    for (const u of visitedUrls) {
      lines.push("- " + u);
    }
    lines.push("");
  }
  if (evidenceKeys.length > 0) {
    lines.push("## 证据附件");
    lines.push("");
    for (const k of evidenceKeys) {
      lines.push("- `" + k + "`");
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("*Generated by VerifyOS CLI*");
  return lines.join("\n");
}
