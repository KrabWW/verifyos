import { useEffect, useState } from 'react';
import { Globe, TriangleAlert, Sparkles, Check, Lightbulb } from 'lucide-react';
import { verdictMeta } from '../shared';

// ---------- PR 验证（webhook 说明 + verdict 概览） ----------
// ---------- F11: PR 验证（MR 列表 + Review 详情，对齐原型 s-pr 双态） ----------
interface MrArea { title: string; severity: string; related?: string | null; hint: string; action?: string | null; qaId?: string; coveredBy?: string; uncoveredReason?: string }
interface MrTest { title: string; status: string; source: string; durationSec: number; tag?: string }
interface MrDynFinding { level: string; title: string; detail: string; occurrences?: number; confidence?: number; mergedFrom?: string[] }
interface MrDynStats { pages: number; edges: number; qaCount: number; rawCount?: number; merged?: number }
interface MrReviewData { verdict: string; summary: string; checkedAt: string; areas: MrArea[]; tests: MrTest[]; bot: string; gateMode?: 'blocking' | 'reporting'; plan?: 'smoke' | 'full'; dynamicFindings?: MrDynFinding[]; dynamicStats?: MrDynStats }
interface MrItem {
  iid: number; title: string; state: string; author: string; repo: string;
  source_branch: string; target_branch?: string; additions?: number; deletions?: number;
  running?: boolean; review: MrReviewData | null; created_at?: string; run_id?: string;
}

// G4：外部平台深链基址（GitLab MR 页 / 禅道 bug 页）
const GITLAB_MR_BASE = 'http://192.168.85.85:18083/root/conduit-api/-/merge_requests/';
const ZENTAO_BASE = 'http://192.168.85.85:18084';
/** G4-⑤：导航类发现判定（与 agent-core classifyFinding 的 NAV_PAT 同族，前端本地分组用） */
const isNavFinding = (f: MrDynFinding) => /(登录墙|重定向|跳转|导航|链接|入口|菜单|锚点)/i.test(`${f.title} ${f.detail}`);
/** G4-⑤：缺陷类发现（确定性故障信号） */
const isDefectFinding = (f: MrDynFinding) => /(http 5\d\d|http 4\d\d|控制台错误|空白页|白屏|崩溃|失败|报错)/i.test(`${f.title} ${f.detail}`);

/** G2a：initialIid——深链 '#/pr/<iid>' 直达详情（列表加载完成后自动选中）；未传时行为与旧版完全一致。
 *  onSelectIid——选中变化上报（iid/null），供 App 回写 hash；未传时为 no-op。 */
export function PrView({ initialIid, onSelectIid }: { initialIid?: number; onSelectIid?: (iid: number | null) => void }) {
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
  // G4-③：详情证据条（run 的截图 key / 录像 / trace / har）
  const [evi, setEvi] = useState<{ shots: string[]; video?: string; trace?: string; har?: string } | null>(null);
  // G4-⑤：导航类发现折叠开关
  const [navOpen, setNavOpen] = useState(false);

  // G4-③：详情打开（run_id 变化）时拉取证据清单——缩略图/录像/Trace/HAR 一条证据链
  useEffect(() => {
    const rid = sel?.run_id;
    if (!rid) { setEvi(null); return; }
    fetch(`/api/runs/${rid}/evidence`).then((r) => r.json()).then((d) => {
      if (!d.found) { setEvi(null); return; }
      const keys: string[] = (d.keys ?? []).map((k: { key: string }) => k.key);
      setEvi({
        shots: keys.filter((k) => k.includes('screenshot')).slice(0, 3),
        video: keys.find((k) => k.endsWith('.webm')),
        trace: keys.find((k) => k.includes('trace')),
        har: keys.find((k) => k.endsWith('.har')),
      });
    }).catch(() => setEvi(null));
  }, [sel?.run_id]);
  const eviUrl = (k: string) => (sel?.run_id ? `/api/runs/${sel.run_id}/evidence?key=${encodeURIComponent(k)}` : '#');

  const load = (state = tab) => fetch(`/api/mrs${state !== 'all' ? `?state=${state}` : ''}`)
    .then((r) => r.json()).then(setData).catch(() => undefined);

  const openDetail = (iid: number) => {
    setMsg('');
    // G2a：选中结果上报（onSelectIid 驱动 App 回写 hash；MR 不存在上报 null）
    fetch(`/api/mrs/${iid}`).then((r) => r.json()).then((d) => { if (d.found) { setSel(d as MrItem); onSelectIid?.(iid); } else onSelectIid?.(null); }).catch(() => undefined);
  };

  // G2a：深链 '#/pr/<iid>'——列表加载完成后自动选中该 MR（仅挂载时消费一次）；未传 initialIid 行为与旧版一致
  useEffect(() => {
    if (initialIid == null) { onSelectIid?.(null); load(); return; }
    load().then(() => openDetail(initialIid)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <button className="btn" onClick={() => { setSel(null); load(); onSelectIid?.(null); }}>← Pull Requests</button>
          <div className="big">{sel.title} <span className="chip p-gray">!{sel.iid}</span> <span className="chip p-blue">{stateLabel[sel.state] ?? sel.state}</span></div>
          <span className="hint">{sel.author} · {sel.repo} · <code className="mono">{sel.source_branch}</code> → <code className="mono">{sel.target_branch ?? 'main'}</code> · {sel.additions != null ? `+${sel.additions} −${sel.deletions ?? 0}` : ''}</span>
          <span className="sp" />
          <button className="btn" onClick={() => window.open(GITLAB_MR_BASE + sel.iid, '_blank')}>View on GitLab</button>
        </div>
        <div className="prdtabs">
          <span className="prtab on">Review</span>
          <span className="prtab" onClick={() => setMsg('Files changed：真实 diff 视图属 GitLab 集成范围（原型为示意）')}>Files changed</span>
          <span className="prtab" onClick={() => setMsg('Conversation：回写后含 VerifyOS Bot 报告评论')}>Conversation</span>
        </div>

        {rv && vm && (
          <>
            <div className={`banner ${vm.cls === 'ok' ? 'b-ok' : vm.cls === 'fail' ? 'b-fail' : 'b-warn'}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <b>{rv.verdict === 'pass' ? '验证全部通过' : rv.verdict === 'fail' ? '存在断言失败' : `发现 ${(rv.tests ?? []).filter((t) => t.status !== 'pass').length} 项无法验证 · ${(rv.areas ?? []).length} 个新发现`}</b>
              {/* G4-①：门禁模式 chip + 分档计划徽章 */}
              {rv.gateMode && <span className={`chip ${rv.gateMode === 'blocking' ? 'p-red' : 'p-blue'}`}>{rv.gateMode === 'blocking' ? '⛔ Blocking 门禁' : 'ℹ️ Reporting 非阻塞'}</span>}
              {rv.plan && <span className={`chip ${rv.plan === 'full' ? 'p-amber' : 'p-green'}`}>{rv.plan === 'full' ? 'Full 全量回归档' : 'Smoke 冒烟档'}</span>}
              <span className="hint" style={{ marginLeft: 6 }}>{rv.checkedAt}</span>
              {sel.run_id && <span className="hint" style={{ marginLeft: 'auto' }}>
                Run <code className="mono">{sel.run_id.slice(0, 12)}</code>
                <button className="btn" style={{ marginLeft: 8, padding: '2px 9px', fontSize: 11.5 }} onClick={() => window.open(`/#/runs/${sel.run_id}`, '_blank')}>▶ 查看回放</button>
              </span>}
            </div>
            {evi && evi.shots.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
                <span className="hint" style={{ fontSize: 11 }}>证据链：</span>
                {evi.shots.map((k) => (
                  <img key={k} src={eviUrl(k)} alt={k.split('/').pop()} title={k.split('/').pop()}
                    style={{ width: 92, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', cursor: 'zoom-in' }}
                    onClick={() => window.open(eviUrl(k), '_blank')} />
                ))}
                {evi.video && <button className="btn" style={{ padding: '2px 9px', fontSize: 11.5 }} onClick={() => window.open(eviUrl(evi.video!), '_blank')}>▶ 全程录像</button>}
                {evi.trace && <button className="btn" style={{ padding: '2px 9px', fontSize: 11.5 }} onClick={() => window.open(eviUrl(evi.trace!), '_blank')}>Trace</button>}
                {evi.har && <button className="btn" style={{ padding: '2px 9px', fontSize: 11.5 }} onClick={() => window.open(eviUrl(evi.har!), '_blank')}>HAR</button>}
              </div>
            )}
            <div className="gate">
              {rv.gateMode === 'reporting'
                ? <>非阻塞模式（reporting）：断言失败 → <b>仅提示不拦截</b> · 结论同步 GitLab/禅道供人判断</>
                : <>合并门禁：断言失败 → <b>阻止合并</b> · 无法验证 → <b>{rv.verdict === 'unknown' ? '警告（当前）' : '警告'}</b> · UNKNOWN ≠ PASS</>}
              <button className="btn" style={{ marginLeft: 'auto', padding: '2px 9px', fontSize: 11.5 }} onClick={() => setMsg('门禁模式在 apps/server/verifyos.config.yaml pr.gateMode 配置（blocking 阻拦 / reporting 仅提示）；分档由 pr.plan + fullTriggers 自动解析')}>调整策略</button>
            </div>
            {/* G4-②：三档计划条（当前档高亮，其余静态展示触发条件） */}
            <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
              {([
                ['smoke', 'PR Smoke 冒烟档', 'PR 默认档：登录 + 定向回归 + 动态探索（1-2 分钟）'],
                ['full', 'Full 全量回归档', 'release/* 分支或 full-regression 标签自动升级（resolvePlan）'],
                ['post', 'Post-merge 冒烟档', '合并后对主干再跑一次冒烟，持续守护主分支（规划中）'],
              ] as const).map(([k, label, desc]) => (
                <div key={k} className="sumcard" style={{ flex: 1, margin: 0, padding: '9px 12px', opacity: k === (rv.plan ?? 'smoke') ? 1 : 0.55, border: k === (rv.plan ?? 'smoke') ? '1.5px solid #16a34a' : undefined }}>
                  <b style={{ fontSize: 12 }}>{label}</b> {k === (rv.plan ?? 'smoke') && <span className="chip p-green">当前</span>}
                  <div className="hint" style={{ fontSize: 11, marginTop: 3 }}>{desc}</div>
                </div>
              ))}
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
                      {/* G4-④：覆盖标注（G3 annotateCoverage 产物） */}
                      {a.coveredBy && <span className="chip p-green" title={`该区域已被回归步骤覆盖：${a.coveredBy}`}>✓ 已回归覆盖 · {a.coveredBy}</span>}
                      {!a.coveredBy && a.uncoveredReason && <span className="chip p-gray" title={a.uncoveredReason}>未覆盖 · {a.uncoveredReason}</span>}
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
                {(() => {
                  // G4-⑤：defect/risk 置顶，navigational 折叠为「内部消化」语义（与 classifyFinding 同族启发式）
                  const action = rv.dynamicFindings!.filter((f) => !isNavFinding(f));
                  const nav = rv.dynamicFindings!.filter(isNavFinding);
                  return (
                    <>
                      {action.map((f, i) => (
                        <div key={i} className="area-row">
                          <TriangleAlert size={15} style={{ color: f.level === 'red' ? 'var(--red)' : 'var(--amber)', marginTop: 2, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ fontSize: 12.5 }}>{f.title}</b>{' '}
                            <span className={`chip ${isDefectFinding(f) ? 'p-red' : 'p-amber'}`}>{isDefectFinding(f) ? '缺陷' : '风险'}</span>
                            {(f.occurrences ?? 1) > 1 && <span className="chip p-blue" title="指纹去重：相似发现已合并（dedupeFindings）">合并 ×{f.occurrences}{f.confidence != null ? ` · 置信度 ${f.confidence.toFixed(2)}` : ''}</span>}
                            <div className="hint">{f.detail}
                              <button className="btn" style={{ marginLeft: 6, padding: '2px 9px', fontSize: 11.5 }} onClick={() => dynToQa(f, sel.iid)}><Sparkles size={10} /> 转 QA 点</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {nav.length > 0 && (
                        <div className="area-row">
                          <Globe size={15} style={{ color: 'var(--muted)', marginTop: 2, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ fontSize: 12.5 }}>{nav.length} 条导航/环境信息已内部消化</b>{' '}
                            <button className="btn" style={{ padding: '1px 8px', fontSize: 11 }} onClick={() => setNavOpen(!navOpen)}>{navOpen ? '收起' : '展开'}</button>
                            {navOpen && nav.map((f, i) => (
                              <div key={i} className="hint" style={{ marginTop: 3 }}>· <b>{f.title}</b> — {f.detail}</div>
                            ))}
                            {!navOpen && <div className="hint" style={{ marginTop: 2 }}>登录墙/跳转等导航噪音不进缺陷清单，需要时可展开</div>}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
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
                      <td style={{ width: 86, textAlign: 'right' }}>
                        {/* G4-⑥：每步直达回放（#/runs/<runId> 深链，G2a 通道） */}
                        {sel.run_id && <button className="btn" style={{ padding: '1px 8px', fontSize: 11 }} onClick={() => window.open(`/#/runs/${sel.run_id}`, '_blank')}>回放/证据</button>}
                      </td>
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
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn primary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => window.open(GITLAB_MR_BASE + sel.iid, '_blank')}>在 GitLab 中查看评论</button>
                  {(() => {
                    // G4-⑦：bot 文案提到禅道 bug #N 时给深链（zentao GET 路由最稳）
                    const mb = rv.bot.match(/bug #(\d+)/);
                    return mb ? <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => window.open(`${ZENTAO_BASE}/index.php?m=bug&f=view&bugID=${mb[1]}`, '_blank')}>在禅道中查看 bug #{mb[1]} ↗</button> : null;
                  })()}
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
