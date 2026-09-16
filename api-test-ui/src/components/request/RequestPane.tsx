/**
 * RequestPane — 中栏请求编辑器（Bruno tab 化形态）。
 *
 * URL 栏：method 着色下拉 + {{base}} 环境变量绿色高亮 + 粘贴 curl 导入 + 发送。
 * Tab 行：Params / Body / Headers / Auth / 断言 / 前置 / 后置（计数徽标）。
 * ⌘S 存为用例。
 *
 * 独立性：仅依赖 @/components/api-tree/types（自含域类型），不引用 src/types.ts。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ClipboardPaste, Plus, Send, Save, Trash2, X, Braces } from "lucide-react";
import type { Assertion, AuthType, BodyType, HttpMethod, KeyValue, RequestState } from "../api-tree/types";

/* ---------- 样式映射 ---------- */

const METHOD_TEXT: Record<HttpMethod, string> = {
  GET: "text-get",
  POST: "text-post",
  PUT: "text-put",
  DELETE: "text-del",
  PATCH: "text-patch",
};

const METHOD_RING: Record<HttpMethod, string> = {
  GET: "border-get/40 hover:bg-get/15",
  POST: "border-post/40 hover:bg-post/15",
  PUT: "border-put/40 hover:bg-put/15",
  DELETE: "border-del/40 hover:bg-del/15",
  PATCH: "border-patch/40 hover:bg-patch/15",
};

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

/* ---------- 工具 ---------- */

let seq = 0;
const uid = () => `kv-${Date.now().toString(36)}-${seq++}`;

const kv = (key = "", value = "", enabled = true): KeyValue => ({ id: uid(), key, value, enabled });

/** 解析 curl 命令 → 请求片段（method/url/params/headers/body/basic 认证） */
export function parseCurl(cmd: string): Partial<RequestState> {
  const s = cmd.replace(/\\\n/g, " ").trim();
  if (!s) return {};
  // 分词：支持成对引号
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) tokens.push(m[1] ?? m[2] ?? m[3] ?? "");

  let url = "";
  let method: HttpMethod | undefined;
  const headers: KeyValue[] = [];
  let data: string | undefined;
  let basic: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[i + 1];
    const urlLike = (v: string) => /^https?:\/\//.test(v) || v.includes("{{");
    if (t === "-X" || t === "--request") { method = next() as HttpMethod; i++; }
    else if (t === "--url") { url = next(); i++; }
    else if (t === "-H" || t === "--header") {
      const h = next() ?? "";
      const idx = h.indexOf(":");
      if (idx > 0) headers.push(kv(h.slice(0, idx).trim(), h.slice(idx + 1).trim()));
      i++;
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") { data = next(); i++; }
    else if (t === "-u" || t === "--user") { basic = next(); i++; }
    else if (!t.startsWith("-") && urlLike(t)) url = t;
  }
  if (!method) method = data ? "POST" : "GET";

  // URL 中的 query 拆为 params
  let path = url;
  const params: KeyValue[] = [];
  const qi = url.indexOf("?");
  if (qi > -1) {
    path = url.slice(0, qi);
    for (const pair of url.slice(qi + 1).split("&")) {
      if (!pair) continue;
      const [k, v = ""] = pair.split("=");
      params.push(kv(decodeURIComponent(k), decodeURIComponent(v)));
    }
  }

  const out: Partial<RequestState> = { method, url: path, params, headers };
  if (data !== undefined) {
    out.body = data;
    const trimmed = data.trim();
    out.bodyType =
      trimmed.startsWith("{") || trimmed.startsWith("[")
        ? "json"
        : trimmed.includes("=") && !trimmed.startsWith("[")
          ? "form-data"
          : "raw";
  }
  if (basic) {
    const [username = "", password = ""] = basic.split(":");
    out.auth = { type: "basic", token: "", username, password, keyName: "X-API-Key", keyValue: "" };
  }
  return out;
}

/* ---------- Props ---------- */

export interface RequestPaneProps {
  /** 非受控初始值；外部状态变化时可通过 key 重挂载 */
  initialRequest: RequestState;
  /** 初始激活 tab（预览/测试用） */
  initialTab?: TabId;
  /** 初始展开 curl 导入面板（预览/测试用） */
  initialCurlOpen?: boolean;
  onRequestChange?: (r: RequestState) => void;
  onSend?: (r: RequestState) => void;
  onSaveCase?: (r: RequestState) => void;
  className?: string;
}

type TabId = "params" | "body" | "headers" | "auth" | "assertions" | "pre" | "post";

/* ---------- 子组件 ---------- */

/** 带计数徽标的 tab 标签 */
function TabLabel({ label, count, warn }: { label: string; count?: number; warn?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-1.5 text-[10px] leading-4 font-medium ${
            warn ? "bg-amber-400/20 text-amber-400" : "bg-accent-dim text-accent"
          }`}
        >
          {count}
        </span>
      )}
    </span>
  );
}

/** {{var}} 环境变量绿色高亮的 URL 输入（双层：底层高亮 + 上层透明输入） */
function EnvUrlInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = useMemo(() => value.split(/(\{\{[^}]*\}\})/g), [value]);
  return (
    <div className="relative flex-1">
      {/* 高亮层 */}
      <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-2.5 font-mono text-xs leading-8" aria-hidden>
        {value === "" ? <span className="text-fg-muted">https://api.example.com/…</span> :
          parts.map((p, i) =>
            /^\{\{.*\}\}$/.test(p) ? (
              <span key={i} className="rounded bg-emerald-400/10 px-0.5 font-medium text-emerald-400">{p}</span>
            ) : (
              <span key={i} className="text-fg-primary">{p}</span>
            ),
          )}
      </div>
      {/* 透明输入层（文字透明、光标可见） */}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="h-8 w-full rounded-md border border-border bg-bg-primary px-2.5 font-mono text-xs text-transparent caret-fg-primary outline-none transition-colors focus:border-accent-line focus:bg-bg-tertiary"
      />
    </div>
  );
}

/** 键值对表格（可增删行） */
function KvTable({ rows, onChange }: { rows: KeyValue[]; onChange: (rows: KeyValue[]) => void }) {
  const update = (id: string, patch: Partial<KeyValue>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const cellCls =
    "h-7 w-full bg-transparent px-2 text-xs text-fg-primary outline-none placeholder:text-fg-muted";
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="grid grid-cols-[28px_1fr_1fr_28px] items-center border-b border-border bg-bg-tertiary/60 text-[10px] uppercase tracking-wider text-fg-muted">
        <span />
        <span className="px-2 py-1">键</span>
        <span className="px-2 py-1">值</span>
        <span />
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[28px_1fr_1fr_28px] items-center border-b border-border/60 last:border-b-0 hover:bg-bg-tertiary/40">
          <label className="flex justify-center">
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => update(r.id, { enabled: e.target.checked })}
              className="h-3 w-3 accent-[hsl(var(--accent))]"
            />
          </label>
          <input value={r.key} onChange={(e) => update(r.id, { key: e.target.value })} placeholder="key" spellCheck={false} className={`${cellCls} font-mono`} />
          <input value={r.value} onChange={(e) => update(r.id, { value: e.target.value })} placeholder="value" spellCheck={false} className={`${cellCls} font-mono`} />
          <button
            onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
            className="flex h-7 justify-center text-fg-muted transition-colors hover:text-del"
            title="删除行"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...rows, kv()])}
        className="flex w-full items-center gap-1 px-2.5 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent-dim"
      >
        <Plus className="h-3 w-3" /> 添加行
      </button>
    </div>
  );
}

/* ---------- 主组件 ---------- */

export default function RequestPane({ initialRequest, onRequestChange, onSend, onSaveCase, className = "" }: RequestPaneProps) {
  const [req, setReq] = useState<RequestState>(initialRequest);
  const [tab, setTab] = useState<TabId>("params");
  const [methodOpen, setMethodOpen] = useState(false);
  const [curlPanel, setCurlPanel] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [curlError, setCurlError] = useState("");
  const methodRef = useRef<HTMLDivElement>(null);

  const patch = (p: Partial<RequestState>) => {
    const next = { ...req, ...p };
    setReq(next);
    onRequestChange?.(next);
  };

  /* ⌘S / Ctrl+S 存为用例 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveCase?.(req);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, onSaveCase]);

  /* 点击外部关闭 method 下拉 */
  useEffect(() => {
    if (!methodOpen) return;
    const onDown = (e: MouseEvent) => {
      if (methodRef.current && !methodRef.current.contains(e.target as Node)) setMethodOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [methodOpen]);

  const counts = {
    params: req.params.filter((p) => p.enabled && (p.key || p.value)).length,
    body: req.bodyType === "none" ? 0 : req.bodyType === "form-data" ? req.params.length : 1,
    headers: req.headers.filter((h) => h.enabled && (h.key || h.value)).length,
    assertions: req.assertions.length,
  };

  const tabs: { id: TabId; el: ReactNode }[] = [
    { id: "params", el: <TabLabel label="Params" count={counts.params} /> },
    { id: "body", el: <TabLabel label="Body" count={counts.body} /> },
    { id: "headers", el: <TabLabel label="Headers" count={counts.headers} /> },
    { id: "auth", el: <TabLabel label="Auth" /> },
    { id: "assertions", el: <TabLabel label="断言" count={counts.assertions} warn /> },
    { id: "pre", el: <TabLabel label="前置" /> },
    { id: "post", el: <TabLabel label="后置" /> },
  ];

  const doImportCurl = () => {
    const parsed = parseCurl(curlText);
    if (!parsed.url && !parsed.method) {
      setCurlError("未识别到有效 curl 命令（需包含 URL 或 -X）");
      return;
    }
    patch({ ...parsed, params: parsed.params ?? req.params, headers: parsed.headers ?? req.headers });
    setCurlError("");
    setCurlPanel(false);
    setCurlText("");
  };

  const authTypes: { id: AuthType; label: string }[] = [
    { id: "bearer", label: "Bearer" },
    { id: "basic", label: "Basic" },
    { id: "api-key", label: "API Key" },
  ];

  const bodyTypes: { id: BodyType; label: string }[] = [
    { id: "none", label: "none" },
    { id: "json", label: "json" },
    { id: "form-data", label: "form-data" },
    { id: "raw", label: "raw" },
  ];

  return (
    <div className={`flex h-full min-w-0 flex-col bg-bg-primary ${className}`}>
      {/* ===== URL 栏 ===== */}
      <div className="border-b border-border p-2.5">
        <div className="flex items-center gap-2">
          {/* method 下拉（着色） */}
          <div ref={methodRef} className="relative shrink-0">
            <button
              onClick={() => setMethodOpen((v) => !v)}
              className={`flex h-8 items-center gap-1 rounded-md border bg-bg-secondary px-2.5 text-xs font-bold tracking-wide transition-colors ${METHOD_RING[req.method]} ${METHOD_TEXT[req.method]}`}
            >
              {req.method}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
            {methodOpen && (
              <ul className="absolute left-0 top-9 z-20 w-28 overflow-hidden rounded-md border border-border bg-bg-secondary py-1 shadow-xl shadow-black/40">
                {METHODS.map((m) => (
                  <li key={m}>
                    <button
                      onClick={() => { patch({ method: m }); setMethodOpen(false); }}
                      className={`flex w-full items-center px-3 py-1.5 text-left text-xs font-bold hover:bg-bg-tertiary ${
                        m === req.method ? "bg-bg-tertiary" : ""
                      } ${METHOD_TEXT[m]}`}
                    >
                      {m}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <EnvUrlInput value={req.url} onChange={(url) => patch({ url })} />

          <button
            onClick={() => setCurlPanel((v) => !v)}
            title="粘贴 curl 命令导入"
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
              curlPanel ? "border-accent-line bg-accent-dim text-accent" : "border-border bg-bg-secondary text-fg-secondary hover:border-accent-line hover:text-accent"
            }`}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">粘贴 curl 导入</span>
          </button>

          <button
            onClick={() => onSend?.(req)}
            title="发送请求"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-semibold text-black/85 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Send className="h-3.5 w-3.5" />
            发送
          </button>
        </div>

        {/* curl 导入面板 */}
        {curlPanel && (
          <div className="mt-2 rounded-md border border-accent-line bg-bg-secondary p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-medium text-accent">
                <Braces className="h-3 w-3" /> 粘贴 curl 命令（支持 -X / -H / -d / -u）
              </span>
              <button onClick={() => setCurlPanel(false)} className="text-fg-muted hover:text-fg-primary">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              value={curlText}
              onChange={(e) => setCurlText(e.target.value)}
              placeholder={'curl -X POST "https://api.example.com/auth/login" -H "Content-Type: application/json" -d \'{"username":"a"}\''}
              rows={3}
              spellCheck={false}
              className="w-full resize-y rounded border border-border bg-bg-primary px-2.5 py-1.5 font-mono text-xs text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent-line"
            />
            {curlError && <p className="mt-1 text-[11px] text-del">{curlError}</p>}
            <div className="mt-1.5 flex justify-end">
              <button
                onClick={doImportCurl}
                className="rounded bg-accent px-2.5 py-1 text-[11px] font-semibold text-black/85 transition-all hover:brightness-110"
              >
                解析并填充
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Tab 行 ===== */}
      <div className="flex items-center gap-0.5 border-b border-border px-2.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-2.5 py-2 text-xs transition-colors ${
              tab === t.id
                ? "border-accent font-medium text-fg-primary"
                : "border-transparent text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {t.el}
          </button>
        ))}
        <div className="ml-auto flex items-center">
          <button
            onClick={() => onSaveCase?.(req)}
            title="存为用例（⌘S）"
            className="mb-1 flex items-center gap-1.5 rounded-md border border-accent-line bg-accent-dim px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Save className="h-3 w-3" />
            存为用例
            <kbd className="rounded border border-accent-line bg-bg-primary px-1 text-[9px] leading-4 text-fg-secondary">⌘S</kbd>
          </button>
        </div>
      </div>

      {/* ===== Tab 内容 ===== */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "params" && (
          <KvTable rows={req.params} onChange={(params) => patch({ params })} />
        )}

        {tab === "body" && (
          <div className="space-y-2.5">
            {/* 类型单选 */}
            <div className="flex gap-1">
              {bodyTypes.map((b) => (
                <button
                  key={b.id}
                  onClick={() => patch({ bodyType: b.id })}
                  className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    req.bodyType === b.id
                      ? "bg-accent-dim text-accent ring-1 ring-accent-line"
                      : "bg-bg-tertiary text-fg-secondary hover:text-fg-primary"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {req.bodyType === "none" && (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-fg-muted">
                该请求不携带请求体
              </p>
            )}

            {(req.bodyType === "json" || req.bodyType === "raw") && (
              <textarea
                value={req.body}
                onChange={(e) => patch({ body: e.target.value })}
                placeholder={req.bodyType === "json" ? '{\n  "key": "value"\n}' : "raw payload…"}
                rows={10}
                spellCheck={false}
                className="w-full resize-y rounded-md border border-border bg-[#0b0e14] px-3 py-2.5 font-mono text-xs leading-6 text-slate-200 outline-none placeholder:text-fg-muted focus:border-accent-line"
              />
            )}

            {req.bodyType === "form-data" && (
              <KvTable rows={req.params} onChange={(params) => patch({ params })} />
            )}
          </div>
        )}

        {tab === "headers" && <KvTable rows={req.headers} onChange={(headers) => patch({ headers })} />}

        {tab === "auth" && (
          <div className="max-w-md space-y-3">
            <div className="flex gap-1">
              {authTypes.map((a) => (
                <button
                  key={a.id}
                  onClick={() => patch({ auth: { ...req.auth, type: a.id } })}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    req.auth.type === a.id
                      ? "bg-accent-dim font-medium text-accent ring-1 ring-accent-line"
                      : "bg-bg-tertiary text-fg-secondary hover:text-fg-primary"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {req.auth.type === "bearer" && (
              <label className="block">
                <span className="mb-1 block text-[11px] text-fg-secondary">Token</span>
                <input
                  value={req.auth.token}
                  onChange={(e) => patch({ auth: { ...req.auth, token: e.target.value } })}
                  placeholder="Bearer 令牌或 {{变量}}"
                  spellCheck={false}
                  className="h-8 w-full rounded-md border border-border bg-bg-secondary px-2.5 font-mono text-xs text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent-line"
                />
              </label>
            )}
            {req.auth.type === "basic" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-fg-secondary">用户名</span>
                  <input
                    value={req.auth.username}
                    onChange={(e) => patch({ auth: { ...req.auth, username: e.target.value } })}
                    className="h-8 w-full rounded-md border border-border bg-bg-secondary px-2.5 text-xs text-fg-primary outline-none focus:border-accent-line"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-fg-secondary">密码</span>
                  <input
                    type="password"
                    value={req.auth.password}
                    onChange={(e) => patch({ auth: { ...req.auth, password: e.target.value } })}
                    className="h-8 w-full rounded-md border border-border bg-bg-secondary px-2.5 text-xs text-fg-primary outline-none focus:border-accent-line"
                  />
                </label>
              </div>
            )}
            {req.auth.type === "api-key" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-fg-secondary">Header 名</span>
                  <input
                    value={req.auth.keyName}
                    onChange={(e) => patch({ auth: { ...req.auth, keyName: e.target.value } })}
                    className="h-8 w-full rounded-md border border-border bg-bg-secondary px-2.5 font-mono text-xs text-fg-primary outline-none focus:border-accent-line"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-fg-secondary">Key 值</span>
                  <input
                    value={req.auth.keyValue}
                    onChange={(e) => patch({ auth: { ...req.auth, keyValue: e.target.value } })}
                    className="h-8 w-full rounded-md border border-border bg-bg-secondary px-2.5 font-mono text-xs text-fg-primary outline-none focus:border-accent-line"
                  />
                </label>
              </div>
            )}
            {req.auth.type === "none" && (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-fg-muted">
                未启用认证
              </p>
            )}
          </div>
        )}

        {tab === "assertions" && (
          <div className="space-y-2">
            {req.assertions.map((a) => {
              const updateA = (patchA: Partial<Assertion>) =>
                patch({ assertions: req.assertions.map((x) => (x.id === a.id ? { ...x, ...patchA } : x)) });
              return (
                <div key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-bg-secondary p-2">
                  <input
                    value={a.target}
                    onChange={(e) => updateA({ target: e.target.value })}
                    placeholder="status / body.data.id"
                    spellCheck={false}
                    className="h-7 w-44 rounded border border-border bg-bg-primary px-2 font-mono text-xs text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent-line"
                  />
                  <select
                    value={a.op}
                    onChange={(e) => updateA({ op: e.target.value as Assertion["op"] })}
                    className="h-7 rounded border border-border bg-bg-primary px-1.5 text-xs text-fg-primary outline-none focus:border-accent-line"
                  >
                    <option value="equals">等于</option>
                    <option value="not-equals">不等于</option>
                    <option value="contains">包含</option>
                    <option value="gt">大于</option>
                    <option value="lt">小于</option>
                    <option value="exists">存在</option>
                  </select>
                  <input
                    value={a.value}
                    onChange={(e) => updateA({ value: e.target.value })}
                    placeholder="期望值"
                    spellCheck={false}
                    className="h-7 min-w-0 flex-1 rounded border border-border bg-bg-primary px-2 font-mono text-xs text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent-line"
                  />
                  <button
                    onClick={() => patch({ assertions: req.assertions.filter((x) => x.id !== a.id) })}
                    className="text-fg-muted hover:text-del"
                    title="删除断言"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <button
              onClick={() =>
                patch({ assertions: [...req.assertions, { id: uid(), target: "", op: "equals", value: "" }] })
              }
              className="flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-accent transition-colors hover:border-accent-line hover:bg-accent-dim"
            >
              <Plus className="h-3 w-3" /> 添加断言
            </button>
          </div>
        )}

        {(tab === "pre" || tab === "post") && (
          <div className="space-y-1.5">
            <span className="text-[11px] text-fg-secondary">
              {tab === "pre" ? "前置脚本（发送前执行，可改写请求）" : "后置脚本（响应后执行，可提取变量 / 断言）"}
            </span>
            <textarea
              value={tab === "pre" ? req.preScript : req.postScript}
              onChange={(e) => patch(tab === "pre" ? { preScript: e.target.value } : { postScript: e.target.value })}
              placeholder={tab === "pre" ? '// 例：req.headers.set("X-Trace", genId())' : '// 例：assert(res.status === 200)'}
              rows={9}
              spellCheck={false}
              className="w-full resize-y rounded-md border border-border bg-[#0b0e14] px-3 py-2.5 font-mono text-xs leading-6 text-slate-200 outline-none placeholder:text-fg-muted focus:border-accent-line"
            />
          </div>
        )}
      </div>
    </div>
  );
}
