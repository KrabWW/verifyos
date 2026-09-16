/**
 * AiDrawer —— 全局 AI 助手抽屉（对标 MeterSphere ms-ai-drawer）。
 *
 * 设计理念：AI 入口长在旅程发生的现场（树/编辑器/失败行/覆盖率），
 * 全局圆框只兜底通用问题。抽屉打开时自动检测当前上下文（props.context），
 * 预填意图与资产，生成结果可直接勾选同步入库。
 */
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleAlert,
  Info,
  Send,
  Stethoscope,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';

/* ===== 对外类型 ===== */

export type AiContextType = 'api' | 'scenario' | 'coverage' | 'general';

/** 当前页面上下文：由宿主页面在打开抽屉时注入 */
export interface AiContext {
  type: AiContextType;
  /** 展示用标签，如「已选: GET /users/:id」「场景: 下单流程 · 2 fail」 */
  label: string;
  data?: Record<string, unknown>;
}

/** 预设意图：决定预填输入与演示对话 */
export type AiIntent = 'gen-case' | 'edge-case' | 'diagnose' | 'chat';

export interface AiDrawerProps {
  open: boolean;
  onClose: () => void;
  context: AiContext;
  intent?: AiIntent;
}

/* ===== 内部模型 ===== */

type ModelId = 'glm-4.6' | 'deepseek-v3' | 'gpt-4o';
const MODELS: { id: ModelId; name: string; desc: string }[] = [
  { id: 'glm-4.6', name: 'GLM-4.6', desc: '默认 · 自带 Key' },
  { id: 'deepseek-v3', name: 'DeepSeek-V3', desc: '自带 Key' },
  { id: 'gpt-4o', name: 'GPT-4o', desc: '自带 Key' },
];

/** 方法论 chips（MS #26：勾选后注入 prompt） */
const METHODS = ['边界值', '等价类', '异常路径', '鉴权绕过', '并发安全'] as const;

interface GeneratedCard {
  id: string;
  title: string;
  /** 类型徽章 */
  kind: 'case' | 'edge' | 'security' | 'fix';
  method?: string;
  path?: string;
  synced: boolean;
}

/** 根因分类（失败诊断模式） */
type RootCause = 'contract_break' | 'business_change' | 'environment_diff';
const ROOT_CAUSE_META: Record<RootCause, { label: string; cls: string; dot: string }> = {
  contract_break: {
    label: '契约破坏 contract_break',
    cls: 'border-[hsl(0_84%_55%/0.4)] bg-[hsl(0_84%_55%/0.1)] text-[hsl(0_84%_70%)]',
    dot: 'bg-[hsl(0_84%_55%)]',
  },
  business_change: {
    label: '业务变更 business_change',
    cls: 'border-[hsl(25_95%_53%/0.4)] bg-[hsl(25_95%_53%/0.1)] text-[hsl(25_95%_68%)]',
    dot: 'bg-[hsl(25_95%_53%)]',
  },
  environment_diff: {
    label: '环境差异 environment_diff',
    cls: 'border-[hsl(217_76%_53%/0.4)] bg-[hsl(217_76%_53%/0.1)] text-[hsl(217_76%_72%)]',
    dot: 'bg-[hsl(217_76%_53%)]',
  },
};

interface Diagnosis {
  cause: RootCause;
  step: string;
  suggestion: string;
  expected: string;
  actual: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  /** 附带的诊断块（仅 AI 消息） */
  diagnoses?: Diagnosis[];
  /** 附带的生成结果卡片 */
  cards?: GeneratedCard[];
  /** 当前消息中被勾选的卡片 id */
  checkedIds?: Set<string>;
}

/* ===== 演示数据（按上下文/意图构建对话流） ===== */

const KIND_META: Record<GeneratedCard['kind'], { label: string; cls: string }> = {
  case: { label: '用例', cls: 'text-[hsl(var(--accent))] border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]' },
  edge: { label: '边界', cls: 'text-[hsl(38_92%_60%)] border-[hsl(38_92%_50%/0.35)] bg-[hsl(38_92%_50%/0.12)]' },
  security: { label: '安全', cls: 'text-[hsl(330_78%_68%)] border-[hsl(330_78%_52%/0.35)] bg-[hsl(330_78%_52%/0.12)]' },
  fix: { label: '修复', cls: 'text-[hsl(217_76%_70%)] border-[hsl(217_76%_53%/0.35)] bg-[hsl(217_76%_53%/0.12)]' },
};

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

function buildDemo(context: AiContext, intent?: AiIntent): ChatMessage[] {
  if (context.type === 'scenario' && (intent === 'diagnose' || context.label.includes('fail'))) {
    return [
      {
        id: nextId('m'),
        role: 'user',
        text: '「下单流程」跑挂了 2 步，帮我诊断根因。',
      },
      {
        id: nextId('m'),
        role: 'ai',
        text: '已回放失败步骤的请求/响应并与 OpenAPI 契约比对，2 处失败归为 2 类根因：',
        diagnoses: [
          {
            cause: 'contract_break',
            step: 'STEP 3  POST /orders',
            suggestion:
              '服务端响应已不含 order_no 字段（v2.3 版本改为 data.order.id），测试断言过期。建议更新断言目标为 $.data.order.id。',
            expected: '$.order_no  exists',
            actual: '$.data.order.id',
          },
          {
            cause: 'environment_diff',
            step: 'STEP 4  POST /orders/:id/pay',
            suggestion:
              '测试环境支付网关冷启动超时（5s），生产环境正常。建议为该步骤增加 10s 重试或前置健康检查。',
            expected: '200 OK · 812ms',
            actual: '504 Gateway Timeout · 5003ms',
          },
        ],
        cards: [
          { id: nextId('c'), title: '更新断言：$.data.order.id', kind: 'fix', method: 'POST', path: '/orders', synced: false },
          { id: nextId('c'), title: '支付步骤重试策略 ×3（间隔 2s）', kind: 'fix', method: 'POST', path: '/orders/:id/pay', synced: false },
        ],
      },
    ];
  }

  if (context.type === 'api') {
    return [
      {
        id: nextId('m'),
        role: 'user',
        text: `帮我为 ${context.label.replace('已选: ', '')} 生成测试用例，覆盖边界与鉴权。`,
      },
      {
        id: nextId('m'),
        role: 'ai',
        text: '基于该接口的 OpenAPI 契约与最近 200 条流量样本，生成 3 条用例：覆盖正常路径、id 边界值（0 / 越界 / 超长）、以及无 Token 的鉴权绕过场景。',
        cards: [
          { id: nextId('c'), title: '正常查询用户详情，断言 200 + schema', kind: 'case', method: 'GET', path: '/users/:id', synced: false },
          { id: nextId('c'), title: '边界值：id=0 / 999999999 / 超长字符串', kind: 'edge', method: 'GET', path: '/users/:id', synced: false },
          { id: nextId('c'), title: '鉴权绕过：无 Token 请求，断言 401', kind: 'security', method: 'GET', path: '/users/:id', synced: false },
        ],
      },
    ];
  }

  if (context.type === 'coverage') {
    return [
      {
        id: nextId('m'),
        role: 'user',
        text: 'PUT /orders/:id 的 400/404 响应码从未被测过，补一批用例。',
      },
      {
        id: nextId('m'),
        role: 'ai',
        text: '该 operation 风险分 8.2（响应码覆盖率 40%）。已按异常路径方法论生成 2 条补测用例：非法状态流转（400）与不存在的订单号（404）。',
        cards: [
          { id: nextId('c'), title: '异常路径：已支付订单再次取消 → 400', kind: 'edge', method: 'PUT', path: '/orders/:id', synced: false },
          { id: nextId('c'), title: '不存在的订单号 order_id=deadbeef → 404', kind: 'case', method: 'PUT', path: '/orders/:id', synced: false },
        ],
      },
    ];
  }

  return [
    {
      id: nextId('m'),
      role: 'ai',
      text: '你好，我是 VerifyOS AI 助手。可以从左侧树、场景报告或覆盖率看板把问题带过来，也可以直接描述你的测试意图。',
    },
  ];
}

const INTENT_PREFILL: Record<AiIntent, string> = {
  'gen-case': '为当前接口生成一组测试用例，覆盖正常路径与异常路径',
  'edge-case': '针对当前接口补充边界值用例',
  diagnose: '诊断当前场景失败的根因并给出修复建议',
  chat: '',
};

/** 可切换的上下文演示集 */
const CONTEXT_SWITCHES: { type: AiContextType; label: string; intent?: AiIntent }[] = [
  { type: 'api', label: '已选: GET /users/:id', intent: 'gen-case' },
  { type: 'scenario', label: '场景: 下单流程 · 2 fail', intent: 'diagnose' },
  { type: 'coverage', label: '覆盖: PUT /orders/:id · 40%', intent: 'gen-case' },
  { type: 'general', label: '通用助手' },
];

/* ===== 组件 ===== */

export function AiDrawer({ open, onClose, context, intent = 'chat' }: AiDrawerProps) {
  const [model, setModel] = useState<ModelId>('glm-4.6');
  const [modelOpen, setModelOpen] = useState(false);
  const [mode, setMode] = useState<'context' | 'free'>('context');
  const [methods, setMethods] = useState<Set<string>>(new Set(['边界值']));
  const [ctx, setCtx] = useState<AiContext>(context);
  const [ctxSwitchOpen, setCtxSwitchOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  /* 打开时：按上下文/意图重建对话并预填输入 */
  useEffect(() => {
    if (!open) return;
    setCtx(context);
    setMessages(buildDemo(context, intent));
    setMode('context');
    setInput(INTENT_PREFILL[intent]);
    setThinking(false);
  }, [open, context, intent]);

  /* 新消息滚底 */
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  if (!open) return null;

  const toggleMethod = (m: string) =>
    setMethods((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  const toggleCard = (msgId: string, cardId: string) =>
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const checked = new Set(m.checkedIds ?? []);
        if (checked.has(cardId)) checked.delete(cardId);
        else checked.add(cardId);
        return { ...m, checkedIds: checked };
      }),
    );

  const syncCards = (msgId: string) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              cards: (m.cards ?? []).map((c) =>
                (m.checkedIds ?? new Set<string>()).has(c.id) ? { ...c, synced: true } : c,
              ),
            }
          : m,
      ),
    );

  const send = () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    setMessages((prev) => [...prev, { id: nextId('m'), role: 'user', text }]);
    setThinking(true);
    window.setTimeout(() => {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId('m'),
          role: 'ai',
          text:
            mode === 'free'
              ? `已收到（自由对话 · ${MODELS.find((m) => m.id === model)?.name}）。我把回答限定在测试领域：你可以继续描述接口、期望行为或失败现象。`
              : `结合当前上下文「${ctx.label}」${
                  methods.size ? `与方法论（${[...methods].join('、')}）` : ''
                }，我已完成分析。以下是可以直接勾选同步入库的产出：`,
          cards:
            mode === 'free'
              ? undefined
              : [
                  { id: nextId('c'), title: `${text.slice(0, 18)}…· 主路径用例`, kind: 'case', synced: false },
                  { id: nextId('c'), title: '异常路径：参数缺省 / 非法值', kind: 'edge', synced: false },
                ],
        },
      ]);
    }, 900);
  };

  const switchContext = (c: (typeof CONTEXT_SWITCHES)[number]) => {
    setCtxSwitchOpen(false);
    const next: AiContext = { type: c.type, label: c.label };
    setCtx(next);
    setMessages(buildDemo(next, c.intent));
  };

  return (
    <>
      {/* 动画 keyframes（组件内注入，不依赖 tailwind.config） */}
      <style>{`
        @keyframes ai-drawer-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes ai-fade-in { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        style={{ animation: 'ai-fade-in .18s ease-out' }}
        onClick={onClose}
      />

      {/* 抽屉本体 */}
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-[460px] flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--bg-secondary))] shadow-2xl"
        style={{ animation: 'ai-drawer-in .22s cubic-bezier(.22,1,.36,1)' }}
        aria-label="AI 助手"
      >
        {/* 顶部：标题 + 模型 + 关闭 */}
        <header className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
          <Zap size={15} className="text-[hsl(var(--accent))]" />
          <h2 className="text-[13px] font-semibold">AI 助手</h2>

          {/* 模型下拉（MS #28 自带 Key） */}
          <div className="relative ml-2">
            <button
              className="flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--bg-tertiary))] px-2 py-1 text-[11px] text-[hsl(var(--fg-secondary))] hover:border-[hsl(var(--accent-line))]"
              onClick={() => setModelOpen((v) => !v)}
            >
              {MODELS.find((m) => m.id === model)?.name}
              <ChevronDown size={12} />
            </button>
            {modelOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--bg-primary))] shadow-xl">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-[hsl(var(--bg-tertiary))]',
                      m.id === model ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--fg-secondary))]',
                    )}
                    onClick={() => {
                      setModel(m.id);
                      setModelOpen(false);
                    }}
                  >
                    <span>{m.name}</span>
                    <span className="text-[10px] text-[hsl(var(--fg-muted))]">{m.desc}</span>
                  </button>
                ))}
                <div className="border-t border-[hsl(var(--border))] px-3 py-1.5 text-[10px] text-[hsl(var(--fg-muted))]">
                  使用你自带的 API Key，费用不计入平台
                </div>
              </div>
            )}
          </div>

          <button
            className="ml-auto rounded p-1 text-[hsl(var(--fg-muted))] hover:bg-[hsl(var(--bg-tertiary))] hover:text-[hsl(var(--fg-primary))]"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </header>

        {/* 上下文 chip + 方法论 chips + 模式 pill */}
        <div className="space-y-2 border-b border-[hsl(var(--border))] px-4 py-2.5">
          {/* 上下文 chip（可点击切换演示上下文） */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--fg-muted))]">上下文</span>
            <div className="relative">
              <button
                className="flex items-center gap-1 rounded-full border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] px-2.5 py-0.5 text-[11px] font-medium text-[hsl(var(--accent))]"
                onClick={() => setCtxSwitchOpen((v) => !v)}
                title="点击切换上下文"
              >
                {ctx.type === 'scenario' && <TriangleAlert size={11} />}
                {ctx.type === 'coverage' && <Stethoscope size={11} />}
                {ctx.label}
                <ChevronDown size={11} />
              </button>
              {ctxSwitchOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--bg-primary))] shadow-xl">
                  {CONTEXT_SWITCHES.map((c) => (
                    <button
                      key={c.label}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[hsl(var(--fg-secondary))] hover:bg-[hsl(var(--bg-tertiary))]"
                      onClick={() => switchContext(c)}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          c.type === 'scenario' && 'bg-[hsl(0_84%_55%)]',
                          c.type === 'api' && 'bg-[hsl(var(--accent))]',
                          c.type === 'coverage' && 'bg-[hsl(217_76%_53%)]',
                          c.type === 'general' && 'bg-[hsl(var(--fg-muted))]',
                        )}
                      />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 方法论 chips */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--fg-muted))]">方法论</span>
            {METHODS.map((m) => (
              <button
                key={m}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  methods.has(m)
                    ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]'
                    : 'border-[hsl(var(--border))] text-[hsl(var(--fg-muted))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--fg-secondary))]',
                )}
                onClick={() => toggleMethod(m)}
              >
                {m}
              </button>
            ))}
          </div>

          {/* 模式切换 pill */}
          <div className="flex w-fit rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--bg-tertiary))] p-0.5">
            {(
              [
                ['context', '当前上下文'],
                ['free', '自由对话'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                className={cn(
                  'rounded-full px-3 py-0.5 text-[11px] font-medium transition-colors',
                  mode === v
                    ? 'bg-[hsl(var(--accent))] text-black'
                    : 'text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-secondary))]',
                )}
                onClick={() => setMode(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 消息区 */}
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[92%] space-y-2', m.role === 'user' && 'max-w-[80%]')}>
                {m.role === 'user' ? (
                  <div className="rounded-xl rounded-br-sm bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] px-3 py-2 text-[12.5px] leading-relaxed">
                    {m.text}
                  </div>
                ) : (
                  <div className="text-[12.5px] leading-relaxed text-[hsl(var(--fg-secondary))]">{m.text}</div>
                )}

                {/* 诊断块（失败诊断模式） */}
                {m.diagnoses?.map((d, i) => (
                  <div key={i} className="space-y-2">
                    <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold', ROOT_CAUSE_META[d.cause].cls)}>
                      <span className={cn('h-2 w-2 rounded-full', ROOT_CAUSE_META[d.cause].dot)} />
                      {ROOT_CAUSE_META[d.cause].label}
                    </div>
                    <div className="card px-3 py-2.5 text-[12px]">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[hsl(var(--fg-muted))]">
                        <CircleAlert size={12} />
                        {d.step}
                      </div>
                      <div className="mono mb-2 space-y-1 rounded bg-[hsl(var(--bg-primary))] p-2 text-[11px] leading-relaxed">
                        <div className="text-[hsl(142_71%_55%)]">期望  {d.expected}</div>
                        <div className="text-[hsl(0_84%_68%)]">实际  {d.actual}</div>
                      </div>
                      <div className="text-[hsl(var(--fg-secondary))]">
                        <span className="font-semibold text-[hsl(var(--fg-primary))]">修复建议：</span>
                        {d.suggestion}
                      </div>
                    </div>
                  </div>
                ))}

                {/* 生成结果卡片列表 */}
                {m.cards && m.cards.length > 0 && (
                  <div className="space-y-1.5">
                    {m.cards.map((c) => {
                      const checked = (m.checkedIds ?? new Set()).has(c.id);
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            'card flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors',
                            c.synced && 'opacity-60',
                            c.synced ? '!cursor-default' : 'hover:border-[hsl(var(--accent-line))]',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 shrink-0 accent-[hsl(var(--accent))]"
                            checked={c.synced || checked}
                            disabled={c.synced}
                            onChange={() => toggleCard(m.id, c.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={cn('rounded border px-1 py-px text-[10px] font-semibold', KIND_META[c.kind].cls)}>
                                {KIND_META[c.kind].label}
                              </span>
                              <span className={cn('truncate text-[12px]', c.synced ? 'text-[hsl(var(--fg-muted))]' : 'text-[hsl(var(--fg-primary))]')}>
                                {c.title}
                              </span>
                              {c.synced && (
                                <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-[hsl(var(--accent))]">
                                  <Check size={11} />已同步
                                </span>
                              )}
                            </div>
                            {c.method && c.path && (
                              <div className="mono mt-0.5 text-[10.5px] text-[hsl(var(--fg-muted))]">
                                <span className="font-semibold text-[hsl(var(--fg-secondary))]">{c.method}</span> {c.path}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}

                    {/* 同步入库按钮：有勾选时出现 */}
                    {m.cards.some((c) => (m.checkedIds ?? new Set()).has(c.id)) && (
                      <button
                        className="w-full rounded-md bg-[hsl(var(--accent))] py-1.5 text-[12px] font-semibold text-black transition-opacity hover:opacity-90"
                        onClick={() => syncCards(m.id)}
                      >
                        同步 {m.cards.filter((c) => (m.checkedIds ?? new Set()).has(c.id)).length} 条入库
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* thinking 指示 */}
          {thinking && (
            <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--fg-muted))]">
              <Info size={12} className="animate-pulse" />
              正在结合上下文分析…
            </div>
          )}
        </div>

        {/* 底部输入 */}
        <footer className="border-t border-[hsl(var(--border))] p-3">
          <div className="flex items-end gap-2">
            <textarea
              className="input max-h-24 min-h-[36px] flex-1 resize-none"
              rows={1}
              placeholder="继续描述你的意图…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--accent))] text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              onClick={send}
              disabled={!input.trim() || thinking}
              aria-label="发送"
            >
              <Send size={14} />
            </button>
          </div>
          <div className="mt-1.5 text-[10px] text-[hsl(var(--fg-muted))]">
            {mode === 'context'
              ? `当前模式：结合「${ctx.label}」回答，产出可同步入库`
              : '当前模式：自由对话，不携带页面上下文'}
          </div>
        </footer>
      </aside>
    </>
  );
}

