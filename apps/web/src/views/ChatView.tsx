import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import mammoth from 'mammoth/mammoth.browser';
import { Globe, Play, ClipboardList, ClipboardCheck, Lock, Map, Paperclip, ArrowUp, ChevronDown, Check, Cpu, FileText, Image as ImageIcon, X } from 'lucide-react';

// ---------- AI 工作区：对话式测试（LLM 意图解析 + 能力调度） ----------

type ChatMsg = {
  // H05：消息唯一 id——assistant 回复按 id 归位更新（独立流式槽位），不再整体替换最后一条
  id: string;
  role: 'user' | 'assistant';
  text: string;
  card?: ChatCard;
  // U20：消息携带的附件（气泡内 chips 展示）
  attachments?: Array<{ name: string; kind: 'text' | 'image' }>;
};

// U20：待发送附件（文本类前端解析出 text；图片类读 dataURL 走视觉通道）
interface PendingAtt { name: string; size: number; kind: 'text' | 'image'; text?: string; dataUrl?: string; truncated?: boolean }
const ATT_TEXT_LIMIT = 12000; // 单文本附件注入上限（字符）
async function parseAttachment(file: File): Promise<PendingAtt | { error: string }> {
  const isImage = /^image\/(png|jpeg|webp)$/.test(file.type);
  if (isImage) {
    if (file.size > 4 * 1024 * 1024) return { error: `图片 ${file.name} 超过 4MB` };
    const dataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('read fail'));
      fr.readAsDataURL(file);
    });
    return { name: file.name, size: file.size, kind: 'image', dataUrl };
  }
  if (file.size > 2 * 1024 * 1024) return { error: `文件 ${file.name} 超过 2MB` };
  let text = '';
  if (/\.docx$/.test(file.name)) {
    const buf = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    text = r.value ?? '';
  } else {
    text = await file.text();
  }
  const truncated = text.length > ATT_TEXT_LIMIT;
  return { name: file.name, size: file.size, kind: 'text', text: truncated ? text.slice(0, ATT_TEXT_LIMIT) : text, truncated };
}

// H05：消息 id 生成器（自增 + 时间戳，避免刷新前重复）
let msgSeq = 0;
const nextId = () => `m${Date.now().toString(36)}-${++msgSeq}`;

type QaDisplay = { title: string; risk?: string; confidence?: string };

type ChatCard =
  | { kind: 'explore' | 'run' | 'link'; text: string }
  | { kind: 'qa'; text: string; qaItems?: QaDisplay[] }
  // G13 登录墙凭据卡：approval.requested → 表单 → approval.submit
  | { kind: 'cred'; text?: string; req: CredReq }
  // G13 QA 点勾选确认卡：discovered 项复选 → 批量创建验证
  | { kind: 'qa-suggest'; text?: string }
  // G14 探索完成结果卡：WS explore.event phase=done → 统计 + 触达页面
  | { kind: 'explore-done'; text?: string; pages: number; edges: number; qaCount: number; visitedUrls: string[] };

/** RunsGateway 'approval.requested' 广播的载荷（agent-core ApprovalRequest） */
type CredReq = {
  id: string;
  kind: string;
  title?: string;
  reason?: string;
  fields?: Array<{ key: string; label: string; type: 'text' | 'password'; required: boolean; placeholder?: string }>;
  context?: { url?: string; role?: string; runId?: string };
};

/** /api/qa-points 行 */
type QaRow = { short_id: string; title: string; category?: string | null; risk?: string | null; status: string; confidence?: string | null };

const QUICK = ['帮我探索演示站，关注员工管理权限', '跑一次验证', '看看现在的 QA 点', '你能做什么？'];

// L3：模型偏好选择（诚实标注：仅偏好预选，实际以服务端 LLM_MODEL 为准）
const MODEL_OPTIONS = ['glm-4.5v', 'glm-4.5-air', 'glm-4-flash', 'deepseek-v3'];
const MODEL_KEY = 'verifyos.model';

export function ChatView() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { id: nextId(), role: 'assistant', text: '你好！我是 VerifyOS 助手。测试，从一句话开始——比如「帮我探索演示站」或「跑一次验证」。' },
  ]);

  // 对话历史（PG 持久化，刷新不丢）
  useEffect(() => {
    fetch('/api/chat/history')
      .then((r) => r.json())
      .then((d) => {
        const items = (d.items ?? []) as Array<{ role: string; content: string; card?: Record<string, unknown> | null }>;
        if (items.length > 0) {
          const restored: ChatMsg[] = items.map((m) => {
            if (m.role === 'user') return { id: nextId(), role: 'user', text: m.content };
            const cardInfo = m.card as { action?: string; dispatched?: string | null; intent_text?: string } | null | undefined;
            let card: ChatCard | undefined;
            if (cardInfo?.dispatched === 'explore') card = { kind: 'explore', text: `已启动探索${cardInfo.intent_text ? `（意图：${cardInfo.intent_text}）` : ''}` };
            else if (cardInfo?.dispatched === 'run') card = { kind: 'run', text: '已触发真实验证（真浏览器执行）' };
            else if (cardInfo?.action === 'show_qa_points') card = { kind: 'link', text: 'QA 点库已就绪' };
            else if (cardInfo?.action === 'show_map') card = { kind: 'link', text: '应用地图已就绪' };
            return { id: nextId(), role: 'assistant', text: m.content, card };
          });
          setMsgs([{ id: nextId(), role: 'assistant', text: '你好！我是 VerifyOS 助手。测试，从一句话开始。' }, ...restored]);
        }
      })
      .catch(() => undefined);
  }, []);

  // G13：WS 通道（path '/ws'）——订阅 approval.requested → 登录墙凭据卡
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  useEffect(() => {
    const s = io({ path: '/ws' });
    socketRef.current = s;
    s.on('approval.requested', (req: CredReq) => {
      setMsgs((m) => [
        ...m,
        {
          id: nextId(),
          role: 'assistant',
          text: '爬取需要登录凭据——请填写下方表单，提交后引擎将自动继续。',
          card: { kind: 'cred', req },
        },
      ]);
    });
    // G14：探索完成 → 结果统计卡（替代旧的 60s 盲等定时器）；有 QA 候选时链式追加建议卡
    s.on('explore.event', (e: { phase?: string; message?: string; pages?: number; edges?: number; qaCount?: number; visitedUrls?: string[] }) => {
      if (e.phase === 'done') {
        const qaCount = e.qaCount ?? 0;
        setMsgs((m) => [
          ...m,
          {
            id: nextId(),
            role: 'assistant',
            text: e.message ?? '探索完成。',
            card: { kind: 'explore-done', pages: e.pages ?? 0, edges: e.edges ?? 0, qaCount, visitedUrls: e.visitedUrls ?? [] },
          },
        ]);
        if (qaCount > 0) {
          setMsgs((m) => [
            ...m,
            { id: nextId(), role: 'assistant', text: `发现 ${qaCount} 条待确认 QA 点，勾选后一键生成验证：`, card: { kind: 'qa-suggest', text: '' } },
          ]);
        }
      } else if (e.phase === 'error') {
        setMsgs((m) => [
          ...m,
          { id: nextId(), role: 'assistant', text: `探索失败：${e.message ?? '未知错误'}`, card: { kind: 'link', text: '可到「探索」页重试，或查看服务器日志定位原因。' } },
        ]);
      }
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState('');
  // U20：附件通道——文本类（docx/md/txt/json/csv）前端解析注入消息，图片类走 glm-4.5v 视觉
  const [pendingAtts, setPendingAtts] = useState<PendingAtt[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: PendingAtt[] = [];
    for (const f of Array.from(files)) {
      const r = await parseAttachment(f);
      if ('error' in r) { showToast(r.error); continue; }
      next.push(r);
    }
    setPendingAtts((prev) => {
      const merged = [...prev, ...next];
      const imgs = merged.filter((a) => a.kind === 'image').length;
      // 图片 ≤2：多出的丢弃
      let imgSeen = 0;
      return merged.filter((a) => (a.kind === 'image' ? ++imgSeen <= 2 : true)).slice(0, 5);
    });
    if (fileRef.current) fileRef.current.value = '';
  };
  // L3：模型偏好（localStorage 'verifyos.model'）+ 下拉开合
  const [modelPref, setModelPref] = useState('');
  const [modelMenu, setModelMenu] = useState(false);
  const [toast, setToast] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // H05：in-flight 计数——支持连发多条消息，全部返回后才熄灭「解析中」指示
  const inflightRef = useRef(0);

  // G13：模型 chip（LLM_MODEL 经 /api/health 暴露）+ L3 恢复本地模型偏好
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { model?: string }) => setModel(d.model ?? ''))
      .catch(() => undefined);
    setModelPref(localStorage.getItem(MODEL_KEY) ?? '');
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  // L3：textarea 自适应高度（输入/清空后重算，上限 160px）
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const pickModel = (m: string) => {
    setModelPref(m);
    try { localStorage.setItem(MODEL_KEY, m); } catch { /* 私密模式忽略 */ }
    setModelMenu(false);
  };

  // H05：进入对话/历史恢复后自动滚到底（首屏瞬时、后续平滑），保证最新消息可见
  const mountedRef = useRef(false);
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: mountedRef.current ? 'smooth' : 'auto',
    });
    mountedRef.current = true;
  }, [msgs]);

  const showToast = (t: string) => {
    setToast(t);
    const timer = setTimeout(() => setToast(''), 2600);
    timersRef.current.push(timer);
  };

  // H05：连发不拦截——每条消息独立的 assistant 占位槽位，回复按 id 归位，互不覆盖
  const send = (text: string) => {
    const trimmed = text.trim();
    const atts = pendingAtts;
    if (!trimmed && atts.length === 0) return;
    const replyId = nextId();
    // U20：文本附件内容注入消息前缀（LLM 直接可读）；图片走 attachments 视觉通道
    const textParts = atts.filter((a) => a.kind === 'text' && a.text);
    let finalMessage = trimmed;
    if (textParts.length > 0) {
      const blocks = textParts.map((a, i) => `[附件 ${i + 1}：${a.name}${a.truncated ? '（内容已截断）' : ''}]\n${a.text}`).join('\n\n');
      finalMessage = `${blocks}${trimmed ? `\n\n用户说：${trimmed}` : '\n请阅读以上附件内容并给出测试建议（可测什么、怎么测）。'}`;
    }
    const images = atts.filter((a) => a.kind === 'image' && a.dataUrl);
    if (!finalMessage && images.length > 0) finalMessage = '请看图说话：这张图里是什么页面？可以怎么测试它？';
    setMsgs((m) => [
      ...m,
      { id: nextId(), role: 'user', text: trimmed || (atts.length ? `(发送了 ${atts.length} 个附件)` : ''), attachments: atts.map((a) => ({ name: a.name, kind: a.kind })) },
      { id: replyId, role: 'assistant', text: '思考中…' },
    ]);
    setInput('');
    setPendingAtts([]);
    inflightRef.current += 1;
    setBusy(true);

    // 按 id 精准更新该条回复的槽位（不再替换数组最后一条）
    const patchReply = (patch: Partial<ChatMsg>) =>
      setMsgs((m) => m.map((msg) => (msg.id === replyId ? { ...msg, ...patch } : msg)));

    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: finalMessage, ...(images.length ? { attachments: images.map((a) => ({ name: a.name, type: a.dataUrl?.slice(5, a.dataUrl.indexOf(';') || 20), data: a.dataUrl })) } : {}) }) })
      .then((r) => r.json())
      .then(async ({ plan }: { plan: { action: string; reply: string; dispatched?: string; intent_text?: string } }) => {
        let card: ChatCard | undefined;
        if (plan.dispatched === 'explore') {
          card = { kind: 'explore', text: `已启动探索${plan.intent_text ? `（意图：${plan.intent_text}）` : ''}——爬取→登录→生成 Coverage Graph→LLM 提取 QA 点，全链路落库。完成后我会在这里给出探索统计与「建议的 QA 点」，也可到「QA 点」页查看。` };
        } else if (plan.dispatched === 'run') {
          card = { kind: 'run', text: '已触发真实验证（真浏览器执行）——切到「验证 · 执行」页可看实时事件流、舞台截图与证据。' };
        } else if (plan.action === 'show_qa_points') {
          // artifact：直接渲染 QA 点列表卡（不用跳转）
          const qa = await fetch('/api/qa-points').then((r) => r.json()).catch(() => ({ items: [] }));
          const items = (qa.items ?? []).slice(0, 5).map((it: Record<string, unknown>) => ({
            title: String(it.title), risk: it.risk as string | undefined, confidence: it.confidence as string | undefined,
          }));
          card = { kind: 'qa', text: `QA 点库共 ${qa.items?.length ?? 0} 条候选（前 5 条）：`, qaItems: items };
        } else if (plan.action === 'show_map') {
          card = { kind: 'link', text: '应用地图已就绪——切到「应用地图」页查看页面覆盖图。' };
        }
        patchReply({ text: plan.reply, card });
      })
      .catch(() => patchReply({ text: '出错了，请稍后重试。' }))
      .finally(() => {
        inflightRef.current = Math.max(0, inflightRef.current - 1);
        if (inflightRef.current === 0) setBusy(false);
      });
  };

  const cardTitle = (c: ChatCard): React.ReactNode => {
    const size = 11;
    switch (c.kind) {
      case 'explore': return <><Globe size={size} /> 探索任务已启动</>;
      case 'run': return <><Play size={size} /> 验证已触发</>;
      case 'qa': return <><ClipboardList size={size} /> QA 点候选</>;
      case 'cred': return <><Lock size={size} /> 登录墙 · 需要凭据</>;
      case 'qa-suggest': return <><ClipboardCheck size={size} /> 建议的 QA 点</>;
      case 'explore-done': return <><Map size={size} /> 探索完成 · 结果统计</>;
      default: return <Paperclip size={size} />;
    }
  };

  return (
    <div className="pageview" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div className="chatlog" ref={logRef}>
        {msgs.map((m) => (
          <div key={m.id} className={`chatmsg ${m.role}`}>
            {m.role === 'assistant' && <div className="cavatar">✓</div>}
            <div className={`cbubble ${m.role}`}>
              {m.attachments && m.attachments.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: m.text ? 6 : 0 }}>
                  {m.attachments.map((a, i) => (
                    <span key={i} className="chip att-chip">{a.kind === 'image' ? <ImageIcon size={9} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} /> : <FileText size={9} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />}{a.name}</span>
                  ))}
                </div>
              )}
              {m.text}
              {m.role === 'assistant' && m.card && (
                <div className={`ccard c-${m.card.kind === 'qa-suggest' ? 'qasuggest' : m.card.kind}`}>
                  <b>{cardTitle(m.card)}</b>
                  {m.card.text && <div>{m.card.text}</div>}
                  {m.card.kind === 'qa' && m.card.qaItems && m.card.qaItems.length > 0 && (
                    <div className="qa-card-list">
                      {m.card.qaItems.map((q, j) => (
                        <div key={j} className="qa-card-row">
                          <span className={`riskdot risk-${q.risk ?? 'idle'}`} />
                          <span className="qa-title">{q.title}</span>
                          {q.confidence && <span className="mono qa-conf">{Number(q.confidence).toFixed(2)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {m.card.kind === 'cred' && (
                    <CredCard
                      req={m.card.req}
                      socket={socketRef.current}
                      onToast={showToast}
                    />
                  )}
                  {m.card.kind === 'explore-done' && (
                    <div className="explore-done">
                      <div className="ed-stats">
                        <span><b>{m.card.pages}</b> 页面节点</span>
                        <span><b>{m.card.edges}</b> 跳转边</span>
                        <span><b>{m.card.qaCount}</b> QA 点候选</span>
                      </div>
                      {m.card.visitedUrls.length > 0 && (
                        <div className="ed-urls">
                          {m.card.visitedUrls.slice(0, 4).map((u) => <span key={u} className="mono ed-url">{u}</span>)}
                          {m.card.visitedUrls.length > 4 && <span className="dim" style={{ fontSize: 10 }}>…共 {m.card.visitedUrls.length} 页</span>}
                        </div>
                      )}
                      <div className="dim" style={{ fontSize: 10.5, marginTop: 4 }}>已落库：Coverage Graph + QA 点候选——到「应用地图」「QA 点」页查看。</div>
                    </div>
                  )}
                  {m.card.kind === 'qa-suggest' && <QaSuggestCard onToast={showToast} />}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="dim" style={{ fontSize: 11, paddingLeft: 34 }}>AI 解析意图中…</div>}
      </div>
      {pendingAtts.length > 0 && (
        <div className="chipsrow" style={{ marginBottom: 4 }}>
          {pendingAtts.map((a, i) => (
            <span key={`${a.name}-${i}`} className="chip att-chip" title={a.kind === 'text' ? `文本附件 · ${(a.size / 1024).toFixed(1)}KB${a.truncated ? ' · 内容超长已截断' : ''}` : `图片附件 · ${(a.size / 1024).toFixed(1)}KB · 视觉理解`}>
              {a.kind === 'image' ? <ImageIcon size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} /> : <FileText size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />}
              {a.name}
              <X size={10} style={{ display: 'inline', marginLeft: 4, cursor: 'pointer' }} onClick={() => setPendingAtts((p) => p.filter((_, k) => k !== i))} />
            </span>
          ))}
        </div>
      )}
      <div className="chipsrow">
        {QUICK.map((q) => (
          <span key={q} className="chip quick" onClick={() => send(q)}>{q}</span>
        ))}
      </div>
      {/* L3：assistant-ui 范式 composer——大圆角容器 + 自适应 textarea + 底行（附件/模型 | 圆形发送） */}
      <div className="composer-shell">
        <textarea
          ref={taRef}
          className="composer-input"
          rows={1}
          placeholder="描述你要测什么，Enter 发送 · Shift+Enter 换行…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <div className="composer-row">
          <button
            className="composer-iconbtn"
            title="附件：docx / md / txt / json / csv（内容随消息发给 AI）、图片 png/jpg/webp（glm-4.5v 视觉理解，最多 2 张）"
            onClick={() => fileRef.current?.click()}
          ><Paperclip size={15} /></button>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            accept=".docx,.md,.txt,.json,.csv,image/png,image/jpeg,image/webp"
            onChange={(e) => { void pickFiles(e.target.files); e.target.value = ''; }}
          />
          <div className="composer-model">
            <button
              className={`composer-model-btn${modelMenu ? ' open' : ''}`}
              title="模型偏好（仅预选）"
              onClick={() => setModelMenu((o) => !o)}
            ><Cpu size={12} /> <span className="mono">{modelPref || '模型偏好'}</span> <ChevronDown size={11} className="composer-caret" /></button>
            {modelMenu && (
              <>
                <div className="composer-menu-backdrop" onClick={() => setModelMenu(false)} />
                <div className="composer-menu">
                  {MODEL_OPTIONS.map((m) => (
                    <div key={m} className={`composer-menu-item${m === modelPref ? ' on' : ''}`} onClick={() => pickModel(m)}>
                      <span className="mono">{m}</span>
                      {m === modelPref && <Check size={12} />}
                    </div>
                  ))}
                  <div className="composer-menu-note">选择仅为偏好预选（存于本地）——实际引擎模型：<span className="mono">{model || '—'}</span>，以服务端为准。</div>
                </div>
              </>
            )}
          </div>
          <span className="sp" />
          <button className="composer-send" aria-label="发送" onClick={() => send(input)} disabled={!input.trim()}>
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
      <div className="composer-hint dim">Enter 发送 · Shift+Enter 换行 · 回形针附件：docx/md/txt/json/csv 文本直读、图片（≤2 张）视觉理解 · @ 引用 QA 点 · / 唤起技能</div>
      {toast && <div className="composer-toast">{toast}</div>}
    </div>
  );
}

/** G13 登录墙凭据卡：角色只读 + 用户名/密码 + 保存到项目配置 + 提交（approval.submit） */
function CredCard({ req, socket, onToast }: { req: CredReq; socket: ReturnType<typeof io> | null; onToast: (t: string) => void }) {
  const fields = req.fields ?? [
    { key: 'username', label: '用户名', type: 'text' as const, required: true },
    { key: 'password', label: '密码', type: 'password' as const, required: true },
  ];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveToProject, setSaveToProject] = useState(false);
  const [state, setState] = useState<'form' | 'submitting' | 'submitted' | 'failed'>('form');

  const submit = () => {
    if (!socket) { setState('failed'); return; }
    const missing = fields.some((f) => f.required && !values[f.key]?.trim());
    if (missing) { onToast('请填写所有必填项'); return; }
    setState('submitting');
    // 勾选「保存到项目配置」→ 同步入凭据库（下次 Run 免填）
    if (saveToProject) {
      fetch('/api/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${req.context?.role ?? '用户'}凭据（对话内保存）`,
          role: req.context?.role ?? '管理员',
          username: values.username ?? '',
          password: values.password ?? '',
        }),
      }).catch(() => undefined);
    }
    socket.emit('approval.submit', { id: req.id, approved: true, values }, (ack?: { ok?: boolean }) => {
      if (ack?.ok) setState('submitted');
      else setState('failed');
    });
  };

  if (state === 'submitted') {
    return <div className="cred-done">✓ 凭据已提交——爬取将自动继续。</div>;
  }
  if (state === 'failed') {
    return <div className="cred-fail">✕ 提交失败（通道中断或门控已超时），请重试或到「凭据」页配置。</div>;
  }
  return (
    <div className="cred-form">
      <div className="kv"><span>角色</span><b>{req.context?.role ?? '—'}</b></div>
      {req.context?.url && <div className="kv"><span>目标</span><b className="mono" style={{ fontSize: 10.5 }}>{req.context.url}</b></div>}
      {fields.map((f) => (
        <div key={f.key} className="cred-row">
          <label>{f.label}</label>
          <input
            className="inp"
            type={f.type}
            placeholder={f.placeholder ?? ''}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <label className="cred-save">
        <input type="checkbox" checked={saveToProject} onChange={(e) => setSaveToProject(e.target.checked)} />
        保存到项目配置
      </label>
      <button className="btn primary" onClick={submit} disabled={state === 'submitting'}>
        {state === 'submitting' ? '提交中…' : '提交并继续'}
      </button>
    </div>
  );
}

/** G13 QA 点勾选确认卡：discovered 复选 + 已选 n/N + 批量创建验证 */
function QaSuggestCard({ onToast }: { onToast: (t: string) => void }) {
  const [items, setItems] = useState<QaRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string[]>([]);

  const load = () => {
    fetch('/api/qa-points')
      .then((r) => r.json())
      .then((d: { items?: QaRow[] }) => {
        const discovered = (d.items ?? []).filter((it) => it.status === 'discovered');
        setItems(discovered);
        setSelected(new Set());
      })
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  const toggle = (shortId: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(shortId)) n.delete(shortId);
      else n.add(shortId);
      return n;
    });
  };

  const createSelected = () => {
    if (selected.size === 0 || creating) return;
    setCreating(true);
    const ids = [...selected];
    Promise.all(
      ids.map((qaShortId) =>
        fetch('/api/verifications', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qaShortId }),
        })
          .then((r) => r.json())
          .then((d: { shortId?: string }) => d.shortId ?? qaShortId)
          .catch(() => qaShortId),
      ),
    )
      .then((shortIds) => {
        setCreated(shortIds);
        setItems((its) => (its ?? []).filter((it) => !selected.has(it.short_id)));
        setSelected(new Set());
        setCreating(false);
        onToast(`已创建 ${shortIds.length} 条验证`);
      })
      .catch(() => setCreating(false));
  };

  return (
    <div className="qa-suggest">
      {items === null && <div className="dim" style={{ fontSize: 11 }}>加载候选中…</div>}
      {items !== null && items.length === 0 && created.length === 0 && (
        <div className="dim" style={{ fontSize: 11 }}>暂无 discovered 状态的 QA 点——点击「刷新候选」重试，或先跑一次探索。</div>
      )}
      {items !== null && items.length > 0 && (
        <>
          <div className="qa-suggest-list">
            {items.map((it) => (
              <label key={it.short_id} className="qa-suggest-row">
                <input
                  type="checkbox"
                  checked={selected.has(it.short_id)}
                  onChange={() => toggle(it.short_id)}
                />
                <span className={`riskdot risk-${it.risk ?? 'idle'}`} />
                <span className="qa-title">{it.title}</span>
                {it.risk && <span className={`chip risk-${it.risk}`}>{it.risk}</span>}
                {it.confidence != null && <span className="mono qa-conf">{Number(it.confidence).toFixed(2)}</span>}
              </label>
            ))}
          </div>
          <div className="qa-suggest-acts">
            <span className="dim" style={{ fontSize: 10.5 }}>已选 {selected.size}/{items.length}</span>
            <button className="btn ghost" onClick={load}>刷新候选</button>
            <button className="btn primary" onClick={createSelected} disabled={selected.size === 0 || creating}>
              {creating ? '创建中…' : '创建所选验证'}
            </button>
          </div>
        </>
      )}
      {created.length > 0 && (
        <div className="qa-suggest-done">
          ✓ 已生成 {created.length} 条验证：<span className="mono">{created.join('、')}</span>
        </div>
      )}
    </div>
  );
}
