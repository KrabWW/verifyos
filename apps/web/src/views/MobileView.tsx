import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { Smartphone } from 'lucide-react';
import { VerdictIcon, verdictMeta, type RecentRun } from '../shared';

// ---------- 移动测试（移动 Web 层：Playwright 设备模拟；原生 App 为 Phase 5+） ----------
export function MobileView() {
  const [device, setDevice] = useState('iPhone 13');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const DEVICES = ['iPhone 13', 'Pixel 9 Pro', 'iPhone SE', 'iPad Mini'];

  // H05：socket 兜底复位——run.completed/run.done 到达时强制解除 busy（防 fetch 路径异常导致整屏卡死），并刷新 Run 列表
  useEffect(() => {
    const s = io({ path: '/ws' });
    const reset = () => {
      setBusy(false);
      window.dispatchEvent(new CustomEvent('mobile:runs-changed'));
    };
    s.on('run.completed', reset);
    s.on('run.done', reset);
    return () => {
      s.disconnect();
    };
  }, []);

  // H05：busy 复位用 try/finally 兜底——任何失败路径（网络异常 / 非 2xx / JSON 解析失败）都保证按钮恢复可点
  const start = async () => {
    setBusy(true);
    setErr('');
    setMsg('触发中…');
    try {
      const r = await fetch('/api/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { runId?: string };
      setMsg(`✓ 已触发（${device} 视口 + UA + 触控模拟）· Run: ${d.runId}——下方点开 Run 行看完整结果页`);
      setTimeout(() => window.dispatchEvent(new CustomEvent('mobile:runs-changed')), 3500);
    } catch {
      setMsg('');
      setErr(`触发失败（${device}）：网络或服务异常，请稍后重试——按钮已恢复可点`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pageview">
      <div className="sumcard">
        <h4><Smartphone size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} /> 移动测试（移动 Web 层 · 设备模拟）</h4>
        <p className="dim" style={{ fontSize: 12, lineHeight: 1.9, margin: '4px 0 10px' }}>
          与 Web 同一套执行记录/证据/UNKNOWN 语义——只是 viewport/UA/触控不同（Playwright 设备模拟）。
          原生 App（Android/iOS）走 Maestro/Appium，Phase 5+ 接入。
        </p>
        <div className="formrow">
          <label>设备</label>
          <select className="inp" value={device} onChange={(e) => setDevice(e.target.value)} style={{ maxWidth: 220 }}>
            {DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button className="btn primary" onClick={start} disabled={busy} style={{ marginTop: 6 }}>
          {busy ? '执行中…' : <>以 {device} 跑一遍验证</>}
        </button>
        {msg && <p className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>{msg}</p>}
        {err && <p style={{ fontSize: 11.5, marginTop: 8, color: '#e5484d', fontWeight: 600 }}>⚠ {err}</p>}
      </div>
      <MobileRuns />
      <div className="sumcard">
        <h4>当前设备环境</h4>
        <div className="kv"><span>Mobile App</span><b>Default（WebView 模拟）</b></div>
        <div className="kv"><span>Device</span><b>{device}</b></div>
        <div className="kv"><span>Platform</span><b>Mobile Web</b></div>
        <div className="kv"><span>驱动</span><b>Stagehand × glm-4.5v（同 Web）</b></div>
        <div className="kv"><span>证据</span><b>截图 / trace / HAR（与 Web 同构）</b></div>
      </div>
    </div>
  );
}

/** ---------- G15：Run 列表 + 展开完整结果页 ---------- */
function MobileRuns() {
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/overview')
        .then((r) => r.json())
        .then((d: { recent?: RecentRun[] }) => {
          // 移动 Run（device 非空）排前，其余按时间——都可展开看结果页
          const recent = d.recent ?? [];
          const sorted = [...recent.sort((a, b) => Number(Boolean(b.device)) - Number(Boolean(a.device)))];
          setRuns(sorted);
        })
        .catch(() => setRuns([]));
    load();
    window.addEventListener('mobile:runs-changed', load);
    return () => window.removeEventListener('mobile:runs-changed', load);
  }, []);

  if (runs === null) return <div className="sumcard"><p className="dim" style={{ fontSize: 11.5 }}>加载 Run 列表…</p></div>;
  if (runs.length === 0) {
    return (
      <div className="sumcard">
        <p className="dim" style={{ fontSize: 11.5 }}>暂无 Run —— 选好设备点「以 … 跑一遍验证」</p>
      </div>
    );
  }
  return (
    <div className="sumcard">
      <h4>Run 结果（点击行展开详情）</h4>
      <div className="mstat-runlist">
        {runs.map((r) => {
          const vm = verdictMeta(r.verdict);
          const open = selId === r.runId;
          return (
            <div key={r.runId} className={`mstat-runcol ${open ? 'open' : ''}`}>
              <button className="mstat-runrow" onClick={() => setSelId(open ? null : r.runId)}>
                <span className={`vtext ${vm.cls}`}><VerdictIcon v={r.verdict} size={13} /></span>
                <span className="mono" style={{ fontSize: 10.5 }}>{r.runId}</span>
                {r.device && <span className="chip">{r.device}</span>}
                <span className="mstat-runrow-sub dim">
                  {r.verShortId ? `${r.verShortId} · ` : ''}{(r.durationMs / 1000).toFixed(1)}s
                </span>
                <span className="mstat-caret">{open ? '▾' : '▸'}</span>
              </button>
              {open && <MobileRunDetail runId={r.runId} device={r.device ?? null} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ---------- 展开态：Steps / 设备 / Outputs / 元信息 / Before-After / 日志 ---------- */
type RunEventLike = {
  type: string; runId?: string; ts?: string; stepId?: string; kind?: string;
  index?: number; title?: string; text?: string;
  tool?: string; action?: string; args?: Record<string, unknown>;
  ok?: boolean; detail?: string; durationMs?: number;
  verdict?: string; cacheHit?: boolean; evidence?: string;
};
type OutputsResp = { found: boolean; items?: Array<{ key: string; value: string; created_at?: string }> };
type MetaResp = {
  found: boolean; device?: string | null; platform?: string; ua?: string | null;
  classification?: string | null;
  recentRuns?: Array<{ runId: string; verdict: string | null; createdAt: string | Date }>;
};

function MobileRunDetail({ runId, device }: { runId: string; device: string | null }) {
  const [events, setEvents] = useState<RunEventLike[] | null>(null);
  const [outputs, setOutputs] = useState<OutputsResp | null>(null);
  const [meta, setMeta] = useState<MetaResp | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    const evs = fetch(`/api/runs/${runId}/events`).then((r) => r.json()).catch(() => null);
    const outs = fetch(`/api/mobile/runs/${runId}/outputs`).then((r) => r.json()).catch(() => null);
    const mta = fetch(`/api/mobile/runs/${runId}/meta`).then((r) => r.json()).catch(() => null);
    Promise.all([evs, outs, mta]).then(([evs, outs, mta]) => {
      if (!alive) return;
      const d = evs as { found?: boolean; events?: RunEventLike[] } | null;
      setEvents(d?.found ? (d.events ?? []) : []);
      setOutputs((outs as OutputsResp) ?? { found: false, items: [] });
      setMeta((mta as MetaResp) ?? { found: false });
    });
    return () => { alive = false; };
  }, [runId]);

  // 按步骤聚合事件
  const steps = useMemo(() => {
    const out: Array<{ stepId: string; title: string; kind: string; index: number; rows: RunEventLike[]; verdict?: string }> = [];
    for (const e of events ?? []) {
      if (e.type === 'step.started') {
        out.push({ stepId: e.stepId!, title: e.title ?? '未命名步骤', kind: e.kind ?? 'ai', index: e.index ?? out.length, rows: [], verdict: undefined });
      } else if (e.type === 'step.completed' && out.length > 0) {
        out[out.length - 1].verdict = e.verdict;
      } else if (e.type !== 'run.started' && e.type !== 'run.completed' && out.length > 0) {
        out[out.length - 1].rows.push(e);
      }
    }
    return out;
  }, [events]);

  // 日志三 tab：evidence 事件按 kind 归类
  const logs = useMemo(() => {
    const consoleLines: RunEventLike[] = [];
    const networkLines: RunEventLike[] = [];
    const logLines: RunEventLike[] = [];
    for (const e of events ?? []) {
      if (e.type !== 'step.evidence') continue;
      if (e.kind === 'console') consoleLines.push(e);
      else if (e.kind === 'network') networkLines.push(e);
      else logLines.push(e);
    }
    return { consoleLines, networkLines, logLines };
  }, [events]);

  const verdictOfRun = (events ?? []).find((e) => e.type === 'run.completed')?.verdict;

  return (
    <div className="mstat-detail">
      {toast && <div className="composer-toast">{toast}</div>}

      {/* Steps 厚步骤卡 */}
      <div className="mstat-card">
        <h5>执行步骤</h5>
        {events === null && <p className="dim" style={{ fontSize: 11 }}>加载事件流…</p>}
        {events !== null && steps.length === 0 && (
          <p className="dim" style={{ fontSize: 11 }}>暂无步骤事件——该 Run 的事件流可能尚未落库。</p>
        )}
        {steps.map((s) => {
          const dot = s.verdict ? verdictMeta(s.verdict) : { dot: '', cls: 'idle' };
          const failed = s.verdict === 'fail';
          return (
            <div key={s.stepId} className={`mstat-step ${failed ? 'failed' : ''}`}>
              <div className="mstat-step-head">
                <span className={`vtext ${dot.cls}`}><VerdictIcon v={s.verdict} size={13} /></span>
                <b>{s.index + 1}. {s.title}</b>
                <span className="chip">{s.kind}</span>
                {s.rows[0]?.ts && <span className="mstat-ts mono">{new Date(s.rows[0].ts).toLocaleTimeString()}</span>}
              </div>
              <div className="mstat-step-body">
                {s.rows.map((e, j) => {
                  if (e.type === 'step.thinking') {
                    return <div key={j} className="mstat-think">💭 {e.text}</div>;
                  }
                  if (e.type === 'step.action') {
                    return (
                      <div key={j} className="mstat-actrow">
                        <span className="mono mstat-act">{e.tool}/{e.action}</span>
                        {e.args && <span className="mstat-args mono">{JSON.stringify(e.args).slice(0, 90)}</span>}
                      </div>
                    );
                  }
                  if (e.type === 'step.observation') {
                    return (
                      <div key={j} className={`mstat-obs ${e.ok === false ? 'bad' : ''}`}>
                        <span>{e.ok === false ? '✕' : '·'}</span>
                        <span>{e.detail}</span>
                        {e.durationMs != null && <span className="mono mstat-ts">{e.durationMs}ms</span>}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mstat-grid">
        {/* 设备信息卡 */}
        <div className="mstat-card">
          <h5>设备信息</h5>
          {meta?.found === false && <p className="dim" style={{ fontSize: 11 }}>设备元数据不可用。</p>}
          {meta?.found === true && (
            <>
              <div className="kv"><span>Device</span><b>{meta.device ?? device ?? '默认视口'}</b></div>
              <div className="kv"><span>Platform</span><b>{meta.platform ?? 'web'}</b></div>
              <div className="kv"><span>UA</span><b className="mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>{meta.ua ?? '—（Playwright 设备描述未落库）'}</b></div>
            </>
          )}
          {meta === null && <p className="dim" style={{ fontSize: 11 }}>加载中…</p>}
        </div>

        {/* Output values 卡 */}
        <div className="mstat-card">
          <h5>Output Values</h5>
          {outputs === null && <p className="dim" style={{ fontSize: 11 }}>加载中…</p>}
          {outputs?.items?.length === 0 && (
            <p className="dim" style={{ fontSize: 11 }}>该 Run 没有显式保存的 Output Values（引擎未调用 save_output）。</p>
          )}
          {(outputs?.items?.length ?? 0) > 0 && (
            <div className="kvcol">
              {(outputs?.items ?? []).map((o) => (
                <div key={o.key} className="kv"><span className="mono">{o.key}</span><b className="mono" style={{ fontSize: 10.5, wordBreak: 'break-all' }}>{o.value}</b></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 结果元信息卡 */}
      <div className="mstat-card">
        <h5>结果元信息</h5>
        <div className="mstat-grid">
          <div>
            <div className="kv"><span>Run</span><b className="mono" style={{ fontSize: 11 }}>{runId}</b></div>
            <div className="kv"><span>判定</span><b className={`vtext ${verdictMeta(verdictOfRun).cls}`}>{verdictOfRun ? <><VerdictIcon v={verdictOfRun} size={12} /> {verdictOfRun.toUpperCase()}</> : '—'}</b></div>
            <div className="kv"><span>Classification</span><b>{meta?.classification ?? '—'}</b></div>
          </div>
          <div>
            <div className="kv"><span>最近 5 次同 VER Run</span><b /></div>
            {(meta?.recentRuns?.length ?? 0) === 0 ? (
              <p className="dim" style={{ fontSize: 11 }}>无同验证的历史 Run。</p>
            ) : (
              <div className="mstat-verhist">
                {(meta?.recentRuns ?? []).map((r) => {
                  const v = verdictMeta(r.verdict ?? undefined);
                  return (
                    <span key={r.runId} className={`vtext ${v.cls}`} title={`${r.runId} · ${r.verdict ?? '—'}`}>
                      <VerdictIcon v={r.verdict} size={12} />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Before/After 修复对比卡（静态结构 + 占位按钮） */}
      <div className="mstat-card">
        <h5>修复对比</h5>
        <div className="mstat-ba">
          <div className="mstat-ba-col">
            <b className="mstat-ba-before">Before · 修复前</b>
            <p className="dim" style={{ fontSize: 11 }}>失败步骤的现场快照（截图 / 网络证据）将在此展示。</p>
          </div>
          <div className="mstat-ba-col">
            <b className="mstat-ba-after">After · 修复后</b>
            <p className="dim" style={{ fontSize: 11 }}>修复后的复验 Run 证据将在此对比展示。</p>
          </div>
        </div>
        <div className="mstat-ba-acts">
          <button className="btn ghost" onClick={() => setToast('修复闭环属后续（需 AI 修复引擎）')}>Fix in chat</button>
          <button className="btn ghost" onClick={() => setToast('修复闭环属后续（需 AI 修复引擎）')}>Analyze with AI</button>
        </div>
      </div>

      {/* 日志区：Console / Network / 日志 三 tab */}
      <MobileLogs logs={logs} />
    </div>
  );
}

/** 日志三 tab（简版，数据源同 run events；空态诚实） */
function MobileLogs({ logs }: { logs: { consoleLines: RunEventLike[]; networkLines: RunEventLike[]; logLines: RunEventLike[] } }) {
  const [tab, setTab] = useState<'console' | 'network' | 'log'>('console');
  const map = { console: logs.consoleLines, network: logs.networkLines, log: logs.logLines };
  const lines = map[tab];
  return (
    <div className="mstat-card">
      <h5>日志</h5>
      <div className="mstat-logtabs">
        {(['console', 'network', 'log'] as const).map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'console' ? 'Console' : t === 'network' ? 'Network' : '日志'}{` (${map[t].length})`}
          </button>
        ))}
      </div>
      <div className="mstat-logbody mono">
        {lines.length === 0 && <span className="dim" style={{ fontSize: 11 }}>暂无 {tab === 'log' ? '日志' : tab} 证据——引擎采集到对应事件后在此展示。</span>}
        {lines.map((e, i) => (
          <div key={i} className="mstat-logrow">
            <span className="mstat-ts">{e.ts ? new Date(e.ts).toLocaleTimeString() : ''}</span>
            <span>{String((e as { uri?: string }).uri ?? e.detail ?? JSON.stringify(e.args ?? e))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
