import { createInterface } from "node:readline";
import {
  authHeaders,
  fetchJson,
  joinUrl,
  resolveBaseUrl,
  triggerAndPollRun,
  type RunDetail,
} from "./common.js";

// verifyos mcp：stdio MCP server 实现。
// 面向编码 Agent（Cursor / Claude Code 等），读写 stdin / stdout，换行分隔 JSON-RPC 2.0。
// 与 CLI run 复用 triggerAndPollRun 底层；暴露工具：run / read_run / list_verifications。

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "verifyos";
const SERVER_VERSION = "0.0.1";

// ---------- 工具清单（tools/list 返回） ----------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "run",
    description: "触发一次验证并轮询到终态，返回 verdict / llmCalls / 耗时",
    inputSchema: {
      type: "object",
      properties: {
        ver: { type: "string", description: "验证 short_id（可选，不传则跑后端默认验证）" },
        startUrl: { type: "string", description: "被测应用入口 URL（可选，不传用后端默认入口）" },
        timeoutMs: { type: "number", description: "轮询超时毫秒，默认 120000" },
      },
    },
  },
  {
    name: "read_run",
    description: "读取某次 run 的详情，返回判定 / 耗时 / llmCalls / 步骤结果摘要",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "runId / short_id" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_verifications",
    description: "列出验证库，返回 short_id / title / status 摘要",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ---------- JSON-RPC 响应 ----------

type JsonRpcId = number | string;

function writeLine(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function respond(id: JsonRpcId, result: unknown): void {
  writeLine({ jsonrpc: "2.0", id, result });
}

function respondError(id: JsonRpcId, code: number, message: string): void {
  writeLine({ jsonrpc: "2.0", id, error: { code, message } });
}

// ---------- 工具结果封装 ----------

interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function textResult(text: string): ToolCallResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): ToolCallResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ---------- 工具实现 ----------

function resolveServerBaseUrl(): string | undefined {
  return resolveBaseUrl(undefined, process.cwd());
}

// 从 RunDetail 抽取结构化摘要（JSON 字符串，供 Agent 解析）
function summarizeRun(runId: string, detail: RunDetail): string {
  const steps = (detail.stepResults ?? []).map((s) => ({
    id: s.id,
    verdict: s.verdict,
    llmCalls: s.llmCalls,
    cacheHit: s.cacheHit,
    durationMs: s.durationMs,
  }));
  const result = {
    ok: true,
    runId,
    verdict: detail.verdict ?? "unknown",
    llmCalls: detail.llmCalls ?? 0,
    durationMs: detail.durationMs ?? 0,
    failedStep: detail.failedStep ?? null,
    failureSummary: detail.failureSummary ?? null,
    evidenceKeys: detail.evidenceKeys ?? [],
    visitedUrls: detail.visitedUrls ?? [],
    stepResults: steps,
  };
  return JSON.stringify(result, null, 2);
}

async function toolRun(args: Record<string, unknown>): Promise<ToolCallResult> {
  const baseUrl = resolveServerBaseUrl();
  if (!baseUrl) {
    return errorResult("未配置 baseUrl：请运行 verifyos login <url> 或设置环境变量 VERIFYOS_BASE_URL。");
  }
  const timeoutRaw = args.timeoutMs;
  const timeoutMs =
    typeof timeoutRaw === "number" && Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 120000;
  const ver = typeof args.ver === "string" ? args.ver : undefined;
  const startUrl = typeof args.startUrl === "string" ? args.startUrl : undefined;

  const result = await triggerAndPollRun({ baseUrl, verificationShortId: ver, startUrl, timeoutMs });
  if (!result.ok) {
    return errorResult(result.error);
  }
  return textResult(summarizeRun(result.runId, result.detail));
}

async function toolReadRun(args: Record<string, unknown>): Promise<ToolCallResult> {
  const id = typeof args.id === "string" ? args.id : "";
  if (!id) {
    return errorResult("缺少参数 id。");
  }
  const baseUrl = resolveServerBaseUrl();
  if (!baseUrl) {
    return errorResult("未配置 baseUrl：请运行 verifyos login <url> 或设置环境变量 VERIFYOS_BASE_URL。");
  }
  let status: number;
  let data: unknown;
  try {
    const res = await fetchJson(joinUrl(baseUrl, "api/runs/" + id), { method: "GET", headers: authHeaders() });
    status = res.status;
    data = res.data;
  } catch (err) {
    return errorResult("服务不可达：" + (err instanceof Error ? err.message : String(err)));
  }
  if (status < 200 || status >= 300) {
    return errorResult("查询失败：HTTP " + status + " " + JSON.stringify(data));
  }
  const detail = data as RunDetail | null;
  if (!detail || !detail.found) {
    return errorResult("未找到 Run：" + id);
  }
  return textResult(summarizeRun(id, detail));
}

async function toolListVerifications(): Promise<ToolCallResult> {
  const baseUrl = resolveServerBaseUrl();
  if (!baseUrl) {
    return errorResult("未配置 baseUrl：请运行 verifyos login <url> 或设置环境变量 VERIFYOS_BASE_URL。");
  }
  let status: number;
  let data: unknown;
  try {
    const res = await fetchJson(joinUrl(baseUrl, "api/verifications"), { method: "GET", headers: authHeaders() });
    status = res.status;
    data = res.data;
  } catch (err) {
    return errorResult("服务不可达：" + (err instanceof Error ? err.message : String(err)));
  }
  if (status < 200 || status >= 300) {
    return errorResult("查询失败：HTTP " + status + " " + JSON.stringify(data));
  }
  const items = (data as { items?: Array<Record<string, unknown>> } | null)?.items ?? [];
  const summary = items.map((v) => ({
    short_id: v.short_id,
    title: v.title,
    status: v.status,
  }));
  return textResult(JSON.stringify({ ok: true, count: summary.length, items: summary }, null, 2));
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  switch (name) {
    case "run":
      return toolRun(args);
    case "read_run":
      return toolReadRun(args);
    case "list_verifications":
      return toolListVerifications();
    default:
      return errorResult("未知工具：" + name);
  }
}

// ---------- 消息分发 ----------

interface IncomingMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

async function handleMessage(msg: IncomingMessage): Promise<void> {
  if (msg.jsonrpc !== "2.0" || !msg.method) {
    return;
  }
  const id = msg.id;
  const method = msg.method;
  const params = (msg.params ?? {}) as Record<string, unknown>;

  if (method === "initialize") {
    respond(id as JsonRpcId, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }

  // 通知（无 id）：如 notifications/initialized，无需响应
  if (id === undefined || id === null) {
    return;
  }

  if (method === "tools/list") {
    respond(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      respond(id, await callTool(name, args));
    } catch (err) {
      respond(id, errorResult("工具调用异常：" + (err instanceof Error ? err.message : String(err))));
    }
    return;
  }

  respondError(id, -32601, "Method not found：" + method);
}

// 启动 stdio MCP server：逐行读 stdin，按 JSON-RPC 2.0 分发，响应写 stdout
export function startMcpServer(): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const text = line.trim();
    if (!text) {
      return;
    }
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(text) as IncomingMessage;
    } catch {
      return; // 非 JSON 行（如调试输出误入 stdin）忽略
    }
    void handleMessage(msg);
  });
  // stdout 写失败（如客户端断开 EPIPE）不致命
  process.stdout.on("error", () => undefined);
}
