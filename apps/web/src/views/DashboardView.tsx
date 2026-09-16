import { useEffect, useState } from 'react';
import { SatelliteDish, Compass, Zap, TriangleAlert, Gauge, Layers, Activity, ShieldCheck, Crosshair, ArrowUpRight } from 'lucide-react';
import { VerdictIcon, verdictMeta, type OverviewData } from '../shared';

// ---------- E2：概览 Dashboard（真数据 /api/overview） ----------

// G04：本地扩展 overview 响应（不改动 shared.tsx）
type DashboardData = OverviewData & {
  qaPoints?: number;
  coveragePct?: number;
  coverageTrend?: Array<{ day: string; pct: number }>;
};

// L2：Bento 仪表盘布局（12 列网格）
// Row1: 通过率主卡(4) + 总Run/通过/无法验证/失败(2×4)
// Row2: 覆盖率环(4) + 趋势柱状(8)
// Row3: 最近执行(7) + 未覆盖 high(5)

export function DashboardView({ onOpenRun, onGo }: { onOpenRun: (runId?: string) => void; onGo: (r: 'explore' | 'qa') => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  // H11：覆盖率与地图同源 —— 改用 GET /api/graph/coverage（overview 的 coveragePct 口径过时不再用）
  const [cov, setCov] = useState<{ pct: number; matched: number; total: number } | null>(null);
  useEffect(() => {
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoaded(true));
    fetch('/api/graph/coverage')
      .then((r) => r.json())
      .then((j) => setCov(j?.coverage ?? null))
      .catch(() => setCov(null));
  }, []);

  const runs = data?.runs;
  const total = runs?.total ?? 0;
  // 通过率口径：pass / (pass+fail) —— unknown 无法验证不计入分母（UNKNOWN ≠ PASS 防假绿）
  const judged = (runs?.passed ?? 0) + (runs?.failed ?? 0);
  const passRate = judged > 0 ? Math.round(((runs?.passed ?? 0) / judged) * 100) : null;
  const pPass = total > 0 ? ((runs?.passed ?? 0) / total) * 100 : 0;
  const pUnknown = total > 0 ? ((runs?.unknown ?? 0) / total) * 100 : 0;
  const pFail = total > 0 ? ((runs?.failed ?? 0) / total) * 100 : 0;

  const kpis = [
    { icon: Activity, label: '总 Run 数', n: total, cls: '' },
    { icon: ShieldCheck, label: '通过', n: runs?.passed ?? 0, cls: 'ok' },
    { icon: TriangleAlert, label: '无法验证', n: runs?.unknown ?? 0, cls: 'warn' },
    { icon: Layers, label: '失败', n: runs?.failed ?? 0, cls: 'fail' },
  ];

  // H11 P1 data=null 空态：加载失败 / 暂无数据 + 去探索
  if (loaded && !data) {
    return (
      <div className="pageview">
        <div className="dash-card dash-empty">
          <SatelliteDish size={30} />
          <h4>加载失败 / 暂无数据</h4>
          <p className="dim">概览数据暂时不可用，请稍后重试，或先去探索页面发现应用。</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn primary" onClick={() => onGo('explore')}><Compass size={11} /> 去探索</button>
            <button className="btn" onClick={() => window.location.reload()}>刷新重试</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pageview">
      {/* 顶部操作行 */}
      <div className="dash-head">
        <span className="dash-head-title">概览</span>
        <span className="chip p-indigo">PR 验证 {data?.prRuns ?? 0} 次</span>
        <span className="chip">内置工具 {data?.tools.total ?? 8}</span>
        <span className="chip">QA 点 {data?.qaPoints ?? 0}</span>
        <span className="sp" />
        <button className="btn" onClick={() => onGo('qa')}><Zap size={11} /> 一键生成验证</button>
        <button className="btn primary" onClick={() => onGo('explore')}><Compass size={11} /> 开始发现</button>
      </div>

      <div className="dash-grid">
        {/* Row1：通过率主卡（深底 executive hero） */}
        <div className="dash-card dash-hero">
          <div className="dash-hero-label"><Gauge size={12} /> 通过率</div>
          <div className="dash-hero-n">{passRate === null ? '—' : `${passRate}%`}</div>
          <div className="dash-hero-sub">
            {passRate === null ? '暂无已判定的 Run' : `${runs?.passed ?? 0} 通过 / ${runs?.failed ?? 0} 失败（已判定 ${judged} 次）`}
          </div>
          <div className="dash-hero-bar" title={`通过 ${Math.round(pPass)}% · 无法验证 ${Math.round(pUnknown)}% · 失败 ${Math.round(pFail)}%`}>
            <i className="hb-pass" style={{ width: `${pPass}%` }} />
            <i className="hb-unknown" style={{ width: `${pUnknown}%` }} />
            <i className="hb-fail" style={{ width: `${pFail}%` }} />
          </div>
          <div className="dash-hero-legend">
            <span><i className="lg lg-pass" /> 通过 {runs?.passed ?? 0}</span>
            <span><i className="lg lg-unknown" /> 无法验证 {runs?.unknown ?? 0}</span>
            <span><i className="lg lg-fail" /> 失败 {runs?.failed ?? 0}</span>
          </div>
        </div>

        {/* Row1：KPI 小卡 ×4 */}
        {kpis.map((k) => (
          <div key={k.label} className="dash-card dash-kpi">
            <div className="dash-kpi-ic"><k.icon size={13} /></div>
            <div className={`dash-kpi-n ${k.cls}`}>{k.n}</div>
            <div className="dash-kpi-label">{k.label}</div>
          </div>
        ))}

        {/* Row2：覆盖率环卡 */}
        <div className="dash-card dash-cov">
          <div className="dash-card-head">
            <span className="dash-card-title"><CrosshairLike /> 验证覆盖率</span>
            <span className="chip p-green">{cov ? `${cov.pct}%` : '—'}</span>
          </div>
          <div className="dash-cov-body">
            <Donut pct={cov?.pct ?? 0} />
            <div className="dash-cov-meta">
              <div className="dash-cov-big">{cov ? `${cov.matched}/${cov.total}` : '—/—'}</div>
              <div className="dim">已验证触达节点 / 全部节点</div>
              <div className="dash-cov-note">与「应用地图」同源（/api/graph/coverage）</div>
              <button className="btn" onClick={() => onGo('explore')}><Compass size={11} /> 提升覆盖</button>
            </div>
          </div>
        </div>

        {/* Row2：趋势柱状卡（近 14 天） */}
        <div className="dash-card dash-trend">
          <div className="dash-card-head">
            <span className="dash-card-title">执行趋势 · 近 14 天</span>
            <span className="dash-legend">
              <span><i className="lg lg-pass" /> 通过</span>
              <span><i className="lg lg-unknown" /> 无法验证</span>
              <span><i className="lg lg-fail" /> 失败</span>
            </span>
          </div>
          {(!data?.trend || data.trend.length === 0) ? (
            <div className="dash-trend-empty dim">暂无趋势 —— 近 14 天无执行数据，跑一次验证后这里会长出趋势图。</div>
          ) : (() => {
            const trend = data.trend;
            const max = Math.max(...trend.map((t) => t.pass + t.unknown + t.fail), 1);
            return (
              <div className="dash-trend-bars">
                {trend.map((t) => {
                  const tp = (t.pass / max) * 100;
                  const tu = (t.unknown / max) * 100;
                  const tf = (t.fail / max) * 100;
                  return (
                    <div key={t.day} className="dash-tbar-col" title={`${t.day} · 通过 ${t.pass} · 无法验证 ${t.unknown} · 失败 ${t.fail}`}>
                      <div className="dash-tbar-stack">
                        <i className="tb-fail" style={{ height: `${tf}%` }} />
                        <i className="tb-unknown" style={{ height: `${tu}%` }} />
                        <i className="tb-pass" style={{ height: `${tp}%` }} />
                      </div>
                      <span className="dash-tbar-day">{t.day.slice(5)}</span>
                    </div>
                );
                })}
              </div>
            );
          })()}
        </div>

        {/* Row3：最近执行紧凑列表 */}
        <div className="dash-card dash-recent">
          <div className="dash-card-head">
            <span className="dash-card-title">最近执行</span>
          </div>
          {(data?.recent ?? []).length === 0 && (
            <div className="dash-trend-empty dim">暂无 Run —— 去「验证 · 执行」点「重新运行」，或在 AI 工作区说「跑一次验证」。</div>
          )}
          {(data?.recent ?? []).map((r) => {
            const vm = verdictMeta(r.verdict);
            return (
              <div key={r.runId} className="dash-runrow" onClick={() => onOpenRun(r.runId)}>
                <span className={`vtext ${vm.cls}`}><VerdictIcon v={r.verdict} size={14} /></span>
                <span className="mono dash-runid">{r.runId}</span>
                <span className={`schip s-${r.verdict === 'pass' ? 'resolved' : r.verdict === 'fail' ? 'high' : 'medium'}`}>{r.verdict}</span>
                <span className="dim mono dash-runmeta">{(r.durationMs / 1000).toFixed(1)}s · LLM {r.llmCalls}</span>
                <span className="sp" />
                <ArrowUpRight size={13} className="dash-run-arrow" />
              </div>
            );
          })}
        </div>

        {/* Row3：未覆盖 high 卡（无则显示已全覆盖绿态，保持布局平衡） */}
        <div className={`dash-card dash-uncovered${(data?.uncoveredHigh?.length ?? 0) > 0 ? '' : ' dash-clear'}`}>
          <div className="dash-card-head">
            <span className="dash-card-title"><TriangleAlert size={12} /> 未覆盖关键流程</span>
            {(data?.uncoveredHigh?.length ?? 0) > 0 && <span className="schip s-high"><i /> {(data?.uncoveredHigh ?? []).length} 条</span>}
          </div>
          {(data?.uncoveredHigh?.length ?? 0) === 0 ? (
            <div className="dash-trend-empty dim">high 意图全部有验证触达 —— 保持节奏，继续探索新流程。</div>
          ) : (
            <>
              {(data?.uncoveredHigh ?? []).map((u) => (
                <div key={u.path} className="dash-unrow">
                  <span className="schip s-high"><i />high</span>
                  <div className="dash-untext">
                    <b>{u.title ?? u.path}</b>
                    <span className="mono dim">{u.path}</span>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn" onClick={() => onGo('explore')}><Compass size={11} /> 再探索一轮</button>
                <button className="btn" onClick={() => onGo('qa')}>到 QA 点页生成 →</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** L2：覆盖率环（SVG donut，替换旧折线小图） */
function Donut({ pct }: { pct: number }) {
  const R = 34, C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="dash-donut" role="img" aria-label={`覆盖率 ${v}%`}>
      <circle cx="48" cy="48" r={R} fill="none" stroke="#f4f4f5" strokeWidth="9" />
      <circle
        cx="48" cy="48" r={R} fill="none" stroke="var(--green)" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 48 48)"
        style={{ transition: 'stroke-dasharray .6s cubic-bezier(.25,1,.5,1)' }}
      />
      <text x="48" y="45" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--ink)">{v}%</text>
      <text x="48" y="60" textAnchor="middle" fontSize="8.5" fill="#a1a1aa">覆盖率</text>
    </svg>
  );
}

/** 内联小图标（避免额外 import 增重） */
function CrosshairLike() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-1.5px' }}>
      <circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}
function ArrowUpRightLike() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dash-run-arrow">
      <path d="M7 7h10v10" /><path d="M7 17 17 7" />
    </svg>
  );
}
