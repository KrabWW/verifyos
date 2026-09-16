/**
 * P2.1 LLM Provider 层（AI 智能层的最底层）。
 *
 * 设计约束：项目常态是「无 LLM 配置」——所有 AI 能力必须无 LLM 也能跑。
 * 因此本文件提供三个构件：
 * - MockProvider：规则式 Provider，按意图关键词返回结构化中文回复（演示/降级两用）；
 * - OpenAICompatibleProvider：fetch 调 OpenAI 兼容端点 /chat/completions，
 *   超时 30s；任何失败（网络/HTTP/解析）都降级到 MockProvider，并在返回里标注 degraded；
 * - resolveProvider()：无入参时读 env（VERIFYOS_AI_BASE_URL / VERIFYOS_AI_API_KEY /
 *   VERIFYOS_AI_MODEL），全部缺失时回落 MockProvider。
 *
 * 与 assistant.ts 的约定（MockProvider 规则式回复的依据）：
 * assistant 在后端拼装 prompt 时会写入固定的「区块标记」（本文件导出的常量），
 * MockProvider 通过解析这些标记 + 关键词路由，产出有意义的结构化中文回复——
 * 因为规则引擎的确定性输出（候选用例/诊断结论/字段说明）就嵌在消息里，
 * 所以 Mock 与降级路径拿到的都是「真实数据」，不是占位话术。
 */

/** LLM 连接配置（OpenAI 兼容端点） */
export interface LlmConfig {
  base_url: string;
  api_key: string;
  model: string;
}

/** 对话消息（与 OpenAI chat/completions 的 messages 对齐） */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** provider 调用结果：content + 来源 + 是否降级 */
export interface ChatResult {
  /** 回复正文 */
  content: string;
  /** 实际产出回复的 provider */
  provider: 'mock' | 'openai';
  /** openai 调用失败降级到 mock 时为 true */
  degraded: boolean;
}

/** Provider 统一接口 */
export interface LlmProvider {
  readonly name: 'mock' | 'openai';
  chat(messages: LlmMessage[]): Promise<ChatResult>;
}

/** env 变量名（verify 脚本与设置页共用） */
export const ENV_BASE_URL = 'VERIFYOS_AI_BASE_URL';
export const ENV_API_KEY = 'VERIFYOS_AI_API_KEY';
export const ENV_MODEL = 'VERIFYOS_AI_MODEL';

/** 默认模型名（env 与入参都未指定时兜底，OpenAI 兼容端点普遍接受任意字符串） */
export const DEFAULT_MODEL = 'gpt-4o-mini';

/** 四模式标记（assistant 拼进 system prompt，MockProvider 按此路由意图） */
export const MODE_MARKER = {
  chat: '【模式：自由问答】',
  gen: '【模式：用例生成】',
  diag: '【模式：失败诊断】',
  explain: '【模式：含义解释】',
} as const;

/** prompt 区块标记（assistant 写入、MockProvider 解析） */
export const SECTION_USER_INPUT = '[用户输入]';
export const SECTION_RULE_OUTPUT = '[规则引擎输出]';
export const SECTION_API_LIST = '【当前集合 API 清单】';
export const SECTION_COVERAGE_GAPS = '【覆盖率窟窿】';

/** 区块标记行形态：[xxx] 或 【xxx】独占一行 */
const MARKER_LINE_RE = /^(?:\[[^\]]*\]|【[^】]*】)\s*$/;

/** 从文本中提取某个区块标记下的内容（取最后一处：多轮会话时历史消息也含区块，当前轮在后） */
export function extractSection(text: string, marker: string): string[] {
  const lines = text.split('\n');
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.trim() === marker) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(idx + 1)) {
    if (MARKER_LINE_RE.test(line.trim())) break;
    out.push(line);
  }
  // 去掉首尾空行
  while (out.length > 0 && out[0]!.trim() === '') out.shift();
  while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
  return out;
}

/* ------------------------------------------------------------------ */
/* MockProvider：规则式回复                                             */
/* ------------------------------------------------------------------ */

/** 意图关键词路由：按模式标记 + 关键词判定回复形态 */
type MockMode = 'chat' | 'gen' | 'diag' | 'explain';

function detectMode(text: string): MockMode {
  if (text.includes(MODE_MARKER.gen)) return 'gen';
  if (text.includes(MODE_MARKER.diag)) return 'diag';
  if (text.includes(MODE_MARKER.explain)) return 'explain';
  return 'chat';
}

/** 截断行数（防止规则引擎输出过长把回复撑爆） */
function capLines(lines: string[], max = 40): string[] {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max), `……（其余 ${lines.length - max} 行略）`];
}

/** chat 模式：围绕 API 清单 / 覆盖窟窿 / 能力介绍做规则式回答 */
function mockChatReply(text: string): string {
  const apis = extractSection(text, SECTION_API_LIST);
  const gaps = extractSection(text, SECTION_COVERAGE_GAPS);
  const userInput = extractSection(text, SECTION_USER_INPUT).join(' ');
  const apiCount = apis.filter((l) => l.trim().startsWith('-')).length;

  // 问 API 清单 / 数量
  if (/接口|api|清单|列表|多少|几个/i.test(userInput) && apiCount > 0) {
    const lines = [`当前集合共 ${apiCount} 个 API：`, ...apis.map((l) => l.trim())];
    if (gaps.length > 0) lines.push('', '已知覆盖率窟窿：', ...gaps.map((l) => l.trim()));
    return lines.join('\n');
  }

  // 问测试 / 用例生成
  if (/用例|生成|测试|覆盖/.test(userInput)) {
    const lines: string[] = [];
    if (apiCount > 0) lines.push(`当前集合有 ${apiCount} 个 API 可生成用例。`);
    if (gaps.length > 0) lines.push(`检测到 ${gaps.length} 处覆盖率窟窿，建议优先补测：`, ...capLines(gaps, 5));
    lines.push('可切换到「用例生成」模式：勾选测试方法论（等价类划分 / 边界值分析 / 判定表 / 场景法）后生成候选用例，再勾选入库。');
    return lines.join('\n');
  }

  // 默认：能力介绍 + 上下文概览
  const lines = [
    '我是 VerifyOS AI 接口测试助手，支持四种模式：',
    '1. 自由问答（chat）：结合当前集合的 API 清单回答接口测试问题；',
    '2. 用例生成（gen）：按勾选的测试方法论生成候选用例与断言；',
    '3. 失败诊断（diag）：对失败用例给出根因分类与排查建议；',
    '4. 含义解释（explain）：从 schema 生成字段含义说明表。',
  ];
  if (apiCount > 0) lines.push(``, `当前上下文：${apiCount} 个 API${gaps.length > 0 ? `，${gaps.length} 处覆盖率窟窿` : ''}。`);
  return lines.join('\n');
}

/** gen / diag / explain 模式：模式化包装规则引擎输出 */
function mockStructuredReply(mode: Exclude<MockMode, 'chat'>, system: string, text: string): string {
  const rule = capLines(extractSection(text, SECTION_RULE_OUTPUT));
  const hasMethodology = system.includes('【方法论指导】');

  if (rule.length === 0) {
    // 规则引擎没有产出（缺上下文）：诚实说明缺什么
    const hint: Record<'gen' | 'diag' | 'explain', string> = {
      gen: '未提供目标 API（含请求体 schema）或响应样例，暂无可生成的候选。请在上下文里附带 API 定义后再试。',
      diag: '未提供失败信息（期望断言 + 实际响应），暂无可诊断的内容。请附带失败用例的断言与响应后再试。',
      explain: '未提供 schema（API 定义或字段 schema），暂无可解释的字段。请附带 API 定义后再试。',
    };
    return hint[mode];
  }

  if (mode === 'gen') {
    const head = ['【AI 生成完成】', hasMethodology ? '已按勾选的测试方法论生成候选：' : '已按默认策略（happy-path + schema 断言）生成候选：'];
    return [...head, ...rule, '', '以上候选已生成勾选卡片，请人工审阅后确认入库（aiCreate 标记）。'].join('\n');
  }
  if (mode === 'diag') {
    return ['【失败诊断（规则引擎）】', ...rule, '', '建议按上述顺序排查；确认属业务变更后可在生成模式重建断言。'].join('\n');
  }
  return ['【字段含义说明（规则引擎）】', ...rule, '', '以上说明由 schema 推导；枚举/边界约束已列入「约束」列。'].join('\n');
}

/** 规则式回复主入口：意图关键词路由 + 区块解析 */
export function mockReply(messages: LlmMessage[]): string {
  // 模式只看 system 消息（assistant 每轮重建 system prompt，只含当前模式；
  // 历史消息里的旧模式标记不参与路由）
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const text = messages.map((m) => m.content).join('\n');
  const mode = detectMode(system);
  return mode === 'chat' ? mockChatReply(text) : mockStructuredReply(mode, system, text);
}

/** 规则式 Provider（演示与降级两用）：同步逻辑、异步签名与 LlmProvider 对齐 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock' as const;

  async chat(messages: LlmMessage[]): Promise<ChatResult> {
    return { content: mockReply(messages), provider: 'mock', degraded: false };
  }
}

/* ------------------------------------------------------------------ */
/* OpenAICompatibleProvider：真实调用 + 失败降级                         */
/* ------------------------------------------------------------------ */

/** OpenAI 兼容端点返回的最小结构 */
interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

export class OpenAICompatibleProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private readonly fallback = new MockProvider();

  constructor(private readonly config: LlmConfig) {}

  async chat(messages: LlmMessage[]): Promise<ChatResult> {
    const url = `${this.config.base_url.replace(/\/+$/, '')}/chat/completions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.api_key}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`LLM 端点返回 HTTP ${res.status}`);
      }
      const data = (await res.json()) as OpenAiChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('LLM 返回内容为空');
      }
      return { content, provider: 'openai', degraded: false };
    } catch {
      // 任何失败（网络 / 超时 / HTTP / 解析）都降级到 MockProvider，并标注 degraded
      const fallback = await this.fallback.chat(messages);
      return { ...fallback, degraded: true };
    }
  }
}

/* ------------------------------------------------------------------ */
/* resolveProvider：env 解析                                            */
/* ------------------------------------------------------------------ */

/** 从候选配置里凑出一份完整配置（base_url + api_key 必须齐；model 走缺省链），不足返回 undefined */
function tryComplete(...candidates: Array<Partial<LlmConfig> | undefined>): LlmConfig | undefined {
  const merged: Partial<LlmConfig> = {};
  for (const c of candidates) {
    if (c?.base_url && !merged.base_url) merged.base_url = c.base_url;
    if (c?.api_key && !merged.api_key) merged.api_key = c.api_key;
    if (c?.model && !merged.model) merged.model = c.model;
  }
  if (!merged.base_url?.trim() || !merged.api_key?.trim()) return undefined;
  return {
    base_url: merged.base_url.trim(),
    api_key: merged.api_key.trim(),
    model: merged.model?.trim() || DEFAULT_MODEL,
  };
}

/**
 * 解析 Provider：
 * - 显式传入完整 cfg（base_url + api_key）→ OpenAICompatibleProvider；
 * - 否则读 env（VERIFYOS_AI_BASE_URL / VERIFYOS_AI_API_KEY / VERIFYOS_AI_MODEL）；
 * - env 也不全 → MockProvider（项目常态：无 LLM 也能跑）。
 * model 缺省链：入参 → env → DEFAULT_MODEL。
 */
export function resolveProvider(cfg?: Partial<LlmConfig>): LlmProvider {
  const envCfg: Partial<LlmConfig> = {
    base_url: process.env[ENV_BASE_URL],
    api_key: process.env[ENV_API_KEY],
    model: process.env[ENV_MODEL],
  };
  const complete = tryComplete(cfg, envCfg);
  return complete ? new OpenAICompatibleProvider(complete) : new MockProvider();
}
