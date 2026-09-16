import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

// ---------- 应用地图（SVG，真 PG graph；F9: 覆盖率 + QA 徽标 + 生成缺失验证；H08: 标签避让 + 自适应 viewBox） ----------
interface CovNode { ref: string; path: string; title: string | null; intentBand: string | null; covered: boolean; qa: Array<{ shortId: string; title: string; status: string }>; lastVerdict: string | null; failCount: number }

export function MapView({ onGoQa }: { onGoQa: () => void }) {
  const [g, setG] = useState<{ nodes: Array<{ ref: string; title?: string; meta: Record<string, unknown> }>; edges: Array<{ fromRef: string; toRef: string }> } | null>(null);
  const [cov, setCov] = useState<{ coverage: { total: number; matched: number; pct: number }; nodes: CovNode[] } | null>(null);
  const [sel, setSel] = useState<CovNode | null>(null);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const load = () => {
    fetch('/api/graph').then((r) => r.json()).then((d) => { setG(d.found ? { nodes: d.nodes, edges: d.edges } : { nodes: [], edges: [] }); setLoaded(true); }).catch(() => setLoaded(true));
    fetch('/api/graph/coverage').then((r) => r.json()).then(setCov).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const bandColor = (b: unknown) => (b === 'high' ? 'var(--green)' : b === 'mid' ? 'var(--amber)' : 'var(--muted)');
  const covByRef = new Map((cov?.nodes ?? []).map((n) => [n.ref, n]));

  // H08 P2：布局随节点数自适应 —— 半径与画布高度随节点数增长（原固定 860x420 会挤压出界）
  const nodes = g?.nodes ?? [];
  const NN = nodes.length;
  const R = NN <= 2 ? 110 : Math.min(300, 100 + NN * 11);
  const CX = 450, CY = R + 100;
  type Lay = { x: number; y: number; side: 'right' | 'left' | 'top' | 'bottom'; push: number };
  const lay = (i: number, n: number): Lay => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    const c = Math.cos(a);
    return {
      x: CX + R * c,
      y: CY + R * Math.sin(a),
      // H08 P1：按角度确定性分侧 —— 左/右半圆标签朝外水平排，正上/正下节点标签纵向排（阈值收紧减少同侧拥挤）
      side: c > 0.25 ? 'right' : c < -0.25 ? 'left' : Math.sin(a) > 0 ? 'bottom' : 'top',
      // H08 P1：按索引确定性交错偏移，同侧标签径向错开，避免同一视觉区域互相遮挡
      push: [0, 16, 6, 22][i % 4],
    };
  };
  const textW = (s: string, fs: number) => Array.from(s).reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.55), 0);
  // 预布局：节点位置 + 标题/路径/QA 徽标的占位 bbox（供 viewBox 自适应裁剪用）
  const laid = nodes.map((n, i) => {
    const L = lay(i, NN);
    const title = String(n.title ?? n.ref.replace(/^https?:\/\//, '')).slice(0, 16);
    const label = n.ref.replace(/^https?:\/\//, '').slice(0, 28);
    const c = covByRef.get(n.ref);
    const tw = Math.max(textW(title, 10), textW(label, 8.5)) + 4;
    let x0 = L.x - 13, x1 = L.x + 13, y0 = L.y - 13, y1 = L.y + 13;
    if (L.side === 'right') { x0 = L.x - 37; x1 = L.x + 14 + L.push + tw; y0 = L.y - 12; y1 = L.y + 12; }
    else if (L.side === 'left') { x0 = L.x - 14 - L.push - tw; x1 = L.x + 37; y0 = L.y - 12; y1 = L.y + 12; }
    else if (L.side === 'top') { x0 = L.x - tw / 2; x1 = L.x + tw / 2; y0 = L.y - 37 - L.push; y1 = L.y + 24; }
    else { x0 = L.x - tw / 2; x1 = L.x + tw / 2; y0 = L.y - 24; y1 = L.y + 41 + L.push; }
    return { n, L, title, label, c, x0, x1, y0, y1 };
  });
  const idx = new Map(nodes.map((n, i) => [n.ref, i]));
  // H08 P2：viewBox 按节点+标签 bbox 自适应（含 16px 内边距），标签再长也不会被裁剪
  const pad = 16;
  const vb = laid.length
    ? `${Math.min(...laid.map((d) => d.x0)) - pad} ${Math.min(...laid.map((d) => d.y0)) - pad} ${Math.max(...laid.map((d) => d.x1)) - Math.min(...laid.map((d) => d.x0)) + pad * 2} ${Math.max(...laid.map((d) => d.y1)) - Math.min(...laid.map((d) => d.y0)) + pad * 2}`
    : '0 0 900 480';

  const genMissing = () => {
    const missing = (cov?.nodes ?? []).filter((n) => !n.covered && n.intentBand === 'high');
    if (missing.length === 0) { setMsg('未覆盖的 high 意图节点为 0——无需补生成'); return; }
    Promise.all(missing.map((n) => fetch('/api/qa-points/from-finding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `覆盖缺口：${n.path}`, risk: 'high', detail: `节点 ${n.ref} 为 high 意图但未被任何验证触达（F9 生成缺失验证）` }) })))
      .then(() => setMsg(`✓ 已为 ${missing.length} 个未覆盖 high 节点生成 QA 点（discovered）——到「QA 点」页批量生成验证`))
      .catch(() => setMsg('生成失败'));
  };

  return (
    <div className="pageview">
      <div className="sumcard">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>应用地图（Coverage Graph · 节点色 = Intent 分档 · ✓ = 已被验证触达）</h4>
          <span className="sp" />
          {cov && <span className={`chip ${cov.coverage.pct >= 60 ? 'p-green' : 'p-amber'}`}>验证覆盖率 {cov.coverage.pct}%（{cov.coverage.matched}/{cov.coverage.total} 节点）</span>}
          <button className="btn" onClick={genMissing}><Zap size={11} /> 生成缺失验证（high 未覆盖）</button>
        </div>
        {msg && <p className="hint" style={{ marginTop: 6 }}>{msg}</p>}
        {loaded && NN === 0 && <p className="dim" style={{ fontSize: 12 }}>图为空 —— 去「探索」跑一次即自动生成</p>}
        {NN > 0 && (
          <svg width="100%" viewBox={vb} style={{ background: '#fcfcfd', borderRadius: 8, border: '1px solid var(--border)' }}>
            {g!.edges.map((e, i) => {
              const a = idx.get(e.fromRef); const b = idx.get(e.toRef);
              if (a == null || b == null) return null;
              const pa = laid[a].L; const pb = laid[b].L;
              return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#d4d4d8" strokeWidth={1} />;
            })}
            {laid.map(({ n, L, title, label, c }) => {
              const isSel = sel?.ref === n.ref;
              // H08 P1：标题/路径两行标签沿分侧方向朝外排布
              const lx = L.side === 'left' ? L.x - 14 - L.push : L.x + 14 + L.push;
              const lAnchor = L.side === 'left' ? 'end' : 'start';
              const titleX = L.side === 'top' || L.side === 'bottom' ? L.x : lx;
              const titleY = L.side === 'top' ? L.y - 16 - L.push : L.side === 'bottom' ? L.y + 19 + L.push : L.y - 2;
              const subX = titleX;
              const subY = L.side === 'top' ? L.y - 27 - L.push : L.side === 'bottom' ? L.y + 31 + L.push : L.y + 10;
              const tAnchor = L.side === 'top' || L.side === 'bottom' ? 'middle' : lAnchor;
              // H08 P1：QA 徽标固定排在标签反侧，与标题错位不遮挡
              const badge = L.side === 'right' ? { x: L.x - 37, y: L.y - 6 }
                : L.side === 'left' ? { x: L.x + 11, y: L.y - 6 }
                : L.side === 'top' ? { x: L.x - 13, y: L.y + 11 }
                : { x: L.x - 13, y: L.y - 19 };
              return (
                <g key={n.ref} style={{ cursor: 'pointer' }} onClick={() => setSel(c ?? ({ ref: n.ref, path: label, title: n.title ?? null, intentBand: String(n.meta.intentBand ?? ''), covered: false, qa: [], lastVerdict: null, failCount: 0 }))}>
                  {isSel && <circle cx={L.x} cy={L.y} r={13} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 2" />}
                  {/* G03：最近判定 fail → 红描边 + ✕ 记号（优先于 ✓） */}
                  {c && c.lastVerdict === 'fail' && <title>最近运行判定 fail（失败 {c.failCount} 次）</title>}
                  <circle cx={L.x} cy={L.y} r={7} fill={bandColor(n.meta.intentBand)} stroke={c?.lastVerdict === 'fail' ? 'var(--red)' : c?.covered ? 'var(--green)' : '#fff'} strokeWidth={c?.covered || c?.lastVerdict === 'fail' ? 3 : 2} />
                  {c && c.lastVerdict === 'fail'
                    ? <text x={L.x} y={L.y + 3.5} textAnchor="middle" fontSize={9} fill="var(--red)" stroke="#fff" strokeWidth={0.6} paintOrder="stroke" fontWeight={700}>✕</text>
                    : c?.covered && <text x={L.x} y={L.y + 3.5} textAnchor="middle" fontSize={8} fill="#fff" fontWeight={700}>✓</text>}
                  {c && c.qa.length > 0 && (
                    <g>
                      <rect x={badge.x} y={badge.y} width={26} height={12} rx={6} fill="#eef2ff" stroke="#c7d2fe" />
                      <text x={badge.x + 13} y={badge.y + 9} textAnchor="middle" fontSize={8} fill="#4f46e5">QA·{c.qa.length}</text>
                    </g>
                  )}
                  <text x={titleX} y={titleY} textAnchor={tAnchor} fontSize={10} fill="#52525b">{title}</text>
                  <text x={subX} y={subY} textAnchor={tAnchor} fontSize={8.5} fill="#a1a1aa" fontFamily="ui-monospace,Menlo">{label}</text>
                </g>
              );
            })}
          </svg>
        )}
        {NN > 0 && (
          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
            {NN} 节点 · {g!.edges.length} 边 · <span style={{ color: 'var(--green)' }}>●</span> high · <span style={{ color: 'var(--amber)' }}>●</span> mid · <span style={{ color: 'var(--muted)' }}>●</span> low · 绿圈 ✓ = 验证已触达 · <span style={{ color: 'var(--red)' }}>✕</span> 运行失败 · QA·N = 关联 QA 点
          </div>
        )}
      </div>

      {/* 节点详情浮层（点节点 → 关联 QA 点） */}
      {sel && (
        <div className="sumcard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 style={{ margin: 0 }}>节点 · <span className="mono">{sel.path}</span></h4>
            <span className={`chip ${sel.covered ? 'p-green' : 'p-amber'}`}>{sel.covered ? '✓ 已被验证触达' : '未覆盖'}</span>
            <span className="chip p-gray">intent: {sel.intentBand ?? '—'}</span>
            {sel.lastVerdict != null && (
              <span className="hint" style={{ fontSize: 12 }}>
                最近判定：<span className={`chip ${sel.lastVerdict === 'fail' ? 'v-fail' : 'p-gray'}`}>{sel.lastVerdict}</span>
                {sel.lastVerdict === 'fail' && <span style={{ color: 'var(--red)', marginLeft: 4 }}>（失败 {sel.failCount} 次）</span>}
              </span>
            )}
            <span className="sp" />
            <button className="btn" onClick={() => setSel(null)}>✕</button>
          </div>
          {sel.qa.length === 0
            ? <p className="hint" style={{ marginTop: 8 }}>该节点暂无关联 QA 点（QA 关联按探索产出的 sourceUrl 匹配）。</p>
            : (
              <div style={{ marginTop: 8 }}>
                {sel.qa.map((q) => (
                  <div key={q.shortId} className="runrow"><span className="chip p-blue">{q.shortId}</span><b style={{ fontSize: 12 }}>{q.title}</b><span className="chip p-gray">{q.status}</span></div>
                ))}
                <button className="btn" style={{ marginTop: 6 }} onClick={onGoQa}>到 QA 点页 →</button>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
