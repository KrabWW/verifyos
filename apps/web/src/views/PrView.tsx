import { useEffect, useState } from 'react';
import { Globe, TriangleAlert, Sparkles, Check, Lightbulb } from 'lucide-react';
import { verdictMeta } from '../shared';

// ---------- PR 验证（webhook 说明 + verdict 概览） ----------
// ---------- F11: PR 验证（MR 列表 + Review 详情，对齐原型 s-pr 双态） ----------
interface MrArea { title: string; severity: string; related?: string | null; hint: string; action?: string | null; qaId?: string }
interface MrTest { title: string; status: string; source: string; durationSec: number; tag?: string }
interface MrDynFinding { level: string; title: string; detail: string }
interface MrDynStats { pages: number; edges: number; qaCount: number }
interface MrReviewData { verdict: string; summary: string; checkedAt: string; areas: MrArea[]; tests: MrTest[]; bot: string; dynamicFindings?: MrDynFinding[]; dynamicStats?: MrDynStats }
interface MrItem {
  iid: number; title: string; state: string; author: string; repo: string;
  source_branch: string; target_branch?: string; additions?: number; deletions?: number;
  running?: boolean; review: MrReviewData | null; created_at?: string;
}

export function PrView() {
  const [data, setData] = useState<{ stats: { all: number; opened: number; merged: number; closed: number }; items: MrItem[] } | null>(null);
  const [tab, setTab] = useState<'all' | 'opened' | 'merged' | 'closed'>('all');
  const [onlyReview, setOnlyReview] = useState(false);
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [filterRepo, setFilterRepo] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<MrItem | null>(null);
  const [msg, setMsg] = useState('');

  const load = (state = tab) => fetch(`/api/mrs${state !== 'all' ? `?state=${state}` : ''}`)
    .then((r) => r.json()).then(setData).catch(() => undefined);
  useEffect(() => { load(); }, []);

  const openDetail = (iid: number) => {
    setMsg('');
    fetch(`/api/mrs/${iid}`).then((r) => r.json()).then((d) => { if (d.found) setSel(d as MrItem); }).catch(() => undefined);
  };

  const writeback = (iid: number) => {
    fetch(`/api/mrs/${iid}/writeback`, { method: 'POST' }).then((r) => r.json())
      .then((d) => setMsg(d.ok ? `✓ 已回写 MR !${iid}：${d.verdictLabel}（stub 落盘 out/mr-comments/，GitLab token 接入后自动发布）` : `回写失败：${d.reason}`))
      .catch(() => setMsg('回写失败（网络）'));
  };

  const genQa = (area: MrArea, iid: number) => {
    fetch('/api/qa-points/from-finding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: area.title, risk: area.severity, detail: `${area.hint}（来自 MR !${iid} Review）` }) })
      .then((r) => r.json())
      .then((d) => setMsg(d.ok || d.deduped ? `✓ 已生成 QA 点草稿 ${d.shortId}（待确认）` : `生成 QA 点失败：${d.reason ?? '未知原因'}`))
      .catch(() => setMsg('生成 QA 点失败'));
  };

  const markToProduct = (area: MrArea, iid: number) => {
    fetch('/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: area.title, severity: area.severity, source: { from: 'mr-review', mrIid: iid, hint: area.hint } }) })
      .then((r) => r.json())
      .then((d) => setMsg(d.deduped ? `「${area.title}」已在问题库（去重未重复创建）` : `✓ 已标记给产品（转问题库，关联 MR !${iid}）`))
      .catch(() => setMsg('转问题失败'));
  };

  // F11-dyn: 动态探索发现 → 转 QA 点（复用 from-finding 通道）
  const dynToQa = (f: MrDynFinding, iid: number) => {
    fetch('/api/qa-points/from-finding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `[PR!${iid}] ${f.title}`, risk: f.level === 'red' ? 'high' : 'medium', detail: `${f.detail}（来自 MR !${iid} 动态探索）` }) })
      .then((r) => r.json())
      .then((d) => setMsg(d.ok || d.deduped ? `✓ 已生成 QA 点草稿 ${d.shortId}（待确认）` : `生成 QA 点失败：${d.reason ?? '未知原因'}`))
      .catch(() => setMsg('生成 QA 点失败'));
  };

  const reviewBadge = (m: MrItem) => {
    if (m.running) return <span className="rvrun"><i></i>Running…</span>;
    if (!m.review) return <span className="hint">—</span>;
    const passCount = m.review.tests.filter((t) => t.status === 'pass').length;
    const ideaCount = (m.review.areas ?? []).length;
    return (
      <>
        <span className="rvok"><Check size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {passCount}</span>
        {ideaCount > 0 && <span className="rvidea"><Lightbulb size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {ideaCount}</span>}
      </>
    );
  };

  const createdLabel = (m: MrItem) => {
    if (!m.created_at) return '—';
    const ms = Date.now() - new Date(m.created_at).getTime();
    if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60e3))} 分钟前`;
    if (ms < 86400e3) return `${Math.round(ms / 3600e3)} 小时前`;
    return `${Math.round(ms / 86400e3)} 天前`;
  };

  const stateLabel: Record<string, string> = { opened: 'Open', merged: 'Merged', closed: 'Closed' };

  // ---------- 详情态 ----------
  if (sel) {
    const rv = sel.review;
    const vm = rv ? verdictMeta(rv.verdict) : null;
    return (
      <div className="pageview">
        <div className="runhead">
          <button className="btn" onClick={() => { setSel(null); load(); }}>← Pull Requests</button>
          <div className="big">{sel.title} <span className="chip p-gray">!{sel.iid}</span> <span className="chip p-blue">{stateLabel[sel.state] ?? sel.state}</span></div>
          <span className="hint">{sel.author} · {sel.repo} · <code className="mono">{sel.source_branch}</code> → <code className="mono">{sel.target_branch ?? 'main'}</code> · {sel.additions != null ? `+${sel.additions} −${sel.deletions ?? 0}` : ''}</span>
          <span className="sp" />
          <button className="btn" onClick={() => setMsg(`跳转 GitLab MR !${sel.iid}（GitLab 集成接入后生效）`)}>View on GitLab</button>
        </div>
        <div className="prdtabs">
          <span className="prtab on">Review</span>
          <span className="prtab" onClick={() => setMsg('Files changed：真实 diff 视图属 GitLab 集成范围（原型为示意）')}>Files changed</span>
          <span className="prtab" onClick={() => setMsg('Conversation：回写后含 VerifyOS Bot 报告评论')}>Conversation</span>
        </div>

        {rv && vm && (
          <>
            <div className={`banner ${vm.cls === 'ok' ? 'b-ok' : vm.cls === 'fail' ? 'b-fail' : 'b-warn'}`}>
              <b>{rv.verdict === 'pass' ? '验证全部通过' : rv.verdict === 'fail' ? '存在断言失败' : `发现 ${(rv.tests ?? []).filter((t) => t.status !== 'pass').length} 项无法验证 · ${(rv.areas ?? []).length} 个新发现`}</b>
              <span className="hint" style={{ marginLeft: 6 }}>{rv.checkedAt}</span>
            </div>
            <div className="gate">
              合并门禁：断言失败 → <b>阻止合并</b> · 无法验证 → <b>{rv.verdict === 'unknown' ? '警告（当前）' : '警告'}</b> · UNKNOWN ≠ PASS
              <button className="btn" style={{ marginLeft: 'auto', padding: '2px 9px', fontSize: 11.5 }} onClick={() => setMsg('门禁策略设置（策略引擎接入后可调：fail=阻止 / unknown=警告或阻止）')}>调整策略</button>
            </div>

            <div className="sumcard">
              <h4>SUMMARY</h4>
              <p style={{ fontSize: 13, lineHeight: 1.85 }}>{rv.summary}</p>
            </div>

            {(rv.areas ?? []).length > 0 && (
              <div className="sumcard">
                <h4>AREAS FOR IMPROVEMENT ({rv.areas.length})</h4>
                {rv.areas.map((a, i) => (
                  <div key={i} className="area-row">
                    {a.severity === 'info' ? <Globe size={15} style={{ color: 'var(--muted)', marginTop: 2, flexShrink: 0 }} /> : <TriangleAlert size={15} style={{ color: 'var(--amber)', marginTop: 2, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 12.5 }}>{a.title}</b>{' '}
                      {a.severity === 'info' ? <span className="chip p-gray">环境</span> : a.qaId ? <><span className="chip p-amber">幂等缺陷</span> <span className="chip p-red">{a.related}</span></> : <><span className="chip p-amber">高风险</span> {a.related && <span className="chip p-blue">{a.related}</span>}</>}
                      <div className="hint">{a.hint}
                        {a.action === 'gen-qa' && <><button className="btn" style={{ marginLeft: 6, padding: '2px 9px', fontSize: 11.5 }} onClick={() => genQa(a, sel.iid)}><Sparkles size={10} /> 生成 QA 点</button><button className="btn" style={{ marginLeft: 6, padding: '2px 9px', fontSize: 11.5 }} onClick={() => markToProduct(a, sel.iid)}>标记给产品</button></>}
                        {a.action === 'link-qa' && a.qaId && <button className="btn" style={{ marginLeft: 6, padding: '2px 9px', fontSize: 11.5 }} onClick={() => setMsg(`已关联 ${a.qaId} 并加强断言（验证关联引擎接入后自动生成定向回归）`)}>关联验证</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* F11-dyn: 动态探索新发现（探索式回归——Agent 对 Preview 环境的 mini-explore Live Findings） */}
            {(rv.dynamicFindings ?? []).length > 0 && (
              <div className="sumcard">
                <h4>动态探索新发现 ({rv.dynamicFindings!.length}) <span className="hint" style={{ fontWeight: 400 }}>Agent 对 Preview 环境的探索式回归{rv.dynamicStats ? ` · ${rv.dynamicStats.pages} 页 ${rv.dynamicStats.edges} 边 · +${rv.dynamicStats.qaCount} QA 候选` : ''}</span></h4>
                {rv.dynamicFindings!.map((f, i) => (
                  <div key={i} className="area-row">
                    <TriangleAlert size={15} style={{ color: f.level === 'red' ? 'var(--red)' : 'var(--amber)', marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 12.5 }}>{f.title}</b>{' '}
                      <span className={`chip ${f.level === 'red' ? 'p-red' : 'p-amber'}`}>{f.level === 'red' ? '故障信号' : '风险信号'}</span>
                      <div className="hint">{f.detail}
                        <button className="btn" style={{ marginLeft: 6, padding: '2px 9px', fontSize: 11.5 }} onClick={() => dynToQa(f, sel.iid)}><Sparkles size={10} /> 转 QA 点</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {rv.dynamicFindings === undefined && (
              <div className="sumcard">
                <h4>动态探索新发现</h4>
                <p className="dim" style={{ fontSize: 11.5 }}>mini-explore 进行中（约 30-60s）——完成后此处出现 Agent 对 Preview 环境的新发现（HTTP 错误 / 慢响应 / JS 错误 / 登录墙）；稍后重新打开本详情查看。</p>
              </div>
            )}

            <div className="sumcard" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px 8px' }}><h4 style={{ margin: 0 }}>TESTS RUN ({rv.tests.length}) <span className="hint" style={{ fontWeight: 400 }}>按本 PR 变更动态生成 · Preview 环境</span></h4></div>
              <table className="tbl">
                <tbody>
                  {rv.tests.map((t, i) => (
                    <tr key={i} className={t.status === 'unknown' ? 'mrow-warn' : ''}>
                      <td style={{ width: 26 }}><span className={`tst ${t.status === 'pass' ? 'ok' : 'warn'}`}>{t.status === 'pass' ? '✓' : '?'}</span></td>
                      <td><b style={{ fontSize: 12.5 }}>{t.title}</b> {t.tag && <span className="chip p-blue">{t.tag}</span>}{t.status === 'unknown' && <span className="chip v-unknown">无法验证</span>}</td>
                      <td className="hint">{t.source}</td>
                      <td className="hint" style={{ width: 70, textAlign: 'right' }}>{t.durationSec > 0 ? `${t.durationSec}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mrcard">
              <div className="mrhead">
                <div className="mav">✓</div>
                <div><b>VerifyOS Bot</b> <span className="hint">已回写 MR !{sel.iid} · Conversation</span></div>
                <div style={{ flex: 1 }} />
                <span className={`chip ${rv.verdict === 'pass' ? 'p-green' : 'p-amber'}`}>{rv.verdict === 'pass' ? '已验证' : '无法完全验证'}</span>
              </div>
              <div className="mrbody">
                <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>{rv.bot} <span className="hint">证据：截图 · Trace · Network 录制（执行页可查）</span></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <button className="btn primary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => setMsg('已在 MR Conversation 发布完整报告（stub）——GitLab token 接入后经 API 真实发布')}>在 GitLab 中查看评论</button>
                  <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => writeback(sel.iid)}>↩ 回写 MR 状态</button>
                </div>
              </div>
            </div>
          </>
        )}
        {!rv && (
          <div className="sumcard">
            <p className="dim" style={{ fontSize: 12.5 }}>该 MR 暂无 VerifyOS Review{sel.running ? ' —— 验证进行中（Webhook 自动触发，Preview 就绪后执行）' : '（Closed 状态不触发验证）'}。</p>
          </div>
        )}
        {msg && <p className="dim" style={{ fontSize: 11.5 }}>{msg}</p>}
      </div>
    );
  }

  // ---------- 列表态 ----------
  const st = data?.stats ?? { all: 0, opened: 0, merged: 0, closed: 0 };
  const allItems = data?.items ?? [];
  // 合并门禁：断言失败（verdict=fail）→ 阻止合并；unknown=警告 ≠ 阻止
  const isBlocked = (m: MrItem) => !!m.review && m.review.verdict === 'fail';
  const blockedCount = allItems.filter(isBlocked).length;
  const repoOptions = [...new Set(allItems.map((m) => m.repo))].sort();
  const authorOptions = [...new Set(allItems.map((m) => m.author))].sort();
  const activeFilterCount = (filterRepo ? 1 : 0) + (filterAuthor ? 1 : 0);
  const items = allItems.filter((m) => {
    if (onlyReview && !m.review) return false;
    if (onlyBlocked && !isBlocked(m)) return false;
    if (filterRepo && m.repo !== filterRepo) return false;
    if (filterAuthor && m.author !== filterAuthor) return false;
    if (q && !(`${m.title} ${m.repo} !${m.iid}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  const tabs: Array<{ k: 'all' | 'opened' | 'merged' | 'closed'; label: string; n: number }> = [
    { k: 'all', label: 'All', n: st.all },
    { k: 'opened', label: 'Open', n: st.opened },
    { k: 'merged', label: 'Merged', n: st.merged },
    { k: 'closed', label: 'Closed', n: st.closed },
  ];
  return (
    <div className="pageview">
      <div className="runhead">
        <div className="big">Pull Requests</div>
        <span className="hint">Pull requests synced from GitLab, with VerifyOS review results when available.</span>
        <span className="sp" />
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button className={`btn${activeFilterCount > 0 ? ' primary' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)}>
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
          {filtersOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, background: 'var(--card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: '10px 12px', width: 220, display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              <label style={{ fontSize: 11, color: 'var(--sub)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Repo
                <select className="inp" style={{ maxWidth: 'none', padding: '4px 8px', fontSize: 12 }} value={filterRepo} onChange={(e) => setFilterRepo(e.target.value)}>
                  <option value="">全部仓库</option>
                  {repoOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: 'var(--sub)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Author
                <select className="inp" style={{ maxWidth: 'none', padding: '4px 8px', fontSize: 12 }} value={filterAuthor} onChange={(e) => setFilterAuthor(e.target.value)}>
                  <option value="">全部作者</option>
                  {authorOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {activeFilterCount > 0 && (
                  <button className="btn" style={{ padding: '2px 9px', fontSize: 11.5 }} onClick={() => { setFilterRepo(''); setFilterAuthor(''); }}>重置</button>
                )}
                <button className="btn primary" style={{ marginLeft: 'auto', padding: '2px 9px', fontSize: 11.5 }} onClick={() => setFiltersOpen(false)}>完成</button>
              </div>
            </div>
          )}
        </span>
        <label className={`switch${onlyReview ? ' on' : ''}`} onClick={() => setOnlyReview(!onlyReview)}><i></i>Only with reviews</label>
        <input className="inp" style={{ maxWidth: 190 }} placeholder="Search by title, repo, or #…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="prtabs">
        {tabs.map((t) => (
          <span key={t.k} className={`prtab${tab === t.k ? ' on' : ''}`} onClick={() => { setTab(t.k); load(t.k); }}>{t.label} <b>{t.n}</b></span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
        <span className="hint" style={{ fontSize: 11 }}>筛选：</span>
        <span
          className={`chip ${onlyBlocked ? 'p-red' : 'p-gray'}`}
          style={{ cursor: 'pointer' }}
          title="合并门禁：断言失败（fail）→ 阻止合并；unknown=警告 ≠ 阻止"
          onClick={() => setOnlyBlocked(!onlyBlocked)}
        >
          阻止合并{blockedCount > 0 ? ` ${blockedCount}` : ''}
        </span>
        {onlyBlocked && blockedCount === 0 && <span className="hint" style={{ fontSize: 11 }}>当前列表无断言失败的 MR</span>}
      </div>
      <div className="sumcard" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl prtbl">
          <thead>
            <tr><th>Title</th><th style={{ width: 110 }}>Repo</th><th style={{ width: 80 }}>Author</th><th style={{ width: 130 }}>Review</th><th style={{ width: 100 }}>Created</th></tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.iid} className="click" onClick={() => openDetail(m.iid)}>
                <td><b style={{ fontSize: 12.5 }}>{m.title}</b> <span className="hint">!{m.iid} · {stateLabel[m.state] ?? m.state}</span></td>
                <td className="hint">{m.repo}</td>
                <td className="hint">{m.author}</td>
                <td>{reviewBadge(m)}</td>
                <td className="hint">{createdLabel(m)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5}><p className="dim" style={{ fontSize: 12, padding: '10px 0' }}>无匹配 MR —— 数据来源：GitLab webhook 同步 + 原型演示种子（首次打开自动种入）。</p></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Review 列：<b>✓</b> 验证通过 · <b><Lightbulb size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /></b> 动态探索新发现 · <b>Running…</b> 验证进行中（Webhook 自动触发，Preview 就绪后执行）。点击行查看 Review 详情。</div>
      {msg && <p className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>{msg}</p>}
    </div>
  );
}
