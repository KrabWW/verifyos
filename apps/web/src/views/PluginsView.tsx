import { useEffect, useRef, useState } from 'react';
import { Plug, Globe, Bug, GitPullRequest, ShieldCheck, Play, Puzzle, Plus, X, Trash2, Package, Wrench, Blocks, Code } from 'lucide-react';
import './plugins.css';

// ---------- L8：插件库（Everything is a Plugin）双 tab：插件库（新·默认）+ 工具注册表 & 审计（L 现有内容） ----------
interface ToolView { name: string; description: string; permission: string; usage24h?: number }
interface AuditView {
  ts: string; tool: string; permission: string; ok: boolean;
  via: 'auto' | 'approval' | 'denied'; durationMs: number; error?: string;
}

interface PluginRow {
  id: number; short_id: string; name: string; version: string;
  kind: 'builtin' | 'mcp' | 'custom';
  description: string | null; status: 'enabled' | 'disabled' | 'draft';
  manifest: Record<string, unknown> | null; config_schema: Record<string, unknown> | null;
  permission: 'auto' | 'ask' | 'forbidden'; source: Record<string, unknown> | null;
  created_at: string; updated_at: string;
}

const PERM_CHIP: Record<string, string> = { auto: 'green', ask: 'amber', forbidden: 'gray' };
const KIND_CHIP: Record<string, string> = { builtin: 'p-blue', mcp: 'p-indigo', custom: 'p-purple' };
const KIND_ICON: Record<string, typeof Puzzle> = { builtin: Package, mcp: Blocks, custom: Wrench };
const CONFIG_TEMPLATE = `{
  "webhook_url": { "type": "string", "title": "群机器人 Webhook 地址", "required": true },
  "notify_on": { "type": "string", "title": "通知时机", "enum": ["verify_done", "issue_escalated"], "default": "verify_done" }
}`;

/* ============ Tab 1：插件库 ============ */
function PluginLibrary() {
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [detail, setDetail] = useState<PluginRow | null>(null);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  // U30：测试面分类筛选（manifest.category——「不同人测试不同面」的市场视图）
  const [faceFilter, setFaceFilter] = useState<string>('全部');
  const FACES = ['全部', '数据面', '接口面', 'UI 面', '协作面', '交付面'];
  // N 系：已加载代码插件运行时状态（shortId → 工具清单），GET /api/plugin-runtime 观测
  const [runtime, setRuntime] = useState<Record<string, string[]>>({});

  // 创建向导表单
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fPerm, setFPerm] = useState<'auto' | 'ask' | 'forbidden'>('ask');
  const [fSchema, setFSchema] = useState(CONFIG_TEMPLATE);
  const [fEntry, setFEntry] = useState('');
  const [fErr, setFErr] = useState('');

  const load = () => fetch('/api/plugins').then((r) => r.json()).then((d) => setPlugins(d.plugins ?? [])).catch(() => undefined);
  // N 系：拉取已加载插件清单（shortId → tools），驱动卡片「已加载 · N 工具」chip
  const loadRuntime = () => fetch('/api/plugin-runtime').then((r) => r.json()).then((d) => {
    const map: Record<string, string[]> = {};
    for (const pl of (d.plugins ?? []) as Array<{ shortId: string; tools?: string[] }>) map[pl.shortId] = pl.tools ?? [];
    setRuntime(map);
  }).catch(() => undefined);
  useEffect(() => { load(); loadRuntime(); }, []);

  // M5：导入（他人分享的 JSON）与探活（基座连通调用）
  const importRef = useRef<HTMLInputElement>(null);
  const importPlugin = async (file: File | null) => {
    if (!file) return;
    try {
      const pkg = JSON.parse(await file.text());
      const r = await fetch('/api/plugins/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pkg) });
      const d = await r.json();
      if (d.ok) { setMsg(`✓ 已导入插件 ${d.shortId}（${d.name}）——draft 态，启用后生效`); load(); }
      else setMsg(`导入失败：${d.message ?? '未知'}`);
    } catch { setMsg('导入失败：文件不是合法的插件 JSON'); }
  };
  const probePlugin = async (p: PluginRow) => {
    setBusy(`${p.short_id}:probe`);
    try {
      const d = await (await fetch(`/api/plugins/${p.short_id}/probe`, { method: 'POST' })).json();
      setMsg(d.ok ? `✓ 探活成功（经 ${d.via} 基座）：${JSON.stringify(d.result).slice(0, 80)}` : `✕ 探活失败：${d.reason ?? '未知'}`);
    } catch { setMsg('探活失败（网络）'); }
    finally { setBusy(''); }
  };
  // N 系：加载/卸载代码插件（激活/回滚 activate 注册的工具），结果写进现有 msg 提示条
  const loadPlugin = async (p: PluginRow) => {
    setBusy(`${p.short_id}:load`);
    try {
      const d = await (await fetch(`/api/plugin-runtime/${p.short_id}/load`, { method: 'POST' })).json();
      if (d.ok) {
        const tools = (d.tools ?? []) as string[];
        setMsg(`✓ 已加载代码插件 ${p.short_id}，注册 ${tools.length} 个工具：${tools.length ? tools.join(', ') : '（无工具注册）'}`);
        loadRuntime();
      } else setMsg(`✕ 加载失败：${d.error ?? '未知'}`);
    } catch { setMsg('加载失败（网络）'); }
    finally { setBusy(''); }
  };
  const unloadPlugin = async (p: PluginRow) => {
    setBusy(`${p.short_id}:unload`);
    try {
      const d = await (await fetch(`/api/plugin-runtime/${p.short_id}/unload`, { method: 'POST' })).json();
      setMsg(d.ok ? `✓ 已卸载代码插件 ${p.short_id}（工具已回滚）` : `✕ 卸载失败：${d.error ?? '未知'}`);
      loadRuntime();
    } catch { setMsg('卸载失败（网络）'); }
    finally { setBusy(''); }
  };

  const toggleStatus = async (p: PluginRow) => {
    const next = p.status === 'enabled' ? 'disabled' : 'enabled';
    setBusy(p.short_id);
    await fetch(`/api/plugins/${p.short_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }).catch(() => undefined);
    setBusy('');
    load();
    if (detail?.short_id === p.short_id) setDetail({ ...p, status: next });
  };

  const createPlugin = async () => {
    setFErr('');
    if (!fName.trim()) { setFErr('插件名称必填'); return; }
    let schema: unknown;
    try { schema = fSchema.trim() ? JSON.parse(fSchema) : {}; } catch { setFErr('Config Schema 不是合法 JSON'); return; }
    try {
      const body: Record<string, unknown> = { name: fName.trim(), description: fDesc.trim(), permission: fPerm, config_schema: schema };
      // N 系：填了入口文件路径则写入 manifest.entry={file}，生成代码插件（否则仍为声明式 custom）
      if (fEntry.trim()) body.manifest = { entry: { file: fEntry.trim() } };
      const r = await fetch('/api/plugins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setFErr(d.message ?? '创建失败'); return; }
      setWizard(false);
      setFName(''); setFDesc(''); setFPerm('ask'); setFSchema(CONFIG_TEMPLATE); setFEntry('');
      load();
      setDetail(d); // 落库 draft → 直接开详情抽屉
    } catch { setFErr('创建失败（网络）'); }
  };

  const removePlugin = async (p: PluginRow) => {
    if (!window.confirm(`删除插件「${p.name}」？（仅 custom 可删，不可恢复）`)) return;
    await fetch(`/api/plugins/${p.short_id}`, { method: 'DELETE' }).catch(() => undefined);
    setDetail(null);
    load();
  };

  const statusChip = (s: PluginRow['status']) =>
    s === 'enabled' ? <span className="chip p-green">enabled</span>
      : s === 'draft' ? <span className="chip p-draft">draft</span>
      : <span className="chip p-gray">disabled</span>;

  // N 系：代码插件判定——manifest.entry.file 存在即视为 DSH 进程内代码插件（区别于声明式插件）
  const entryOf = (p: PluginRow): string => {
    const m = (p.manifest ?? {}) as Record<string, unknown>;
    const entry = (m.entry ?? {}) as { file?: unknown };
    return typeof entry.file === 'string' ? entry.file : '';
  };
  const isCode = (p: PluginRow): boolean => entryOf(p).length > 0;

  const faceOf = (p: PluginRow) => String(((p.manifest ?? {}) as Record<string, unknown>).category ?? '其他');
  const shown = plugins.filter((p) => faceFilter === '全部' || faceOf(p) === faceFilter);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span className="chip p-blue">builtin {plugins.filter((p) => p.kind === 'builtin').length}</span>
        <span className="chip p-indigo">mcp {plugins.filter((p) => p.kind === 'mcp').length}</span>
        <span className="chip p-purple">custom {plugins.filter((p) => p.kind === 'custom').length}</span>
        <span className="sp" />
        <button className="btn primary" onClick={() => setWizard(true)}><Plus size={13} /> 创建插件</button>
        <button className="btn" onClick={() => importRef.current?.click()} title="导入他人分享的插件 JSON 文件（共创）"><Plus size={13} /> 导入插件</button>
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { void importPlugin(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <button className="btn" onClick={load}>刷新</button>
      </div>
      {msg && <div className="hint" style={{ margin: '4px 0', padding: '5px 10px', background: '#fcfcfd', border: '1px solid var(--border)', borderRadius: 6, wordBreak: 'break-all' }}>{msg}</div>}
      {/* U30：测试面筛选——「不同人测试不同面」的市场视图入口 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', margin: '4px 0 8px' }}>
        <span className="hint" style={{ marginTop: 0 }}>测试面：</span>
        {FACES.map((f) => (
          <span
            key={f}
            className={`schip ${f === '全部' ? 's-low' : 's-discovered'}`}
            style={{ cursor: 'pointer', opacity: faceFilter === f ? 1 : 0.5, outline: faceFilter === f ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}
            onClick={() => setFaceFilter(f)}
          >{f === '全部' ? null : <i />}{f}{f !== '全部' ? ` ${plugins.filter((p) => faceOf(p) === f).length}` : ''}</span>
        ))}
      </div>
      <div className="plg-grid">
        {shown.length === 0 && <p className="hint">该测试面暂无插件——去「创建插件」或导入他人的分享</p>}
        {shown.map((p) => {
          const Icon = KIND_ICON[p.kind] ?? Puzzle;
          return (
            <div key={p.short_id} className="plg-card" onClick={() => setDetail(p)}>
              <div className="plg-card-head">
                <Icon size={14} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                <b>{p.name}</b>
                <span className="ver">v{p.version}</span>
                {isCode(p) && <span className="chip p-code" title={`代码插件 · entry.file：${entryOf(p)}`}>代码</span>}
              </div>
              <div className="plg-card-desc" title={p.description ?? ''}>{p.description ?? '—'}</div>
              <div className="plg-card-foot">
                <span className={`chip ${KIND_CHIP[p.kind]}`}>{p.kind}</span>
                <span className="chip">{faceOf(p)}</span>
                <span className={`chip p-${PERM_CHIP[p.permission] ?? 'gray'}`}>{p.permission}</span>
                {/* N 系：已加载的代码插件显示「已加载 · N 工具」绿色 chip，卸载后消失 */}
                {isCode(p) && runtime[p.short_id] && (
                  <span className="chip p-green">已加载 · {runtime[p.short_id].length} 工具</span>
                )}
                <span className="grow" />
                {/* N 系：代码插件加载/卸载按钮（iconbtn），调 plugin-runtime 端点 */}
                {isCode(p) && (
                  <>
                    <button className="iconbtn" title="加载代码插件（activate 注册工具）" disabled={busy === `${p.short_id}:load`} onClick={(e) => { e.stopPropagation(); void loadPlugin(p); }}>{busy === `${p.short_id}:load` ? '…' : '加载'}</button>
                    {runtime[p.short_id] && (
                      <button className="iconbtn" title="卸载代码插件（onDispose + 回滚已注册工具）" disabled={busy === `${p.short_id}:unload`} onClick={(e) => { e.stopPropagation(); void unloadPlugin(p); }}>{busy === `${p.short_id}:unload` ? '…' : '卸载'}</button>
                    )}
                  </>
                )}
                {p.kind !== 'builtin' && (
                  <>
                    <button className="iconbtn" title="导出插件 JSON（分享/共创，敏感字段自动脱敏）" onClick={(e) => { e.stopPropagation(); window.location.href = `/api/plugins/${p.short_id}/export`; }}>导出</button>
                    {/* U31：探活仅 db 类基座支持（SELECT 1 连通）——对不支持的插件隐藏按钮，避免误导性失败 */}
                    {(() => {
                      const m = (p.manifest ?? {}) as Record<string, unknown>;
                      const tools = (m.tools ?? []) as Array<{ implements?: string; name?: string }>;
                      const t0 = tools[0];
                      const probeable = t0 && (t0.implements === 'db.query' || (!t0.implements && t0.name === 'db.query'));
                      return probeable ? (
                        <button className="iconbtn" title="探活：对插件声明的工具做一次基座连通调用（SELECT 1）" disabled={busy === `${p.short_id}:probe`} onClick={(e) => { e.stopPropagation(); void probePlugin(p); }}>探活</button>
                      ) : null;
                    })()}
                  </>
                )}
                {statusChip(p.status)}
                <span
                  className={`switch ${p.status === 'enabled' ? 'on' : ''} ${busy === p.short_id ? 'dim' : ''}`}
                  title="启用 / 停用"
                  onClick={(e) => { e.stopPropagation(); void toggleStatus(p); }}
                >
                  <i />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 详情抽屉（复用 qa-drawer 样式族） */}
      {detail && (
        <>
          <div className="qa-drawer-mask" onClick={() => setDetail(null)} />
          <div className="qa-drawer" style={{ width: 420 }}>
            <div className="qa-drawer-head">
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>{detail.name}</b>
                <div className="chipsrow" style={{ margin: '5px 0 0' }}>
                  <span className={`chip ${KIND_CHIP[detail.kind]}`}>{detail.kind}</span>
                  <span className={`chip p-${PERM_CHIP[detail.permission] ?? 'gray'}`}>{detail.permission}</span>
                  {statusChip(detail.status)}
                  <span className="chip" style={{ fontFamily: 'var(--mono)' }}>{detail.short_id}</span>
                </div>
              </div>
              <button className="btn" onClick={() => setDetail(null)}><X size={13} /></button>
            </div>
            <div className="qa-drawer-body">
              {detail.description && <p className="plg-meta" style={{ margin: '0 0 10px' }}>{detail.description}</p>}
              {/* N 系：代码插件详情——入口文件路径 + 已加载工具清单（mono 展示） */}
              {isCode(detail) && (
                <>
                  <h4 style={{ margin: '0 0 2px' }}>ENTRY FILE（代码插件）</h4>
                  <div className="plg-code">{entryOf(detail)}</div>
                  <h4 style={{ margin: '0 0 2px' }}>已加载工具（runtime）</h4>
                  <div className="plg-code">{(runtime[detail.short_id] ?? []).length ? (runtime[detail.short_id] ?? []).join('\n') : '（未加载）'}</div>
                </>
              )}
              <h4 style={{ margin: '0 0 2px' }}>MANIFEST</h4>
              <div className="plg-code">{JSON.stringify(detail.manifest ?? {}, null, 2)}</div>
              <h4 style={{ margin: '0 0 2px' }}>CONFIG SCHEMA</h4>
              <div className="plg-code">{JSON.stringify(detail.config_schema ?? {}, null, 2)}</div>
              <h4 style={{ margin: '0 0 2px' }}>SOURCE</h4>
              <div className="plg-code">{JSON.stringify(detail.source ?? {}, null, 2)}</div>
              <h4 style={{ margin: '0 0 2px' }}>META</h4>
              <div className="kv plg-meta"><span>创建时间</span><b className="mono">{String(detail.created_at ?? '').slice(0, 19).replace('T', ' ')}</b></div>
              <div className="kv plg-meta"><span>更新时间</span><b className="mono">{String(detail.updated_at ?? '').slice(0, 19).replace('T', ' ')}</b></div>
            </div>
            <div className="qa-drawer-foot">
              <button
                className={`btn ${detail.status !== 'enabled' ? 'primary' : ''}`}
                onClick={() => toggleStatus(detail)}
              >
                {detail.status === 'enabled' ? '停用' : '启用'}
              </button>
              {detail.kind === 'custom' && (
                <button className="btn" style={{ color: 'var(--red)' }} onClick={() => removePlugin(detail)}><Trash2 size={13} /> 删除</button>
              )}
              <span className="sp" />
              <button className="btn ghost" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </>
      )}

      {/* 创建向导弹窗 */}
      {wizard && (
        <div className="plg-modal-mask" onClick={() => setWizard(false)}>
          <div className="plg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plg-modal-head">
              <b><Puzzle size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />创建插件（custom · 落库为 draft）</b>
              <button className="btn" onClick={() => setWizard(false)}><X size={13} /></button>
            </div>
            <div className="plg-modal-body">
              <div className="plg-group">
                <div className="plg-label"><Puzzle size={11} /><span className="ln">基本信息</span></div>
                <input className="plg-input" placeholder="插件名称，如：企业微信通知插件" value={fName} onChange={(e) => setFName(e.target.value)} style={{ marginBottom: 7 }} />
                <input className="plg-input" placeholder="一句话描述：这个插件给 Agent 增加什么能力？" value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
              </div>
              <div className="plg-group">
                <div className="plg-label"><ShieldCheck size={11} /><span className="ln">能力与权限（kind 固定为 custom；权限三档）</span></div>
                <div className="plg-perm-opts">
                  <span className={`prtab ${fPerm === 'auto' ? 'on' : ''}`} onClick={() => setFPerm('auto')}>auto · 自动执行</span>
                  <span className={`prtab ${fPerm === 'ask' ? 'on' : ''}`} onClick={() => setFPerm('ask')}>ask · 弹卡批准</span>
                  <span className={`prtab ${fPerm === 'forbidden' ? 'on' : ''}`} onClick={() => setFPerm('forbidden')}>forbidden · 禁用</span>
                </div>
              </div>
              <div className="plg-group">
                <div className="plg-label"><Wrench size={11} /><span className="ln">Config Schema（JSON——运行时配置项定义）</span></div>
                <textarea className={`plg-input plg-json`} value={fSchema} onChange={(e) => setFSchema(e.target.value)} spellCheck={false} />
              </div>
              {/* N 系：代码插件（可选）——入口文件路径 entry.file，填了则写入 manifest.entry={file} */}
              <div className="plg-group">
                <div className="plg-label"><Code size={11} /><span className="ln">代码插件（可选）——入口文件路径 entry.file</span></div>
                <input className="plg-input" placeholder="留空则为声明式插件；填写 TS 文件路径（默认导出 async activate(ctx)）则生成代码插件" value={fEntry} onChange={(e) => setFEntry(e.target.value)} />
                <p className="hint" style={{ margin: '6px 0 0' }}>代码插件在 DSH 进程内运行：kind 仍为 custom，创建时写入 manifest.entry = {'{ file: 路径 }'}；加载后 activate 注册工具，卸载即回滚。</p>
              </div>
              {fErr && <p className="hint" style={{ color: 'var(--red)', marginTop: 0 }}>{fErr}</p>}
              <p className="hint" style={{ marginTop: 0 }}>创建后可在详情抽屉里「启用」；创建提示词模板见 docs/PLUGIN_GUIDE.md —— 也可以直接让 AI 助手帮你生成并注册插件。</p>
            </div>
            <div className="plg-modal-foot">
              <button className="btn" onClick={() => setWizard(false)}>取消</button>
              <button className="btn primary" onClick={createPlugin}>创建（draft）</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============ Tab 2：工具注册表 & 审计（原内容整体保留） ============ */
function ToolsRegistryTab() {
  const [tools, setTools] = useState<ToolView[]>([]);
  const [audit, setAudit] = useState<AuditView[]>([]);
  const [auditSrc, setAuditSrc] = useState('');
  const [invoking, setInvoking] = useState('');
  const [msg, setMsg] = useState('');

  /** auto 档工具的试运行默认参数（http 打自身 health；db.query 最小查询） */
  const TOOL_DEMO_ARGS: Record<string, Record<string, unknown>> = {
    http: { url: 'http://127.0.0.1:8080/api/health', method: 'GET' },
    'db.query': { sql: 'SELECT 1 AS ok' },
  };

  const loadTools = () => fetch('/api/tools').then((r) => r.json()).then((d) => setTools(d.tools ?? [])).catch(() => undefined);
  const loadAudit = () => fetch('/api/tools/audit').then((r) => r.json()).then((d) => { setAudit(d.items ?? []); setAuditSrc(d.source ?? ''); }).catch(() => undefined);
  useEffect(() => { loadTools(); loadAudit(); }, []);

  const tryRun = async (name: string) => {
    setInvoking(name);
    setMsg('');
    try {
      const r = await fetch('/api/tools/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, args: TOOL_DEMO_ARGS[name] ?? {} }),
      });
      const d = await r.json();
      if (!r.ok) setMsg(d.message ?? '调用失败');
      else setMsg(`✓ ${name} 执行${d.ok ? '成功' : '返回失败'}（已入审计）`);
      loadAudit();
    } catch {
      setMsg('调用失败（网络）');
    } finally {
      setInvoking('');
    }
  };

  const viaCls = (v: string) => (v === 'auto' ? 'ok' : v === 'approval' ? 'warn' : 'fail');

  return (
    <div className="pageview">
      {/* 上：左工具注册表 + 右连接器/权限 */}
      <div className="pluggrid">
        <div className="sumcard" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <h4 style={{ margin: 0 }}><Plug size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />内置工具注册表（ToolRegistry · {tools.length}）</h4>
            <span className="sp" /><button className="btn" onClick={loadTools}>刷新</button>
          </div>
          <table className="tbl">
            <tr><th style={{ width: 96 }}>工具</th><th>说明</th><th style={{ width: 84 }}>权限</th><th style={{ width: 70 }}>调用 24h</th><th style={{ width: 88 }}>试运行</th></tr>
            {tools.length === 0 && <tr><td colSpan={5} className="dim">后端未就绪</td></tr>}
            {tools.map((t) => (
              <tr key={t.name}>
                <td><b className="mono" style={{ fontSize: 12 }}>{t.name}</b></td>
                <td className="hint" style={{ marginTop: 0 }}>{t.description}</td>
                <td><span className={`chip p-${PERM_CHIP[t.permission] ?? 'gray'}`}>{t.permission}</span></td>
                <td className="mono" style={{ fontSize: 11.5, color: t.usage24h ? 'var(--text)' : 'var(--muted)' }}>{t.usage24h ?? 0}</td>
                <td>
                  {t.permission === 'auto' ? (
                    <button className="btn" style={{ fontSize: 10.5 }} disabled={invoking === t.name} onClick={() => tryRun(t.name)}>
                      {invoking === t.name ? '…' : <><Play size={10} /> 试运行</>}
                    </button>
                  ) : (
                    <span className="hint" style={{ marginTop: 0 }} title="ask 工具须经 Run 内人工批准（WAITING_FOR_APPROVAL）；forbidden 阶段内禁用">需批准/禁用</span>
                  )}
                </td>
              </tr>
            ))}
          </table>
          {msg && <div className="dim" style={{ padding: '7px 14px', borderTop: '1px dashed #f1f1f3' }}>{msg}</div>}
        </div>

        <div>
          {/* MCP 连接器（占位语义——F15 后续接 McpToolAdapter） */}
          <div className="sumcard">
            <h4 style={{ marginTop: 0 }}><Plug size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />MCP 连接器 <span className="chip p-green" style={{ marginLeft: 6 }}>3 已连接</span></h4>
            <div className="docrow"><span className="ic"><Globe size={13} /></span><div><b>内部 CMDB 查询</b><span>service-gw · SSE · 4 个工具</span></div><span className="chip p-green">● 健康</span></div>
            <div className="docrow"><span className="ic"><Bug size={13} /></span><div><b>禅道 Issue 工具</b><span>stdio · 6 个工具 · 项目内只读</span></div><span className="chip p-green">● 健康</span></div>
            <div className="docrow"><span className="ic"><GitPullRequest size={13} /></span><div><b>GitLab MR 工具</b><span>stdio · 5 个工具 · 评论回写</span></div><span className="chip p-green">● 健康</span></div>
            <div
              className="docrow add"
              onClick={() => window.alert('添加 MCP Server（占位）：名称 / 传输（stdio·SSE）/ 命令或 URL / 凭据（走凭据体系 AES-256 加密）。外部 server 经 McpToolAdapter 批量转为注册表条目，与内置工具同一权限模型。')}
            >
              ＋ 添加连接器（自动发现其工具并纳入权限管理）
            </div>
            <p className="hint">外部 MCP server 经 McpToolAdapter 批量转为注册表条目，与内置工具同一调用路径、同一权限模型。</p>
          </div>

          {/* 权限三档（E1 门控语义） */}
          <div className="sumcard">
            <h4 style={{ marginTop: 0 }}><ShieldCheck size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />权限策略（三档）</h4>
            <div className="kv"><span><span className="chip p-green">auto</span></span><b>自动执行 · 结果入证据链</b></div>
            <div className="kv"><span><span className="chip p-amber">ask</span></span><b>执行前弹卡 · WAITING_FOR_APPROVAL</b></div>
            <div className="kv"><span><span className="chip p-gray">forbidden</span></span><b>阶段内禁用（如生产库写入）</b></div>
            <p className="hint">权限调整即时生效并记录审计；凭据复用全局凭据体系（AES-256-GCM 加密）。</p>
          </div>
        </div>
      </div>

      {/* 下：调用审计（audit_log 表真数据） */}
      <div className="sumcard" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <h4 style={{ margin: 0 }}>调用审计（最近 {audit.length} 条{auditSrc === 'db' ? ' · audit_log 表' : auditSrc ? ' · 内存态' : ''}）</h4>
          <span className="sp" />
          <span className="chip p-green">auto {audit.filter((a) => a.via === 'auto').length}</span>
          <span className="chip p-amber" style={{ marginLeft: 5 }}>approval {audit.filter((a) => a.via === 'approval').length}</span>
          <span className="chip p-gray" style={{ marginLeft: 5 }}>denied {audit.filter((a) => a.via === 'denied').length}</span>
          <button className="btn" style={{ marginLeft: 8 }} onClick={loadAudit}>刷新</button>
        </div>
        <table className="tbl">
          <tr><th>时间</th><th>工具</th><th>权限</th><th>via</th><th>结果</th><th>耗时</th><th>说明</th></tr>
          {audit.length === 0 && (
            <tr><td colSpan={7} className="dim">暂无调用 —— 点上方「试运行」产生真实审计记录（via: auto / approval / denied）</td></tr>
          )}
          {audit.map((a, i) => (
            <tr key={i}>
              <td className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{String(a.ts ?? '').slice(0, 19).replace('T', ' ')}</td>
              <td><b className="mono" style={{ fontSize: 12 }}>{a.tool}</b></td>
              <td><span className={`chip p-${PERM_CHIP[a.permission] ?? 'gray'}`}>{a.permission}</span></td>
              <td><span className={`dot ${viaCls(a.via)}`} style={{ width: 16, height: 16, fontSize: 8 }}>{a.via === 'auto' ? 'A' : a.via === 'approval' ? '✓' : '✕'}</span> {a.via}</td>
              <td>{a.ok ? <span className="chip p-green">ok</span> : <span className="chip p-red">fail</span>}</td>
              <td className="mono">{a.durationMs}ms</td>
              <td className="hint" style={{ marginTop: 0, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.error ?? ''}>{a.error ?? '—'}</td>
            </tr>
          ))}
        </table>
      </div>

      <p className="hint" style={{ marginTop: 2 }}>
        设计判断：<b>要插件化，但不做插件市场</b> —— Agent 执行本质是「规划 → 调工具 → 观察」循环，数据库查询、代码查看、视觉兜底都是往同一个注册表加条目；外部能力走 MCP 标准协议，不发明私有插件体系（PRD §8.4）。
      </p>
    </div>
  );
}

/* ============ 双 tab 容器 ============ */
export function PluginsView() {
  const [tab, setTab] = useState<'library' | 'registry'>('library');
  return (
    <div className="pageview">
      <div className="plg-tabs">
        <span className={`prtab ${tab === 'library' ? 'on' : ''}`} onClick={() => setTab('library')}><Puzzle size={12} /> 插件库 <b>{'Everything is a Plugin'}</b></span>
        <span className={`prtab ${tab === 'registry' ? 'on' : ''}`} onClick={() => setTab('registry')}><Wrench size={12} /> 工具注册表 &amp; 审计</span>
      </div>
      {tab === 'library' ? <PluginLibrary /> : <ToolsRegistryTab />}
    </div>
  );
}
