/**
 * ResponseViewer — 响应查看器（四 lens）。
 *
 * 状态栏：状态码大徽章 + 耗时 + 大小。
 * Lens：响应体（手写 tokenizer JSON 高亮 + 行号）/ 响应头 / 耗时瀑布（纯 div 条形）/ 原始。
 * 加载：外部不传 loading 时，response 变化自动模拟 600ms spinner。
 *
 * 独立性：仅依赖 @/components/api-tree/types，不引用 src/types.ts / utils。
 */
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Timer, HardDriveDownload } from "lucide-react";
import type { MockResponse } from "../api-tree/types";

/* ============ JSON 手写 tokenizer（不引库） ============ */

type TokenKind = "key" | "string" | "number" | "boolean" | "null" | "plain";

const JSON_TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|(\btrue\b|\bfalse\b)|(\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const TOKEN_CLASS: Record<TokenKind, string> = {
  key: "text-teal-400",
  string: "text-emerald-400",
  number: "text-violet-400",
  boolean: "text-orange-400",
  null: "text-zinc-500",
  plain: "text-slate-300",
};

/** 对单行 JSON 源码做 token 切分（保证 token 首尾相接还原原行） */
export function tokenizeJsonLine(line: string): { text: string; kind: TokenKind }[] {
  const out: { text: string; kind: TokenKind }[] = [];
  let last = 0;
  JSON_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSON_TOKEN_RE.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), kind: "plain" });
    const [full, str, colon, bool, nil, num] = m;
    if (str !== undefined) out.push({ text: full, kind: colon ? "key" : "string" });
    else if (bool !== undefined) out.push({ text: full, kind: "boolean" });
    else if (nil !== undefined) out.push({ text: full, kind: "null" });
    else if (num !== undefined) out.push({ text: full, kind: "number" });
    last = m.index + full.length;
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: "plain" });
  return out;
}

function JsonLine({ line }: { line: string }) {
  const tokens = useMemo(() => tokenizeJsonLine(line), [line]);
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={TOKEN_CLASS[t.kind]}>{t.text}</span>
      ))}
    </>
  );
}

/* ============ 状态徽章色 ============ */

function statusClass(status: number): string {
  if (status < 300) return "bg-get/15 text-get ring-get/40";
  if (status < 400) return "bg-put/15 text-put ring-put/40";
  return "bg-del/15 text-del ring-del/40";
}

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

/* ============ 耗时瀑布 ============ */

const SEGMENTS: { key: keyof MockResponse["timing"]; label: string; color: string }[] = [
  { key: "dns", label: "DNS", color: "bg-cyan-400" },
  { key: "connect", label: "连接", color: "bg-post" },
  { key: "tls", label: "TLS", color: "bg-violet-400" },
  { key: "firstByte", label: "首字节", color: "bg-get" },
];

function Waterfall({ timing }: { timing: MockResponse["timing"] }) {
  const total = Math.max(timing.total, 1);
  let offset = 0;
  const rows = SEGMENTS.map((seg) => {
    const v = timing[seg.key] as number;
    const left = offset;
    offset += v;
    return { ...seg, value: v, left, width: (v / total) * 100 };
  });
  return (
    <div className="space-y-2 p-3">
      <div className="mb-1 flex items-center justify-between text-[11px] text-fg-secondary">
        <span className="flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5 text-accent" />
          请求耗时分解
        </span>
        <span className="font-mono text-accent">总计 {timing.total} ms</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2.5">
          <span className="w-14 shrink-0 text-right text-[11px] text-fg-secondary">{r.label}</span>
          <div className="relative h-4 flex-1 rounded-sm bg-bg-tertiary">
            <div
              className={`absolute h-full rounded-sm ${r.color} opacity-80`}
              style={{ left: `${(r.left / total) * 100}%`, width: `${Math.max(r.width, 0.8)}%` }}
              title={`${r.label}: ${r.value} ms`}
            />
          </div>
          <span className="w-16 shrink-0 font-mono text-[11px] text-fg-primary">{r.value} ms</span>
        </div>
      ))}
      {/* 空闲（remaining）段 */}
      {timing.total > offset && (
        <div className="flex items-center gap-2.5">
          <span className="w-14 shrink-0 text-right text-[11px] text-fg-secondary">内容下载</span>
          <div className="relative h-4 flex-1 rounded-sm bg-bg-tertiary">
            <div
              className="absolute h-full rounded-sm bg-put opacity-80"
              style={{ left: `${(offset / total) * 100}%`, width: `${((timing.total - offset) / total) * 100}%` }}
              title={`内容下载: ${timing.total - offset} ms`}
            />
          </div>
          <span className="w-16 shrink-0 font-mono text-[11px] text-fg-primary">{timing.total - offset} ms</span>
        </div>
      )}
    </div>
  );
}

/* ============ Props ============ */

export interface ResponseViewerProps {
  response?: MockResponse;
  /** 外部可控 loading；缺省时 response 变化自动模拟 600ms */
  loading?: boolean;
  /** 初始激活 lens（预览/测试用） */
  initialLens?: LensId;
  /** 重新发送按钮回调 */
  onResend?: () => void;
  className?: string;
}

type LensId = "body" | "headers" | "timing" | "raw";

/* ============ 主组件 ============ */

export default function ResponseViewer({ response, loading: externalLoading, onResend, className = "" }: ResponseViewerProps) {
  const [lens, setLens] = useState<LensId>("body");
  const [internalLoading, setInternalLoading] = useState(false);

  /* 模拟 600ms loading */
  useEffect(() => {
    if (externalLoading !== undefined) return;
    if (!response) return;
    setInternalLoading(true);
    const t = setTimeout(() => setInternalLoading(false), 600);
    return () => clearTimeout(t);
  }, [response, externalLoading]);

  const loading = externalLoading ?? internalLoading;

  /* 响应体 pretty JSON + 行号 */
  const bodyLines = useMemo(() => {
    if (!response) return [] as string[];
    try {
      return JSON.stringify(response.body, null, 2).split("\n");
    } catch {
      return [String(response.body)];
    }
  }, [response]);

  const rawText = useMemo(() => {
    if (!response) return "";
    const head = response.headers.map((h) => `${h.key}: ${h.value}`).join("\n");
    return `HTTP/1.1 ${response.status} ${response.statusText}\n${head}\n\n${JSON.stringify(response.body)}`;
  }, [response]);

  const lenses: { id: LensId; label: string }[] = [
    { id: "body", label: "响应体" },
    { id: "headers", label: "响应头" },
    { id: "timing", label: "耗时瀑布" },
    { id: "raw", label: "原始" },
  ];

  return (
    <div className={`flex h-full min-w-0 flex-col bg-bg-primary ${className}`}>
      {/* ===== 状态栏 ===== */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        {response ? (
          <>
            <span
              className={`rounded-md px-2.5 py-1 font-mono text-sm font-bold ring-1 ${statusClass(response.status)}`}
            >
              {response.status}
              <span className="ml-1.5 text-[11px] font-medium opacity-80">{response.statusText}</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] text-fg-secondary">
              <Timer className="h-3.5 w-3.5" />
              {response.timeMs} ms
            </span>
            <span className="flex items-center gap-1 text-[11px] text-fg-secondary">
              <HardDriveDownload className="h-3.5 w-3.5" />
              {formatBytes(response.sizeBytes)}
            </span>
          </>
        ) : (
          <span className="text-xs text-fg-muted">尚无响应 — 点击「发送」查看结果</span>
        )}

        {onResend && (
          <button
            onClick={onResend}
            title="重新发送"
            className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-[11px] text-fg-secondary transition-colors hover:border-accent-line hover:text-accent"
          >
            <RefreshCw className="h-3 w-3" /> 重新发送
          </button>
        )}
      </div>

      {/* ===== Lens tab 行 ===== */}
      {response && (
        <div className="flex items-center gap-0.5 border-b border-border px-2.5">
          {lenses.map((l) => (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs transition-colors ${
                lens === l.id
                  ? "border-accent font-medium text-fg-primary"
                  : "border-transparent text-fg-secondary hover:text-fg-primary"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* ===== 内容 ===== */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2.5" data-testid="response-loading">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-xs text-fg-secondary">请求中…</span>
          </div>
        )}

        {!loading && !response && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-xs text-fg-muted">
              <div className="mx-auto mb-2 h-8 w-8 rounded-full border-2 border-dashed border-border" />
              发送请求后在此查看响应
            </div>
          </div>
        )}

        {!loading && response && lens === "body" && (
          <div className="flex min-h-full font-mono text-xs leading-6">
            {/* 行号列 */}
            <div className="select-none border-r border-border bg-bg-secondary px-2.5 py-2.5 text-right text-zinc-600">
              {bodyLines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* 代码列 */}
            <pre className="flex-1 overflow-x-auto whitespace-pre px-3 py-2.5 text-slate-300">
              {bodyLines.map((line, i) => (
                <div key={i}><JsonLine line={line} /></div>
              ))}
            </pre>
          </div>
        )}

        {!loading && response && lens === "headers" && (
          <table className="w-full text-left font-mono text-xs">
            <tbody>
              {response.headers.map((h, i) => (
                <tr key={i} className="border-b border-border/60 hover:bg-bg-tertiary/50">
                  <td className="w-1/3 px-3 py-1.5 align-top text-teal-400">{h.key}</td>
                  <td className="px-3 py-1.5 align-top text-fg-secondary">{h.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && response && lens === "timing" && <Waterfall timing={response.timing} />}

        {!loading && response && lens === "raw" && (
          <pre className="min-h-full whitespace-pre-wrap break-all px-3 py-2.5 font-mono text-xs leading-6 text-fg-secondary">
            {rawText}
          </pre>
        )}
      </div>
    </div>
  );
}
