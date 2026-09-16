import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Bot, Compass, Target, ScrollText, Zap, UserRound, Pause, Play, Square, CircleCheck } from 'lucide-react';
import './explore.css'; // L5: 探索实时浏览舞台样式（独立文件，不混入 styles.css）

// ---------- F4: 探索工作台（路径树 + Agent 卡 + Intent Score + 人工接管 + Live Findings，对齐原型 s-explore） ----------
interface ExpFinding { level: 'red' | 'amber' | 'yellow'; title: string; detail: string }
interface TreeNodeRow { url: string; title: string; depth: number; interactive: number }
interface IntentRow { name: string; score: number }

export function ExploreView({ seedUrl, onGoMap, onGoQa }: { seedUrl?: string; onGoMap?: () => void; onGoQa?: () => void }) {
  const [startUrl, setStartUrl] = useState(seedUrl ?? '');
  const [intent, setIntent] = useState('员工管理：列表查看、详情查看，关注权限与输入校验');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('test123');
  const [maxDepth, setMaxDepth] = useState('3');
  const [maxActions, setMaxActions] = useState('12');
  const [browserMode, setBrowserMode] = useState<'headless' | 'headful'>('headless');
  const [cdp, setCdp] = useState<{ available: boolean; endpoint: string | null } | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');
  const [doneCta, setDoneCta] = useState(false); // H01 P1: 本次探索自然完成（done），显示完成 CTA 横幅
  const [tree, setTree] = useState<TreeNodeRow[]>([]);
  const [cur, setCur] = useState<{ url?: string; title?: string; interactive?: number }>({});
  const [activity, setActivity] = useState<Array<{ ts: string; message: string }>>([]);
  const [findings, setFindings] = useState<ExpFinding[]>([]);
  const [shot, setShot] = useState<{ key: string; ts: number } | null>(null); // L5: 最新截图（key 变化才重载，ts 作缓存穿透）
  const [intentRows, setIntentRows] = useState<IntentRow[]>([]);
  const [msg, setMsg] = useState('');
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  // 初载：Coverage Graph 真数据 → 路径树 + Intent Score（上次探索落库结果）
  const loadGraph = () => fetch('/api/graph').then((r) => r.json()).then((d) => {
    if (!d.found) return;
    const nodes = (d.nodes ?? []) as Array<{ type: string; ref: string; title: string | null; meta?: Record<string, unknown> }>;
    const pages = nodes.filter((n) => n.type === 'page');
    // H01 P2: 同 URL 重复节点合并展示（graph 历史落库可能同页多节点；交互数取并集≈最大值）
    const byUrl = new Map<string, { url: string; title: string; depth: number; interactive: number; intentScore?: number }>();
    for (const n of pages) {
      const row = byUrl.get(n.ref);
      const iv = Number(n.meta?.interactive ?? 0);
      const depth = Number(n.meta?.depth ?? 0);
      if (row) {
        row.interactive = Math.max(row.interactive, iv);
        row.depth = Math.min(row.depth, depth);
        if (n.meta?.intentScore != null) row.intentScore = Number(n.meta.intentScore);
        if (!row.title || row.title === row.url) row.title = (n.title ?? n.ref).slice(0, 40);
      } else {
        byUrl.set(n.ref, {
          url: n.ref, title: (n.title ?? n.ref).slice(0, 40), depth, interactive: iv,
          intentScore: n.meta?.intentScore != null ? Number(n.meta.intentScore) : undefined,
        });
      }
    }
    const merged = [...byUrl.values()];
    setTree(merged.map(({ intentScore: _is, ...r }) => r));
    setIntentRows(merged
      .filter((n) => n.intentScore != null)
      .map((n) => ({ name: n.title.slice(0, 12), score: n.intentScore as number }))
      .sort((a, b) => b.score - a.score).slice(0, 5));
  }).catch(() => undefined);
  useEffect(() => { loadGraph(); }, []);

  const pushAct = (message: string) => setActivity((prev) => [{ ts: new Date().toTimeString().slice(0, 5), message }, ...prev].slice(0, 40));

  // L5: 更新截图流（key 变化才刷新 <img>，避免同 key 重载闪跳）
  const updateShot = (key: string) => setShot((prev) => (prev?.key === key ? prev : { key, ts: Date.now() }));

  // L5: 3s 轮询 control 补帧——WS 断帧/断线重连期间截图流仍能跟上（latestShotKey 未变化则跳过）
  useEffect(() => {
    if (!(status === 'running' || status === 'paused')) return;
    const t = setInterval(() => {
      fetch('/api/explore/control').then((r) => r.json()).then((d) => {
        if (d.latestShotKey) updateShot(d.latestShotKey);
      }).catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [status]);

  const start = () => {
    setStatus('running');
    setDoneCta(false);
    setTree([]); setFindings([]); setActivity([]); setMsg(''); setShot(null);
    pushAct(`探索任务启动（目标：${intent || '未指定'}）`);
    const socket = io({ path: '/ws' });
    socketRef.current = socket;
    socket.on('explore.event', (e: { phase: string; message: string; currentUrl?: string; pageTitle?: string; depth?: number; interactive?: number; linkCount?: number; finding?: ExpFinding; shotKey?: string }) => {
      // L5: 截图流——任何带 shotKey 的事件都刷新舞台；接管期画面事件（无 currentUrl/pageTitle）不刷 activity 防刷屏
      if (e.shotKey) updateShot(e.shotKey);
      const shotOnly = !!e.shotKey && !e.currentUrl && !e.pageTitle;
      if (!shotOnly) pushAct(e.message);
      if (e.finding) setFindings((prev) => [e.finding as ExpFinding, ...prev].slice(0, 6));
      if (e.currentUrl) {
        setCur({ url: e.currentUrl, title: e.pageTitle, interactive: e.interactive });
        setTree((prev) => {
          if (prev.some((t) => t.url === e.currentUrl)) return prev.map((t) => (t.url === e.currentUrl ? { ...t, interactive: e.interactive ?? t.interactive } : t));
          return [...prev, { url: e.currentUrl!, title: (e.pageTitle ?? e.currentUrl!).slice(0, 40), depth: e.depth ?? 0, interactive: e.interactive ?? 0 }];
        });
      }
      if (e.phase === 'done' || e.phase === 'error') {
        setStatus('done');
        socket.disconnect();
        loadGraph();
        if (e.phase === 'done') { setDoneCta(true); setMsg('✓ 探索完成——QA 点候选已落库，到「QA 点」页确认'); }
        else setMsg(`探索出错：${e.message}`);
      }
    });
    // H01 P0: 深度/最大页数/Headless 三参数贯通（字段名与 server explore.controller.ts 对齐）
    fetch('/api/explore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrl: startUrl || undefined, intent, credential: { username, password },
        maxDepth: Number(maxDepth), maxActions: Number(maxActions), headful: browserMode === 'headful',
      }),
    }).catch(() => { setStatus('done'); setMsg('提交失败（网络）'); });
  };

  const pause = (on: boolean) => fetch('/api/explore/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) })
    .then(() => { setStatus(on ? 'paused' : 'running'); setMsg(on ? '已暂停，可随时继续' : '已继续'); })
    .catch(() => setMsg('控制失败'));

  // G10: 我来操作 = 暂停 Agent + 读取 CDP 接入点（headful 时可用 chrome://inspect 直连）
  const takeOver = () => {
    pause(true);
    setCdp(null);
    fetch('/api/explore/cdp').then((r) => r.json())
      .then((d) => setCdp({ available: !!d.available, endpoint: d.endpoint ?? null }))
      .catch(() => setCdp({ available: false, endpoint: null }));
  };

  const stop = () => fetch('/api/explore/stop', { method: 'POST' })
    .then(() => { setStatus('done'); setMsg('已停止——已爬页面照常落库'); })
    .catch(() => setMsg('停止失败'));

  const addQa = (f: ExpFinding) => fetch('/api/qa-points/from-finding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: f.title, risk: f.level === 'red' ? 'high' : 'medium', detail: f.detail }) })
    .then((r) => r.json())
    .then((d) => setMsg(d.deduped ? `「${f.title}」已在 QA 点库（去重）` : `✓ 已加入 QA 点 ${d.shortId}（discovered——到「QA 点」页确认）`))
    .catch(() => setMsg('加入失败'));

  const running = status === 'running' || status === 'paused';
  const totalActs = tree.reduce((a, t) => a + t.interactive, 0);

  return (
    <div className="pageview">
      {/* 顶栏：目标 + 参数 + 状态 + 接管控制（原型 exbar） */}
      <div className="exbar">
        <input className="goal" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="探索目标（业务意图）" />
        <input className="inp" style={{ maxWidth: 200 }} value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="起始 URL（留空=内置演示站）" />
        <input className="inp" style={{ maxWidth: 90 }} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
        <input className="inp" style={{ maxWidth: 90 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
        <select className="inp exsel" value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)} title="BFS 探索深度">
          <option value="3">深度 3</option>
          <option value="5">深度 5</option>
        </select>
        <select className="inp exsel" value={maxActions} onChange={(e) => setMaxActions(e.target.value)} title="本次探索最多爬取的页面数">
          <option value="12">最大页数 12</option>
          <option value="100">最大页数 100</option>
          <option value="200">最大页数 200</option>
        </select>
        <select className="inp exsel" value={browserMode} onChange={(e) => setBrowserMode(e.target.value as 'headless' | 'headful')} title="Headful 模式支持 chrome://inspect 人工接管">
          <option value="headless">Headless</option>
          <option value="headful">Headful（可接管）</option>
        </select>
        <span className={`chip ${running ? 'p-blue' : 'p-gray'}`}>{status === 'running' ? `探索中 · ${tree.length} 页面 · ${totalActs} 交互` : status === 'paused' ? '已暂停' : status === 'done' ? `已完成 · ${tree.length} 页面` : '未开始'}</span>
        <span className="sp" />
        {running && <button className="btn" onClick={() => pause(status === 'paused' ? false : true)}>{status === 'paused' ? <Play size={11} /> : <Pause size={11} />} {status === 'paused' ? '继续' : '暂停'}</button>}
        {running && <button className="btn" onClick={takeOver}><UserRound size={11} /> 我来操作</button>}
        {running && <button className="btn" style={{ color: 'var(--red)' }} onClick={stop}><Square size={11} /> 停止</button>}
        {!running && <button className="btn primary" onClick={start}><Play size={11} /> 开始探索</button>}
      </div>

      {/* 人工接管横幅（原型 takeover-banner；G10: CDP 接入指引真实化） */}
      {status === 'paused' && (
        <div className="takeover-banner">
          <UserRound size={14} style={{ flexShrink: 0 }} /> <b>人工接管模式</b> — Agent 已暂停。可在被测系统内完成登录 / 验证码 / 切换租户等操作后交还——<b>你访问过的页面会自动并入探索队列</b>，Agent 将从你停下的位置继续。
          <span className="sp" />
          <button className="btn primary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => pause(false)}>↩ 交还给 Agent</button>
          {cdp?.available && cdp.endpoint ? (
            <span className="hint" style={{ width: '100%' }}>
              Headful 模式接入方式：本地 Chrome 打开 <code className="cdp-hint">chrome://inspect</code> → Configure → 添加 <code className="cdp-hint">{cdp.endpoint}</code> → inspect 即可接管被测页面。
            </span>
          ) : (
            <span className="hint" style={{ width: '100%' }}>
              本次探索以 Headless 模式运行，无法直连浏览器（<code className="cdp-hint">/api/explore/cdp</code> available=false）。如需真正手动控制被测页面：在顶栏选「Headful（可接管）」后重新开始探索——本次会话已用 headless 启动，须下次探索生效；届时点「我来操作」将给出 chrome://inspect 接入指引。
            </span>
          )}
        </div>
      )}

      {/* H01 P1: 探索完成 CTA 横幅（done 转换后显示；stop/手动停止不触发） */}
      {status === 'done' && doneCta && (
        <div className="takeover-banner">
          ✓ <b>探索完成</b> · {tree.length} 页面 {totalActs} 交互 — QA 点候选已落库，可进入下游确认。
          <span className="sp" />
          <button className="btn primary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => (onGoMap ? onGoMap() : setMsg('「应用地图」跳转暂未接线（App 未注入 onGoMap 可选 prop）'))}>查看应用地图 →</button>
          <button className="btn primary" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => (onGoQa ? onGoQa() : setMsg('「QA 点」跳转暂未接线（App 未注入 onGoQa 可选 prop）'))}>去 QA 点 →</button>
        </div>
      )}

      {/* 三列工作台（原型 exgrid） */}
      <div className="exgrid">
        <div className="excol">
          <h4><Compass size={12} /> 探索路径</h4>
          <div className="ptree">
            {tree.length === 0 && <p className="dim" style={{ fontSize: 11.5 }}>暂无——开始探索后实时生长；历史路径来自上次探索落库。</p>}
            {tree.map((n) => {
              const isCur = cur.url === n.url && running;
              return (
                <div key={n.url} className={`node${isCur ? ' cur' : ''}${n.depth > 0 ? ` ind${Math.min(n.depth, 2)}` : ''}`}>
                  {/* U1: 已访问=细线勾（低饱和不抢焦点）；当前=唯一实心点（pulse） */}
                  {isCur ? <span className="pathdot cur" /> : <CircleCheck size={12} strokeWidth={2.2} style={{ color: 'var(--green)', opacity: .65, flexShrink: 0 }} />}
                  <span className="u">{n.title || n.url}</span>
                  {n.interactive > 0 && <span className="hint" style={{ marginLeft: 'auto', fontSize: 10 }}>{n.interactive} 交互</span>}
                  {isCur && <span className="hint" style={{ fontSize: 10 }}>当前</span>}
                </div>
              );
            })}
          </div>
          <div className="divider" style={{ borderTop: '1px solid var(--border)', margin: '10px 0' }} />
          <div className="kv"><span>已发现</span><b>{tree.length} 页面 · {totalActs} 交互</b></div>
        </div>

        <div className="excol">
          <div className="brow">
            <div className="browbar">
              <span className="bdot" /><span className="bdot" /><span className="bdot" />
              <div className="browurl">{cur.url ?? '等待探索开始…'}</div>
              <span className={`chip ${running ? 'p-blue' : 'p-gray'}`} style={{ fontSize: 10.5 }}>{status === 'paused' ? '已暂停' : running ? 'Agent 驱动中' : '空闲'}</span>
            </div>
            {/* L5: 实时浏览舞台——crawler 每页截图（/api/explore/shot），接管暂停期间 2s 续拍不断流 */}
            <div className="shot-stage">
              {shot ? (
                <img
                  className="shot-img"
                  src={`/api/explore/shot?key=${encodeURIComponent(shot.key)}&t=${shot.ts}`}
                  alt="Agent 浏览器实时画面"
                />
              ) : (
                <div className="shot-empty">
                  <span className="scanline" />
                  {running ? '等待第一帧截图…' : '探索开始后此处实时显示 Agent 浏览画面'}
                </div>
              )}
              {shot && running && (
                <span className="shot-live"><i />LIVE{status === 'paused' ? ' · 接管中' : ''}</span>
              )}
            </div>
            {/* 紧凑 activity 条（最近 2 条；完整流在底部 Activity 区） */}
            <div className="shot-activity">
              {activity.length === 0 && <div className="logline dim">探索事件将实时显示在这里（WS 增量推送：每页 / 每次登录尝试）。</div>}
              {activity.slice(0, 2).map((a, i) => (
                <div key={i} className="logline ev"><span className="lico">›</span><span className="ltext">{a.message}</span><span className="lts">{a.ts}</span></div>
              ))}
            </div>
          </div>
          <div className="sumcard" style={{ marginTop: 10, marginBottom: 0, padding: '10px 12px' }}>
            <div style={{ fontSize: 12 }}><b>Agent 正在做什么？</b> <span className="chip p-indigo" style={{ marginLeft: 6 }}>可解释</span></div>
            <div className="kv" style={{ marginTop: 6 }}><span>目标</span><b>{intent || '—'}</b></div>
            <div className="kv"><span>正在做</span><b>{cur.url ? `访问 ${cur.title || cur.url}` : status === 'idle' ? '等待启动' : '处理中…'}</b></div>
            <div className="kv"><span>观察到</span><b>{cur.interactive != null ? `${cur.interactive} 个可交互元素` : '—'}</b></div>
            <div className="kv"><span>原因</span><b>按 Intent Score 与 BFS 深度优先排序（目标相关性越高越先探索）</b></div>
          </div>
        </div>

        <div className="excol">
          <h4><Bot size={12} /> Agent 状态</h4>
          <div className="kv"><span>状态</span><span className={`chip ${status === 'running' ? 'p-blue' : status === 'paused' ? 'p-amber' : 'p-gray'}`}>● {status === 'running' ? 'WORKING' : status === 'paused' ? 'PAUSED' : status === 'done' ? 'DONE' : 'IDLE'}</span></div>
          <div className="kv"><span>当前页面</span><b style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{cur.url ?? '—'}</b></div>
          <div className="kv"><span>已发现</span><b>{tree.length} 页面 · {totalActs} 交互</b></div>
          <div className="divider" style={{ borderTop: '1px solid var(--border)', margin: '10px 0' }} />
          <h4><Target size={12} /> Intent Score（目标相关性）</h4>
          {intentRows.length === 0 && <p className="dim" style={{ fontSize: 11 }}>暂无——探索落库后按 scoreIntent 分档展示。</p>}
          {intentRows.map((r) => (
            <div key={r.name} className="intent-row">
              <span className="n">{r.name}</span>
              <div className="bar"><i className={r.score >= 71 ? 'green' : ''} style={{ width: `${Math.min(100, r.score)}%` }} /></div>
              <span className="pct">{Math.round(r.score)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部两列：Activity + Live Findings（原型 exbot） */}
      <div className="exbot">
        <div className="excol">
          <h4><ScrollText size={12} /> Activity</h4>
          <div className="activity">
            {activity.length === 0 && <p className="dim" style={{ fontSize: 11.5 }}>暂无活动。</p>}
            {activity.map((a, i) => <div key={i}><b>{a.ts}</b> {a.message}</div>)}
          </div>
        </div>
        <div className="excol">
          <h4><Zap size={12} /> Live Findings <span className="chip p-indigo">探索途中即时产出</span></h4>
          {findings.length === 0 && <p className="dim" style={{ fontSize: 11.5 }}>暂无——爬取中命中登录墙 / 异常响应时即时出卡。</p>}
          <div className="findings" style={{ marginTop: 4 }}>
            {findings.map((f, i) => (
              <div key={i} className={`finding ${f.level === 'red' ? 'red' : 'amber'}`}>
                <h5><i className={f.level === 'red' ? 'dotr' : 'dota'} /> {f.level === 'red' ? '高风险' : '需要验证'} · {f.title}</h5>
                <p>{f.detail}</p>
                <div className="acts">
                  <button className="btn" style={{ padding: '2px 9px', fontSize: 11 }} onClick={() => addQa(f)}>加入 QA 点</button>
                  <button className="btn" style={{ padding: '2px 9px', fontSize: 11 }} onClick={(e) => { (e.target as HTMLElement).closest('.finding')?.setAttribute('style', 'opacity:.4'); }}>忽略</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {msg && <p className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
