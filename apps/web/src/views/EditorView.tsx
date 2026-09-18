import { useEffect, useRef, useState } from 'react';
import { Play, SquareStack } from 'lucide-react';
import { StepEditor } from './StepEditor';

// ---------- F6：验证编辑器（步骤 CRUD + 保存/运行 + 缓存·自愈说明，真 PG） ----------
interface EditorAction { type: 'goto' | 'fill' | 'click'; selector?: string; value?: string }
type AssertKind = 'url_contains' | 'text_visible' | 'element_visible';
interface EditorStep {
  id: string;
  title: string;
  kind: 'module' | 'ai' | 'assertion' | 'deterministic';
  actions?: EditorAction[];
  instruction?: string;
  assert?: { kind: AssertKind; value: string };
  targetRef?: string;
}
interface VerRow {
  id: number; short_id: string; title: string; actor: string; status: string;
  steps: EditorStep[]; qa_short_id: string | null; qa_title: string | null;
}

export function EditorView({ onOpenRun, focusVerId, onFocusConsumed, onGoQa }: { onOpenRun: () => void; focusVerId?: string | null; onFocusConsumed?: () => void; onGoQa?: (qaShortId: string) => void }) {
  const [items, setItems] = useState<VerRow[]>([]);
  const [draft, setDraft] = useState<VerRow | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  // G12：AI Resolution 自愈卡——本地 toast 式提示（引擎自愈事件接入后走真数据）
  const [healMsg, setHealMsg] = useState('');
  const healTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastHeal = (m: string) => {
    setHealMsg(m);
    if (healTimer.current) clearTimeout(healTimer.current);
    healTimer.current = setTimeout(() => setHealMsg(''), 2600);
  };

  // ---- L 系补全：编辑器内嵌试运行（浏览器预览反馈回路） ----
  // upto=下标（含）跑段试运行；不传=全部。同步返回（ai 步 LLM 规划 20-40s 属正常）。
  interface DryStep { id: string; title?: string; verdict: string; durationMs: number; llmCalls: number; selector?: string }
  interface DryResult { runId: string; verdict: string; durationMs: number; stepResults: DryStep[]; screenshots: string[]; failureSummary?: string }
  const [dryBusy, setDryBusy] = useState<'all' | number | null>(null);
  const [dry, setDry] = useState<DryResult | null>(null);
  const dryRun = (upto?: number) => {
    if (!draft || dryBusy !== null) return;
    setDryBusy(upto ?? 'all');
    fetch('/api/runs/dry-run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: draft.steps, actor: draft.actor, ...(upto !== undefined ? { upto } : {}) }),
    })
      .then((r) => r.json())
      .then((d: DryResult & { error?: string }) => {
        if (d.error) { setMsg(`试运行失败：${d.error}`); setDry(null); }
        else setDry(d);
      })
      .catch(() => setMsg('试运行失败（网络）'))
      .finally(() => setDryBusy(null));
  };
  const dryShot = dry?.screenshots?.[dry.screenshots.length - 1];
  const dryShotUrl = dry && dryShot ? `/api/runs/${dry.runId}/evidence?key=${encodeURIComponent(dryShot)}` : '';

  // U21+U23：初载一次性处理聚焦——fetch 完成后按 focusVerId 优先选中，选中（或确认不存在）才消费，
  // 消除「items 未加载时 focus 被提前消费导致永远停在第一条」的竞态
  useEffect(() => {
    fetch('/api/verifications').then((r) => r.json()).then((d) => {
      const rows: VerRow[] = d.items ?? [];
      setItems(rows);
      const focused = focusVerId ? rows.find((v) => v.short_id === focusVerId) : undefined;
      if (focused) {
        setDraft(focused);
        setDirty(false);
        setMsg(`已带入验证 ${focused.short_id}——改完步骤点「保存并运行」`);
      } else if (rows.length > 0) {
        setDraft(rows[0]);
      }
      if (focusVerId) onFocusConsumed?.();
    }).catch(() => setMsg('加载失败（后端未就绪）'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => fetch('/api/verifications').then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => undefined);

  const confirmDrop = () => !dirty || window.confirm('有未保存修改，切换将丢弃，确定？');

  const select = (v: VerRow) => {
    if (!confirmDrop()) return;
    setDraft(v); setDirty(false); setMsg('');
  };

  const createBlank = () => {
    if (!confirmDrop()) return;
    fetch('/api/verifications/blank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.json())
      .then((d) => {
        setDraft({ id: d.id, short_id: d.shortId, title: '手工验证', actor: '管理员', status: 'draft', steps: d.steps, qa_short_id: 'qa_manual', qa_title: '手工创建（验证编辑器入口）' });
        setDirty(true); setMsg(`✓ 已创建 ${d.shortId}（预填登录 + 断言，改完点「保存」）`);
        refresh();
      })
      .catch(() => setMsg('创建失败'));
  };

  // ---- 步骤操作（不可变更新，任何改动置 dirty） ----
  const patchSteps = (fn: (ss: EditorStep[]) => EditorStep[]) => {
    setDraft((d) => (d ? { ...d, steps: fn([...(d.steps ?? [])]) } : d));
    setDirty(true);
  };
  const moveStep = (i: number, dir: -1 | 1) => patchSteps((ss) => {
    const j = i + dir;
    if (j < 0 || j >= ss.length) return ss;
    [ss[i], ss[j]] = [ss[j], ss[i]];
    return ss;
  });
  const delStep = (i: number) => patchSteps((ss) => { ss.splice(i, 1); return ss; });
  const addStep = () => patchSteps((ss) => {
    ss.push({ id: `st_${Date.now().toString(36)}`, title: `新步骤 ${ss.length + 1}`, kind: 'ai', instruction: '' });
    return ss;
  });
  const patchStep = (i: number, p: Partial<EditorStep>) => patchSteps((ss) => { ss[i] = { ...ss[i], ...p }; return ss; });

  const stepsList = draft?.steps ?? [];
  const aiCount = stepsList.filter((s) => s.kind === 'ai').length;

  const save = (): Promise<boolean> => {
    if (!draft) return Promise.resolve(false);
    setSaving(true);
    return fetch(`/api/verifications/${draft.id}/steps`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: draft.title, actor: draft.actor, steps: draft.steps }),
    })
      .then((r) => r.json())
      .then((d) => {
        setSaving(false);
        if (d.ok) { setDirty(false); setDraft({ ...draft, status: 'ready' }); setMsg('✓ 已保存（status → ready）'); refresh(); return true; }
        setMsg(`保存失败：${d.reason ?? '未知'}`);
        return false;
      })
      .catch(() => { setSaving(false); setMsg('保存失败（网络）'); return false; });
  };

  const saveRun = () => {
    save().then((ok) => {
      if (!ok || !draft) return;
      fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steps: draft.steps, verificationShortId: draft.short_id, actor: draft.actor }) })
        .then((r) => r.json())
        .then(() => onOpenRun())
        .catch(() => setMsg('触发失败'));
    });
  };

  return (
    <div className="pageview">
      <div className="pluggrid">
        {/* 左：编辑区 */}
        <div className="sumcard">
          {!draft ? (
            <p className="dim" style={{ padding: '20px 0', textAlign: 'center' }}>暂无验证 —— 点右侧「＋ 空白验证」创建，或到「QA 点」页从 QA 点生成</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>验证草稿 <b className="mono">{draft.short_id}</b></h4>
                <span className={`chip ${draft.status === 'ready' ? 'p-green' : 'p-amber'}`}>{draft.status}</span>
                {dirty && <span className="chip p-amber">● 未保存</span>}
                <span className="sp" />
                <button className="btn" disabled={saving || !dirty} onClick={save}>保存</button>
                <button className="btn primary" disabled={saving} onClick={saveRun}><Play size={11} /> 保存并运行</button>
              </div>
              <div className="formrow"><label>标题</label><input className="inp" value={draft.title} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setDirty(true); }} /></div>
              <div className="formrow"><label>角色 actor</label><input className="inp" style={{ maxWidth: 170 }} value={draft.actor} onChange={(e) => { setDraft({ ...draft, actor: e.target.value }); setDirty(true); }} /><span className="hint" style={{ marginTop: 0 }}>运行时按角色解析凭据（凭据库绑定）</span></div>

              <h4>步骤（{stepsList.length}）</h4>
              {stepsList.map((s, i) => (
                <div key={s.id} className="stepedit">
                  <div className="stephead">
                    <b>{String(i + 1).padStart(2, '0')}</b>
                    <input style={{ flex: 1 }} value={s.title} onChange={(e) => patchStep(i, { title: e.target.value })} />
                    <select value={s.kind} onChange={(e) => patchStep(i, { kind: e.target.value as EditorStep['kind'] })}>
                      <option value="module">module · 确定性动作</option>
                      <option value="ai">ai · LLM 自主操作</option>
                      <option value="assertion">assertion · 断言</option>
                      <option value="deterministic">deterministic · 脚本</option>
                    </select>
                    <button className="iconbtn" title="上移" disabled={i === 0} onClick={() => moveStep(i, -1)}>↑</button>
                    <button className="iconbtn" title="下移" disabled={i === stepsList.length - 1} onClick={() => moveStep(i, 1)}>↓</button>
                    <button className="iconbtn" title="试运行到该步骤（浏览器预览效果）" disabled={dryBusy !== null} onClick={() => dryRun(i)}>{dryBusy === i ? '…' : '▶'}</button>
                    <button className="iconbtn" title="删除步骤" onClick={() => delStep(i)}>✕</button>
                  </div>
                  {/* U25：与执行页共用 StepEditor——单一事实来源 */}
                  <StepEditor step={s as never} onChange={(p) => patchStep(i, p as Partial<EditorStep>)} />
                </div>
              ))}
              <button className="btn" onClick={addStep}>＋ 添加步骤</button>
              {msg && <p className="dim" style={{ marginTop: 8, fontSize: 11.5 }}>{msg}</p>}
            </>
          )}
        </div>

        {/* 右：试运行预览 + 验证列表 + 信息卡 */}
        <div>
          {/* L 系补全：编辑器内嵌浏览器试运行——编辑即所见，不用跳执行页才知道效果 */}
          <div className="sumcard">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}><SquareStack size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />试运行预览</h4>
              <span className="sp" />
              <button
                className="btn primary"
                style={{ fontSize: 11 }}
                disabled={dryBusy !== null || !draft || stepsList.length === 0}
                title="真实浏览器跑到最后一步，返回每步截图与结果（ai 步含 LLM 规划 20-40s）"
                onClick={() => dryRun()}
              >{dryBusy === 'all' ? '试运行中…' : <><Play size={10} /> 试运行全部</>}</button>
            </div>
            <p className="hint" style={{ marginTop: 0 }}>每步行内「▶」= 只跑到该步（从登录开始）。ai 步定位到的 selector 会写入定位缓存，正式运行零 LLM 重放。</p>
            <div className="brow" style={{ boxShadow: 'none' }}>
              <div className="browbar">
                <span className="bdot" /><span className="bdot" /><span className="bdot" />
                <span className="browurl mono">{dry ? `试运行 ${dry.runId}` : '点击「试运行」查看浏览器实际效果'}</span>
              </div>
              <div className="browbody" style={{ minHeight: 150 }}>
                {dryShotUrl ? (
                  <img className="shot" src={dryShotUrl} alt="试运行截图" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="browempty"><Play size={16} /><span>{dryBusy !== null ? '浏览器执行中…' : '尚无试运行结果'}</span></div>
                )}
              </div>
            </div>
            {dry && (
              <div style={{ marginTop: 8 }}>
                <div className="kv"><span>判定</span><b className={`mono ${dry.verdict === 'pass' ? '' : ''}`} style={{ color: dry.verdict === 'pass' ? 'var(--green)' : dry.verdict === 'fail' ? 'var(--red)' : 'var(--amber)' }}>{dry.verdict.toUpperCase()} · {(dry.durationMs / 1000).toFixed(1)}s</b></div>
                {dry.stepResults.map((r) => (
                  <div key={r.id} className="kv">
                    <span><span className="riskcell" style={{ display: 'inline-flex', marginRight: 6 }}><i style={{ width: 7, height: 7, borderRadius: 50, display: 'inline-block', background: r.verdict === 'pass' ? 'var(--green)' : 'var(--red)' }} /></span>{r.title ?? r.id}{r.llmCalls > 0 ? <span className="dim">（LLM {r.llmCalls}）</span> : null}</span>
                    <b className="mono" style={{ fontSize: 10.5, wordBreak: 'break-all', textAlign: 'right' }}>{r.selector ? <span title="已写入定位缓存——正式运行零 LLM 重放" style={{ color: 'var(--lime-deep)' }}>{r.selector}</span> : `${(r.durationMs / 1000).toFixed(1)}s`}</b>
                  </div>
                ))}
                {dry.failureSummary && <p className="hint" style={{ color: 'var(--red)', marginTop: 6 }}>{dry.failureSummary}</p>}
              </div>
            )}
          </div>

          <div className="sumcard">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>验证列表（{items.length}）</h4>
              <span className="sp" />
              <button className="btn" onClick={refresh}>刷新</button>
              <button className="btn primary" style={{ marginLeft: 6 }} onClick={createBlank}>＋ 空白验证</button>
            </div>
            {items.length === 0 && <p className="dim" style={{ marginTop: 8 }}>暂无 —— 到「QA 点」生成，或点「＋ 空白验证」</p>}
            <div className="verlist">
              {items.map((v) => (
                <div key={v.id} className={`verrow${draft?.id === v.id ? ' on' : ''}`} onClick={() => select(v)}>
                  <span className={`dot ${v.status === 'ready' ? 'ok' : 'idle'}`} style={{ width: 16, height: 16, fontSize: 9 }}>{v.status === 'ready' ? '✓' : '·'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 12 }}>{v.title}</b>
                    <div className="dim" style={{ fontSize: 10.5 }}><span className="mono">{v.short_id}</span> · {v.actor} · {(v.steps ?? []).length} 步</div>
                  </div>
                  {v.qa_short_id && <span className="chip" title={v.qa_title ?? ''}>{v.qa_short_id === 'qa_manual' ? '手工' : v.qa_short_id}</span>}
                </div>
              ))}
            </div>
          </div>

          {draft && (
            <>
              <div className="sumcard">
                <h4>验证信息</h4>
                <div className="kv"><span>QA 来源</span><b>{draft.qa_short_id ? (draft.qa_short_id === 'qa_manual' ? '手工锚点 qa_manual' : <span className="mono chainnode link" style={{ cursor: 'pointer' }} title="跳到 QA 点页查看这条 QA 点" onClick={() => onGoQa?.(draft.qa_short_id!)}>{draft.qa_short_id}</span>) : '—'}</b></div>
                <div className="kv"><span>actor</span><b>{draft.actor}（凭据角色绑定）</b></div>
                <div className="kv"><span>步骤</span><b className="mono">{stepsList.length}</b></div>
                <div className="kv"><span>预估 LLM（首跑）</span><b className="mono">{aiCount} 次（ai 步 {aiCount} · 其余 0）</b></div>
              </div>
              <div className="sumcard">
                <h4>执行成本 · 定位缓存 · 自愈</h4>
                <div className="kv"><span>首跑</span><b>ai 步经 glm-4.5v 定位 → 写缓存</b></div>
                <div className="kv"><span>回放</span><b>命中缓存零 LLM · 秒级</b></div>
                <div className="kv"><span>未命中自愈</span><b>AI 重新定位（+1 次调用）</b></div>
                <p className="hint">引擎当前未暴露 selector 级缓存明细；缓存命中状态可在执行页 Action Log（cache=hit 高亮行）查看，自愈候选交互见下方「AI Resolution 自愈」卡。</p>
              </div>
              {/* G12：AI Resolution 自愈卡（静态示例 + 诚实标注） */}
              <div className="sumcard">
                <h4>AI Resolution 自愈</h4>
                <div className="kv"><span>期望元素</span><b className="mono">#btn-save（旧 selector 失效）</b></div>
                <div className="kv"><span>候选 1</span><b className="mono">[data-test=save-btn] · 92%</b></div>
                <div className="kv"><span>候选 2</span><b className="mono">button.save primary · 74%</b></div>
                <div className="kv"><span>语义匹配度</span><b className="mono" style={{ color: 'var(--green)' }}>92%（glm-4.5v 视觉+语义）</b></div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="btn primary" style={{ fontSize: 11 }} onClick={() => toastHeal('✓ 接受已记录——引擎自愈事件接入后写回 LocatorCache 生效')}>接受写回缓存</button>
                  <button className="btn" style={{ fontSize: 11 }} onClick={() => toastHeal('✕ 已拒绝——引擎自愈事件接入后生效')}>拒绝</button>
                </div>
                {healMsg && <p className="hint" style={{ color: 'var(--lime-deep)', marginTop: 6 }}>{healMsg}</p>}
                <p className="hint" style={{ marginTop: 6 }}>LocatorCache 引擎事件接入后此卡实时显示真实自愈流</p>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 2 }}>
        设计判断：<b>验证 = 可编辑的步骤序列</b>，而非黑盒脚本——QA 点生成后人工微调、空白起步手工编写，同一保存 / 运行 / 防假绿语义（PRD §5.3）。
      </p>
    </div>
  );
}
