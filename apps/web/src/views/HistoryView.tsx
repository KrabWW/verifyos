import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Camera, Globe, Paperclip, Route, Terminal } from 'lucide-react';
import { VerdictIcon, verdictMeta, type OverviewData } from '../shared';

// ---------- 执行历史（全量 recent）+ G05 过滤/搜索/时间列/新建执行 + J05 证据列表契约 ----------
type VerdictFilter = 'all' | 'pass' | 'unknown' | 'fail';

// J05 契约：GET /api/runs/:id/evidence（无 key）→ 200 {found:true, runId, keys:[{key, kind, bytes?}]}；404 {error:"run not found"}
interface EvKey { key: string; kind?: string; bytes?: number }
type EvState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; keys: EvKey[] };

const kindIcon = (kind?: string) => {
  switch (kind) {
    case 'screenshot': return <Camera size={12} />;
    case 'trace': return <Route size={12} />;
    case 'har': return <Globe size={12} />;
    case 'console': return <Terminal size={12} />;
    default: return <Paperclip size={12} />;
  }
};
const fmtBytes = (n?: number) =>
  n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

// 证据预览：图片/视频走弹窗（lightbox），trace/HAR/console 等文本类保留新标签页
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
const VID_RE = /\.(webm|mp4|mov|m4v)$/i;
type PreviewMode = 'image' | 'video';
const previewOf = (k: EvKey): PreviewMode | null =>
  k.kind === 'screenshot' || k.kind === 'image' || IMG_RE.test(k.key) ? 'image'
  : k.kind === 'video' || VID_RE.test(k.key) ? 'video'
  : null;
const evUrl = (runId: string, key: string) => `/api/runs/${runId}/evidence?key=${encodeURIComponent(key)}`;

export function HistoryView({ onReplay, onNew }: { onReplay: (runId: string) => void; onNew?: () => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [evOpen, setEvOpen] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, EvState>>({});
  const [vf, setVf] = useState<VerdictFilter>('all');
  const [q, setQ] = useState('');
  const [viewer, setViewer] = useState<{ runId: string; key: string; mode: PreviewMode } | null>(null);
  useEffect(() => {
    fetch('/api/overview?recentLimit=200').then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);
  // 弹窗：ESC 关闭 + 打开时禁用背景滚动
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewer(null); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [viewer]);

  const loadEvidence = (runId: string) => {
    if (evOpen === runId) { setEvOpen(null); return; }
    setEvOpen(runId);
    const cached = evidence[runId];
    if (cached && cached.status !== 'error') return; // 错误态不缓存——再次点击即重试
    setEvidence((prev) => ({ ...prev, [runId]: { status: 'loading' } }));
    fetch(`/api/runs/${runId}/evidence`)
      .then(async (r) => {
        if (r.status === 404) return { status: 'ready', keys: [] } as EvState;
        const d = await r.json();
        if (d.found === false) return { status: 'ready', keys: [] } as EvState;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const keys = ((d.keys ?? []) as Array<Record<string, unknown> | string>)
          .map((k) => (typeof k === 'string'
            ? { key: k }
            : { key: String(k.key ?? ''), kind: typeof k.kind === 'string' ? k.kind : undefined, bytes: typeof k.bytes === 'number' ? k.bytes : undefined }))
          .filter((k) => k.key);
        return { status: 'ready', keys } as EvState;
      })
      .then((s) => setEvidence((prev) => ({ ...prev, [runId]: s })))
      .catch(() => setEvidence((prev) => ({ ...prev, [runId]: { status: 'error' } })));
  };

  const recent = data?.recent ?? [];
  const totalRuns = data?.runs?.total ?? null;
  // H07+集成：/api/overview 支持 ?recentLimit（server 默认 8，本屏传 200 拉全量）→ 底部标明总数
  const recentCapped = totalRuns != null && recent.length < totalRuns;
  const countOf = (k: VerdictFilter) => (k === 'all' ? recent.length : recent.filter((r) => r.verdict === k).length);
  const filtered = recent.filter((r) => {
    if (vf !== 'all' && r.verdict !== vf) return false;
    if (q) {
      const hay = `${r.runId} ${r.verShortId ?? ''} ${r.verTitle ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const relTime = (r: { createdAt?: string }) => {
    if (!r.createdAt) return '—';
    const ms = Date.now() - new Date(r.createdAt).getTime();
    if (ms < 60e3) return '刚刚';
    if (ms < 3600e3) return `${Math.round(ms / 60e3)} 分钟前`;
    if (ms < 86400e3) return `${Math.round(ms / 3600e3)} 小时前`;
    return `${Math.round(ms / 86400e3)} 天前`;
  };

  const chips: Array<{ k: VerdictFilter; label: string }> = [
    { k: 'all', label: '全部' },
    { k: 'pass', label: '通过' },
    { k: 'unknown', label: '无法验证' },
    { k: 'fail', label: '失败' },
  ];

  return (
    <div className="pageview">
      <div className="runhead">
        <span className="hint">点击行回放事件流 · 「证据」展开留痕——图片/视频弹窗预览，trace/HAR 新标签打开</span>
        <span className="sp" />
        {onNew && <button className="btn primary" onClick={onNew}>＋ 新建执行</button>}
        <button className="btn" onClick={() => window.alert('定时任务（schedule 语义）属 Phase 5 —— 计划：cron 表达式 + 定时回归 + 结果差异对比。当前占位。')}><Clock size={11} /> 定时任务</button>
      </div>
      <div className="prtabs" style={{ marginBottom: 10, alignItems: 'center' }}>
        {chips.map((c) => (
          <span key={c.k} className={`prtab${vf === c.k ? ' on' : ''}`} onClick={() => setVf(c.k)}>{c.label} <b>{countOf(c.k)}</b></span>
        ))}
        <input className="inp" style={{ maxWidth: 220, marginLeft: 'auto' }} placeholder="搜索 runId / VER / 验证名…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="sumcard" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <tr><th>Run</th><th>验证</th><th>触发</th><th>判定</th><th>时间</th><th>耗时</th><th>LLM</th><th style={{ width: 90 }}>证据</th></tr>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="dim" style={{ padding: '28px 0' }}>
                {recent.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <span>暂无执行记录</span>
                    {onNew && <button className="btn primary" onClick={onNew}>＋ 新建执行</button>}
                  </div>
                ) : '无匹配记录——调整过滤条件或搜索词'}
              </td>
            </tr>
          )}
          {filtered.map((r) => {
            const vm = verdictMeta(r.verdict);
            return (
              <>
                <tr key={r.runId} className="clickrow" onClick={() => onReplay(r.runId)} style={{ cursor: 'pointer' }} title="点击回放该 Run 的事件流">
                  <td className="mono">{r.runId}</td>
                  <td>{r.verShortId ? <><span className="chip p-blue" title={r.verTitle ?? ''}>{r.verShortId}</span>{r.verTitle && <div className="hint" style={{ fontSize: 10, marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.verTitle}</div>}</> : <span className="hint">手动</span>}</td>
                  <td><span className={`chip ${r.trigger === 'pr' ? 'p-indigo' : 'p-gray'}`}>{r.trigger ?? 'manual'}</span></td>
                  <td><span className={`vtext ${vm.cls}`}><VerdictIcon v={r.verdict} size={13} /> {r.verdict}</span></td>
                  <td className="hint">{relTime(r)}</td>
                  <td className="mono">{(r.durationMs / 1000).toFixed(1)}s</td>
                  <td className="mono">{r.llmCalls}</td>
                  <td><button className="btn" style={{ fontSize: 10.5, padding: '2px 8px' }} onClick={(e) => { e.stopPropagation(); loadEvidence(r.runId); }}>查看证据 →</button></td>
                </tr>
                {evOpen === r.runId && (() => {
                  const st = evidence[r.runId];
                  return (
                    <tr key={`${r.runId}-ev`}>
                      <td colSpan={8} style={{ background: '#fcfcfd' }}>
                        {!st || st.status === 'loading'
                          ? <span className="hint">加载中…</span>
                          : st.status === 'error'
                            ? <div className="treason">证据列表加载失败——API 服务不可用或响应异常，请稍后再次点击「查看证据」重试</div>
                            : st.keys.length === 0
                              ? <span className="hint">该 Run 无归档证据</span>
                              : <div className="evlist">
                                  {st.keys.map((k) => {
                                    const pm = previewOf(k);
                                    return (
                                      <a key={k.key} className="evlink mono" title={pm ? `${k.key.split('/').pop()}（点击弹窗预览）` : k.key}
                                         style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content' }}
                                         href={evUrl(r.runId, k.key)} target="_blank" rel="noreferrer"
                                         onClick={(e) => { if (pm) { e.preventDefault(); setViewer({ runId: r.runId, key: k.key, mode: pm }); } }}>
                                        {kindIcon(k.kind)}
                                        <span>{k.key.split('/').pop()}</span>
                                        <span className="hint">{k.kind ?? 'file'}{k.bytes != null ? ` · ${fmtBytes(k.bytes)}` : ''}{pm ? ' · 预览' : ''}</span>
                                      </a>
                                    );
                                  })}
                                </div>}
                      </td>
                    </tr>
                  );
                })()}
              </>
            );
          })}
        </table>
        {/* H07: 底部总数标注——server recent 端 LIMIT 8 时明确显示总执行数 */}
        {recent.length > 0 && (
          <div className="hint" style={{ padding: '8px 12px', borderTop: '1px solid #eef0f3', textAlign: 'center' }}>
            已显示全部 {recent.length} 条{recentCapped ? `（共 ${totalRuns} 条执行——当前仅加载最近 ${recent.length} 条，其余需分页接口支持）` : ''}
          </div>
        )}
      </div>
      {viewer && (
        <div className="lightbox" onClick={() => setViewer(null)}>
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span className="mono" title={viewer.key}>{viewer.key.split('/').pop()}</span>
            <span className="lightbox-actions">
              <a className="btn" href={evUrl(viewer.runId, viewer.key)} target="_blank" rel="noreferrer">新标签打开</a>
              <button className="btn primary" onClick={() => setViewer(null)}>✕ 关闭</button>
            </span>
          </div>
          <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
            {viewer.mode === 'image'
              ? <img src={evUrl(viewer.runId, viewer.key)} alt={viewer.key} />
              : <video src={evUrl(viewer.runId, viewer.key)} controls autoPlay />}
          </div>
          <div className="lightbox-tip">点击空白处或按 ESC 关闭</div>
        </div>
      )}
    </div>
  );
}
