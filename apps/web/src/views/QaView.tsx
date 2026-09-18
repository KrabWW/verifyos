import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Zap, Wand2, Trash2, Check, TriangleAlert, X } from 'lucide-react';
import type { Route } from '../shared';

type QaItem = Record<string, unknown>;

// 推荐验证方式：category → chips 映射
const VERIFY_HINTS: Record<string, string[]> = {
  权限: ['断言+角色切换', '权限边界'],
  校验: ['表单校验断言'],
  边界: ['边界值断言'],
  并发: ['连点/fuzz'],
  正常流程: ['主流程断言'],
};
const hintFor = (category: unknown): string[] =>
  VERIFY_HINTS[String(category ?? '')] ?? ['定向回归'];

// ---------- QA 点库（真 PG；F5: 复选框批量生成验证；G08: 行点击详情抽屉；H03: 反馈闭环 + 动线 prop） ----------
export function QaView(props?: {
  onGoQaEditor?: (shortId: string) => void;
  onGoEditor?: () => void;
  onGo?: (r: Route) => void;
  /** U22：外部聚焦的 QA 点（编辑器 QA 来源跳回）→ 自动打开该抽屉 */
  focusQaId?: string | null;
  onFocusConsumed?: () => void;
}) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [query, setQuery] = useState('');
  const [batchMsg, setBatchMsg] = useState('');
  const [batchDone, setBatchDone] = useState(false);
  const [batching, setBatching] = useState(false);
  // U30：单条「生成验证」AI 起草中（LLM 10-40s），防重复点击
  const [genBusy, setGenBusy] = useState<string | null>(null);
  // U31：分页（修 QA 点库长列表不可滚动 bug —— 表格容器内部滚动 + 底部分页器）
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const PAGE_SIZE_OPTIONS = [20, 50, 100];
  const [drawer, setDrawer] = useState<QaItem | null>(null);
  // H03: 顶部错误条（红底白字，可关闭）+ 成功 toast（绿色，3s 自动消失）
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3000);
  };
  useEffect(() => () => { if (toastTimer.current !== null) window.clearTimeout(toastTimer.current); }, []);

  const load = () =>
    fetch('/api/qa-points')
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setLoaded(true); })
      .catch(() => { setLoaded(true); setErr('QA 点加载失败：API 服务不可用，请稍后点击「刷新」重试'); });
  useEffect(() => { load(); }, []);

  // U22：编辑器「QA 来源」跳回 → 自动打开该 QA 点抽屉
  useEffect(() => {
    if (!props?.focusQaId) return;
    const tryOpen = (attempt: number) => {
      setItems((current) => {
        const target = current.find((it) => String(it.short_id) === props.focusQaId);
        if (target) { setDrawer(target); props?.onFocusConsumed?.(); return current; }
        if (attempt > 0) { setTimeout(() => tryOpen(attempt - 1), 800); }
        return current;
      });
    };
    tryOpen(6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props?.focusQaId]);

  const riskCls = (r: unknown) => (r === 'high' ? 'high' : r === 'medium' ? 'medium' : 'low');
  const riskLabel = (r: unknown) => (r === 'high' ? '高' : r === 'medium' ? '中' : r === 'low' ? '低' : String(r ?? '-'));
  const filtered = items.filter((it) => {
    const riskOk = filterRisk === 'all' || it.risk === filterRisk;
    const q = query.trim().toLowerCase();
    const textOk = !q || String(it.title).toLowerCase().includes(q) || String(it.short_id).toLowerCase().includes(q);
    return riskOk && textOk;
  });
  // U31：分页派生数据（filtered 切片）——filter/搜索变化时重置回第 1 页
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );
  const setFilterRiskResettingPage = (v: 'all' | 'high' | 'medium' | 'low') => { setFilterRisk(v); setPage(1); };
  const toggle = (id: string) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectHighRisk = () => setSel(new Set(items.filter((it) => it.risk === 'high').map((it) => String(it.short_id))));
  // H03 P2: toggleAll 基于当前过滤集（filtered），而非全量 items
  const allFilteredSelected = filtered.length > 0 && filtered.every((it) => sel.has(String(it.short_id)));
  const toggleAll = () =>
    setSel(allFilteredSelected ? new Set() : new Set(filtered.map((it) => String(it.short_id))));

  const confirmQa = (shortId: unknown) => {
    fetch(`/api/qa-points/${shortId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'selected' }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { showToast(`✓ 已确认 QA 点 ${String(shortId)}`); load(); }
        else setErr(`确认 QA 点 ${String(shortId)} 失败，请重试`);
      })
      .catch(() => setErr(`确认 QA 点 ${String(shortId)} 失败：网络或服务异常`));
  };

  // U21 动线闭环：QA 点（测什么）→ 生成验证（怎么测）→ 跳编辑器微调 → 保存并运行（执行页看结果）
  // U30：单条生成默认走 AI 起草（LLM 按 QA 点场景出业务步骤，10-40 秒）；批量生成保持模板秒出
  const genVerify = (shortId: unknown) => {
    const key = String(shortId);
    if (genBusy) return;
    setGenBusy(key);
    showToast(`AI 起草中（${key}）——按场景生成业务步骤，约 10-40 秒…`);
    fetch('/api/verifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qaShortId: shortId, mode: 'ai' }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.shortId) {
          showToast(d.generatedBy === 'ai'
            ? `✓ 已生成验证 ${d.shortId}（AI 起草 ${d.steps?.length ?? 0} 步）——已带到执行页，可微调后「保存并运行」`
            : `✓ 已生成验证 ${d.shortId}（AI 不可用，模板生成 ${d.steps?.length ?? 0} 步）`);
          props?.onGoQaEditor?.(d.shortId);
        } else setErr(`验证生成失败（QA 点 ${key}）`);
      })
      .catch(() => setErr(`验证生成失败（QA 点 ${key}）：网络或服务异常`))
      .finally(() => setGenBusy(null));
  };

  const batchGen = () => {
    if (sel.size === 0) return;
    setBatching(true);
    setBatchDone(false);
    setErr('');
    setBatchMsg(`批量生成中（0/${sel.size}）…`);
    const ids = [...sel];
    const done: string[] = [];
    const failed: string[] = [];
    const step = (i: number) => {
      if (i >= ids.length) {
        setBatching(false);
        setBatchMsg(`✓ 批量完成：${done.length} 条生成${failed.length ? ` · ${failed.length} 条失败` : ''} —— ${done.join('、') || '无'}。到「验证编辑器」查看/运行。`);
        if (done.length > 0) {
          setBatchDone(true);
          showToast(`✓ 批量完成：${done.length} 条验证已生成`);
        }
        if (failed.length > 0) setErr(`批量生成有 ${failed.length} 条失败：${failed.join('、')}`);
        load();
        return;
      }
      fetch('/api/verifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qaShortId: ids[i] }) })
        .then((r) => r.json())
        .then((d) => { if (d.found) done.push(d.shortId); else failed.push(String(ids[i])); })
        .catch(() => failed.push(String(ids[i])))
        .finally(() => { setBatchMsg(`批量生成中（${i + 1}/${ids.length}）…`); step(i + 1); });
    };
    step(0);
  };

  // G08：来源依据——requirementRef / figmaRef / sourceUrl 任一存在则渲染 quote
  const srcRefs = (() => {
    const s = (drawer?.source ?? {}) as Record<string, unknown>;
    const out: Array<{ label: string; text: string }> = [];
    if (s.requirementRef) out.push({ label: '需求条目', text: String(s.requirementRef) });
    if (s.figmaRef) out.push({ label: 'Figma 节点', text: String(s.figmaRef) });
    if (s.sourceUrl) out.push({ label: '来源页面', text: String(s.sourceUrl) });
    return out;
  })();

  const delFromDrawer = (it: QaItem) => {
    if (!window.confirm(`确认删除 QA 点「${String(it.title)}」？该操作不可撤销。`)) return;
    fetch(`/api/qa-points/${String(it.short_id)}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then(() => { setDrawer(null); showToast('✓ 已删除 1 条 QA 点'); load(); })
      .catch(() => setErr(`删除 QA 点 ${String(it.short_id)} 失败：网络或服务异常`));
  };

  // U21：编辑 = 找到该 QA 点关联的验证（verification.qa_short_id）→ 跳编辑器预填选中
  const editQa = (it: QaItem) => {
    fetch('/api/verifications')
      .then((r) => r.json())
      .then((d) => {
        const linked = (d.items ?? []).find((v: Record<string, unknown>) => v.qa_short_id === String(it.short_id));
        if (linked) {
          props?.onGoQaEditor?.(String(linked.short_id));
        } else {
          showToast(`QA 点 ${String(it.short_id)} 还没有关联验证——点「生成验证」创建后再编辑`);
        }
      })
      .catch(() => setErr('验证列表加载失败：网络或服务异常'));
  };

  return (
    <div className="pageview">
      {/* H03 P1: 顶部错误条（红底白字，可关闭） */}
      {err && (
        <div style={{ background: 'var(--red)', color: '#fff', padding: '8px 14px', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
          <span style={{ flex: 1 }}><TriangleAlert size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />{err}</span>
          <button className="btn" style={{ padding: '1px 9px', fontSize: 11, color: '#fff', borderColor: 'rgba(255,255,255,.55)', background: 'transparent' }} onClick={() => setErr('')}><X size={11} /> 关闭</button>
        </div>
      )}
      <div className="sumcard" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', gap: 8, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>QA 点库（LLM 从探索结果提取 · PostgreSQL 持久化）</h4>
          <span className="sp" />
          <button className="btn" onClick={load}>刷新</button>
          <button className="btn" onClick={selectHighRisk}>只选 High Risk</button>
          <button className="btn primary" disabled={sel.size === 0 || batching} onClick={batchGen}><Zap size={11} /> 批量生成验证（{sel.size}）·模板秒出</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {/* U18: 筛选行同表格语言——色点+灰字，选中 ink 描边 */}
          {([['all', '全部', ''], ['high', '高', 'high'], ['medium', '中', 'medium'], ['low', '低', 'low']] as const).map(([v, label, s]) => (
            <span key={v} className="riskcell" style={{ cursor: 'pointer', opacity: filterRisk === 'all' || filterRisk === v ? 1 : .45, outline: filterRisk === v ? '2px solid var(--ink)' : 'none', outlineOffset: 2, borderRadius: 4, padding: '1px 4px' }} onClick={() => setFilterRiskResettingPage(v)}>{s && <i className={`r-${s}`} style={{ width: 7, height: 7, borderRadius: 50, background: s === 'high' ? 'var(--red)' : s === 'medium' ? 'var(--amber)' : '#94a3b8', display: 'inline-block' }} />}{label}</span>
          ))}
          <input className="inp" style={{ maxWidth: 200, marginLeft: 'auto', padding: '3px 9px', fontSize: 11.5 }} placeholder="搜索标题 / ID…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <span className="dim" style={{ fontSize: 10.5 }}>{filtered.length}/{items.length}</span>
        </div>
        {batchMsg && (
          <div className="hint" style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1 }}>{batchMsg}</span>
            {batchDone && props?.onGoEditor && (
              <button className="btn primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => props.onGoEditor?.()}>在执行页查看 →</button>
            )}
          </div>
        )}
        {/* U31：滚动容器（修不可滚动 bug）——maxHeight 让 46+ 行列表在视口内内部滚动，表头 sticky 吸顶 */}
        <div className="qa-tbl-wrap">
        <table className="tbl">
          <thead>
          <tr>
            <th style={{ width: 30 }}><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} title="全选/清空当前过滤集" /></th>
            <th>ID</th><th>标题</th><th>类别</th><th>风险</th><th>置信度</th><th>状态</th><th></th>
          </tr>
          </thead>
          <tbody>
          {loaded && filtered.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '26px 14px', textAlign: 'center' }}>
                {items.length === 0 ? (
                  // H03 P1: 空态文案完整 + 去探索动线（onGo 存在时渲染按钮）
                  <>
                    <div className="dim" style={{ fontSize: 13 }}>暂无 QA 点 —— 去「探索」跑一次，LLM 会自动从探索结果中生成候选 QA 点</div>
                    {props?.onGo && (
                      <button className="btn primary" style={{ marginTop: 10 }} onClick={() => props.onGo?.('explore')}><Compass size={11} /> 去探索</button>
                    )}
                  </>
                ) : (
                  <span className="dim">无符合当前筛选/搜索条件的 QA 点</span>
                )}
              </td>
            </tr>
          )}
          {pageItems.map((it) => {
            const id = String(it.short_id);
            return (
              <tr key={id} style={{ background: sel.has(id) ? 'var(--lime-bg)' : undefined, cursor: 'pointer' }} onClick={() => setDrawer(it)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} /></td>
                <td className="mono">{id}</td>
                <td><b>{String(it.title)}</b></td>
                <td><span className="chip">{String(it.category ?? '-')}</span></td>
                <td><span className={`riskcell ${riskCls(it.risk)}`}>{it.risk ? <i /> : null}{riskLabel(it.risk)}</span></td>
                <td className="mono">{it.confidence ? String(Number(it.confidence).toFixed(2)) : '-'}</td>
                <td><span className={`stcell${String(it.status) === 'discovered' ? ' st-action' : ''}`}>{String(it.status)}</span></td>
                <td onClick={(e) => e.stopPropagation()}><button className="btn" style={{ fontSize: 10.5 }} onClick={() => confirmQa(it.short_id)} disabled={it.status !== 'discovered'} title={it.status === 'discovered' ? '确认该 QA 点（状态机 discovered→selected）' : `已 ${String(it.status)}`}><Check size={10} /> 确认</button>{' '}<button className="btn" style={{ fontSize: 10.5 }} onClick={() => genVerify(it.short_id)} disabled={genBusy !== null} title={genBusy !== null ? 'AI 起草中，请稍候…' : 'AI 起草生成验证（10-40 秒）'}><Wand2 size={10} /> {genBusy === id ? 'AI 起草中…' : '生成验证'}</button></td>
              </tr>
            );
          })}
          </tbody>
        </table>
        </div>
        {/* U31：分页器 */}
        <div className="qa-pager">
          <span className="dim" style={{ fontSize: 10.5 }}>
            {total === 0 ? '0 条' : `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, total)} / ${total} 条`}
            {filterRisk !== 'all' && '（已按风险过滤）'}{query.trim() && '（已按关键词过滤）'}
          </span>
          <span className="sp" />
          <span className="dim" style={{ fontSize: 10.5 }}>每页</span>
          <select className="inp qa-pagesize" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn qa-pgbtn" disabled={safePage <= 1} onClick={() => setPage(1)}>«</button>
          <button className="btn qa-pgbtn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>上一页</button>
          <span className="mono dim" style={{ fontSize: 10.5 }}>{safePage} / {pageCount}</span>
          <button className="btn qa-pgbtn" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>下一页</button>
          <button className="btn qa-pgbtn" disabled={safePage >= pageCount} onClick={() => setPage(pageCount)}>»</button>
        </div>
      </div>

      {/* H03 P1: 成功 toast（绿色，3s 自动消失） */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--green)', color: '#fff', padding: '9px 18px', borderRadius: 8, fontSize: 12.5, zIndex: 90, boxShadow: '0 6px 18px rgba(0,0,0,.22)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* G08: QA 点详情抽屉（380px 右侧覆盖层 + 遮罩） */}
      {drawer && (
        <div className="qa-drawer-mask" onClick={() => setDrawer(null)}>
          <aside className="qa-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="qa-drawer-head">
              <h4 style={{ margin: 0, fontSize: 14 }}>{String(drawer.title)}</h4>
              <button className="btn" style={{ padding: '2px 8px' }} onClick={() => setDrawer(null)}>✕</button>
            </div>
            <div className="qa-drawer-body">
              <div className="kv"><span>类别</span><b>{String(drawer.category ?? '-')}</b></div>
              <div className="kv"><span>风险</span><b>{String(drawer.risk ?? '-')}</b></div>
              <div className="kv"><span>状态</span><b>{String(drawer.status)}</b></div>
              <div className="kv"><span>置信度</span><b className="mono">{drawer.confidence ? String(Number(drawer.confidence).toFixed(2)) : '-'}</b></div>
              <div style={{ marginTop: 14 }}>
                <div className="dim" style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>来源依据</div>
                {srcRefs.length > 0 ? (
                  srcRefs.map((r) => (
                    <blockquote key={r.label} className="qa-drawer-quote">
                      <span className="dim" style={{ fontSize: 10 }}>{r.label}</span>
                      <div className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{r.text}</div>
                    </blockquote>
                  ))
                ) : (
                  <p className="dim" style={{ fontSize: 11.5, margin: 0 }}>无来源引用</p>
                )}
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="dim" style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>推荐验证方式</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {hintFor(drawer.category).map((h) => <span key={h} className="chip p-indigo">{h}</span>)}
                </div>
              </div>
            </div>
            <div className="qa-drawer-foot">
              <button className="btn primary" disabled={genBusy !== null} onClick={() => genVerify(drawer.short_id)}><Wand2 size={11} /> {genBusy === String(drawer.short_id) ? 'AI 起草中…（10-40s）' : '生成验证（AI 起草）'}</button>
              <button className="btn" onClick={() => editQa(drawer)}>编辑</button>
              <button className="btn" style={{ color: 'var(--red)' }} onClick={() => delFromDrawer(drawer)}><Trash2 size={11} /> 删除</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
