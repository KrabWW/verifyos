import { Fragment, useEffect, useState } from 'react';
import { TriangleAlert, X, Check } from 'lucide-react';
import type { Route } from '../shared';

// ---------- 问题库（MR 影响分析高风险自动转入 + 状态流转 + G11 全链路追溯展开） ----------
interface TraceData {
  found?: boolean;
  run: { id: string; verdict: string | null } | null;
  verification: { shortId: string; title: string } | null;
  qa: { shortId: string; title: string } | null;
}

const ROUTE_LABEL: Partial<Record<Route, string>> = { qa: 'QA 点', editor: '验证编辑器', run: '验证 · 执行' };

/** G11：来源归类——source 有 pr（MR）→ MR 影响；from=live-finding → Live Finding；其他 → AI 测试 */
function srcChip(it: Record<string, unknown>) {
  const s = (it.source ?? {}) as Record<string, unknown>;
  if (s.pr) return <span className="chip p-blue" title={`MR !${String(s.pr)}`}>MR 影响</span>;
  if (s.from === 'live-finding') return <span className="chip p-amber" title={String(s.from)}>Live Finding</span>;
  return <span className="chip p-indigo" title="验证/Triage 转入">AI 测试</span>;
}

export function IssuesView({ onGo, onOpenRun }: { onGo?: (r: Route) => void; onOpenRun?: (runId: string) => void }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [traces, setTraces] = useState<Record<string, TraceData | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // `${id}:resolve` / `${id}:sync` —— loading 态防重复点击
  const load = () => fetch(`/api/issues?status=${tab}`)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((d) => setItems(d.items ?? []))
    .catch(() => setErr('问题列表加载失败——请检查 API 服务（/api/issues）后刷新重试'));
  useEffect(() => { load(); }, [tab]);

  const resolve = (id: unknown) => {
    setBusy(`${id}:resolve`);
    fetch(`/api/issues/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(() => load())
      .catch(() => setErr('问题解决失败——状态未更新，请重试'))
      .finally(() => setBusy(null));
  };
  const sysLabel = (s: 'zentao' | 'jira') => (s === 'jira' ? 'Jira' : '禅道');
  const sync = (id: unknown, system: 'zentao' | 'jira') => {
    setBusy(`${id}:sync`);
    fetch(`/api/issues/${id}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system }) })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => {
        if (d.ok) window.alert(`✓ 已推送 ${d.system.toUpperCase()}：外部 ID ${d.externalId}（stub——MCP 连接器接入后真实下发）`);
        else setErr(`推送${sysLabel(system)}失败：${d.reason ?? '未知原因'}`);
        load();
      })
      .catch(() => setErr(`推送${sysLabel(system)}失败——网络或服务异常，请重试`))
      .finally(() => setBusy(null));
  };
  const sevCls = (sev: unknown) => (sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : 'low');
  const sevLabel = (sev: unknown) => (sev === 'high' ? '高' : sev === 'medium' ? '中' : '低');

  /** P1 时间列本地化：ISO(UTC) → 本地「MM-DD HH:mm」；非法值诚实回退原文 */
  const fmtTime = (iso: unknown) => {
    const s = String(iso ?? '');
    const d = new Date(s);
    if (!s || Number.isNaN(d.getTime())) return s ? s.slice(0, 16).replace('T', ' ') : '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /** 行点击展开/收起全链路追溯（trace 懒加载缓存） */
  const toggle = (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!(id in traces)) {
      fetch(`/api/issues/${id}/trace`)
        .then((r) => r.json())
        .then((d) => setTraces((p) => ({ ...p, [id]: d })))
        .catch(() => setTraces((p) => ({ ...p, [id]: null })));
    }
  };

  /** 追溯链节点：有值可点击跳转（RUN 节点优先 onOpenRun(runId) 带参回放，其次 onGo，都没有则 alert 提示目标）；无值保持 — */
  const node = (label: string, val: string | null | undefined, title: string, route: Route, runId?: string) => {
    if (!val) return <span className="chainnode off">{label} <b>—</b></span>;
    return (
      <span
        className="chainnode on link"
        title={title}
        onClick={() => {
          if (route === 'run' && runId && onOpenRun) { onOpenRun(runId); return; }
          if (onGo) onGo(route);
          else window.alert(`跳转目标：${ROUTE_LABEL[route] ?? route}`);
        }}
      >
        {label} <b className="mono">{val}</b>
      </span>
    );
  };

  const traceLine = (id: string) => {
    const t = traces[id];
    if (t === undefined) return <span className="dim" style={{ fontSize: 11 }}>追溯加载中…</span>;
    if (t === null || (!t.run && !t.verification && !t.qa)) {
      return <span className="dim" style={{ fontSize: 11 }}>该问题未关联 Run 追溯链（source 无 runId 或 Run 已不存在）——诚实展示，不虚构节点</span>;
    }
    return (
      <div className="chainrow" style={{ marginTop: 0 }}>
        <b className="dim" style={{ fontSize: 10.5, fontFamily: 'var(--mono)' }}>全链路追溯</b>
        <span className="chainarrow">←</span>
        {node('QA', t.qa?.shortId, t.qa?.title ? `QA 点：${t.qa.title}` : '查看 QA 点', 'qa')}
        <span className="chainarrow">→</span>
        {node('VER', t.verification?.shortId, t.verification?.title ? `验证：${t.verification.title}` : '查看验证', 'editor')}
        <span className="chainarrow">→</span>
        {node('RUN', t.run?.id?.slice(0, 12), t.run ? `Run verdict：${t.run.verdict ?? '—'}（回放执行屏）` : '查看 Run', 'run', t.run?.id)}
        <span className="chainarrow">→</span>
        {t.run ? node('证据', '执行屏回放', '回放该 Run 查看截图 / trace / HAR 证据', 'run', t.run.id) : <span className="chainnode off">证据 <b>—</b></span>}
      </div>
    );
  };

  return (
    <div className="pageview">
      {err && (
        <div role="alert" style={{ background: '#c0392b', color: '#fff', padding: '6px 12px', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{ flex: 1 }}><TriangleAlert size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />{err}</span>
          <span style={{ cursor: 'pointer', fontWeight: 700, padding: '0 4px', display: 'inline-flex' }} title="关闭" onClick={() => setErr(null)}><X size={13} /></span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['open', 'resolved'] as const).map((t) => (
          <span key={t} className={`chip quick${tab === t ? ' on' : ''}`} style={tab === t ? { background: 'var(--ink)', color: '#fff' } : undefined} onClick={() => setTab(t)}>
            {t === 'open' ? 'Open' : 'Resolved'}
          </span>
        ))}
        <span className="sp" />
        <span className="hint">点击行展开全链路追溯 · 同步外部 = 推送到禅道/Jira（MCP 连接器通道，当前 stub 落 source.external）</span>
      </div>
      <div className="sumcard" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <tr><th style={{ width: 90 }}>ID</th><th>标题</th><th style={{ width: 72 }}>严重度</th><th style={{ width: 80 }}>外部</th><th style={{ width: 96 }}>来源</th><th style={{ width: 88 }}>状态</th><th style={{ width: 110 }}>时间</th><th style={{ width: 300 }}></th></tr>
          {items.length === 0 && <tr><td colSpan={8} className="dim">{tab === 'open' ? '暂无 Open 问题 —— MR 影响分析的高风险项会自动出现在这里' : '暂无已解决'}</td></tr>}
          {items.map((it) => {
            const id = String(it.id);
            const src = (it.source ?? {}) as Record<string, unknown>;
            const rowRunId = typeof src.runId === 'string' && src.runId ? src.runId : '';
            return (
              <Fragment key={id}>
                <tr className="clickrow" style={{ cursor: 'pointer' }} onClick={() => toggle(id)}>
                  <td className="mono">{String(it.short_id)}</td>
                  <td><b>{String(it.title)}</b></td>
                  <td><span className={`schip s-${sevCls(it.severity)}`}><i />{sevLabel(it.severity)}</span></td>
                  <td>{(() => {
                    const ext = src.external as { system?: string; id?: string } | undefined;
                    return ext ? <span className="chip p-blue" title={`${ext.system} · ${ext.id}`}>{ext.id}</span> : <span className="hint">—</span>;
                  })()}</td>
                  <td>{srcChip(it)}</td>
                  <td>{it.status === 'open' ? <span className="schip s-open"><i />待处理</span> : <span className="schip s-resolved"><i />已解决</span>}</td>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }} title={String(it.created_at ?? '')}>{fmtTime(it.created_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {tab === 'open' && <>
                      <button className="btn" style={{ fontSize: 10.5 }} disabled={busy !== null} onClick={() => sync(it.id, 'zentao')}>{busy === `${id}:sync` ? '推送中…' : '推送禅道'}</button>{' '}
                      <button className="btn" style={{ fontSize: 10.5 }} disabled={busy !== null} onClick={() => sync(it.id, 'jira')}>{busy === `${id}:sync` ? '推送中…' : '推送 Jira'}</button>{' '}
                      <button className="btn" disabled={busy !== null} onClick={() => resolve(it.id)}>{busy === `${id}:resolve` ? '处理中…' : <><Check size={11} /> 解决</>}</button>{' '}
                    </>}
                    {rowRunId && onOpenRun && (
                      <button className="btn" style={{ fontSize: 10.5 }} title={`追溯 Run ${rowRunId}（回放执行屏）`} onClick={() => onOpenRun(rowRunId)}>追溯→</button>
                    )}
                  </td>
                </tr>
                {openId === id && (
                  <tr>
                    <td colSpan={8} style={{ background: '#fcfcfd', padding: '10px 16px' }}>{traceLine(id)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </table>
      </div>
    </div>
  );
}
