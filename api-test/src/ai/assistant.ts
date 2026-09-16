/**
 * P2.1 AI 助手核心（四模式：chat / gen / diag / explain）。
 *
 * 设计要点：
 * 1. prompt 后端拼装：前端只传 mode + input + context + 勾选的方法论，
 *    system prompt（模式指令 + 方法论指令段 + API 清单/覆盖率上下文）全部在本类拼好；
 * 2. 规则引擎先行：每个模式先跑确定性引擎（复用现有模块），
 *    引擎输出嵌入 prompt 的「[规则引擎输出]」区块，作为 LLM 的润色素材、
 *    也作为 MockProvider 的回复数据源——因此 Mock 与降级路径的输出都是真实数据；
 * 3. 无 LLM 也完整可用：MockProvider 按意图关键词路由，包装规则引擎输出
 *    成结构化中文回复；配置 LLM（env 或显式 cfg）后自动升级真实调用。
 *
 * 各模式的规则引擎复用：
 * - chat：上下文注入（API 清单摘要 + 覆盖率窟窿）；
 * - gen：src/assertion/generate（响应样例→schema 断言）+
 *        src/ai/methodology（方法论维度→用例草稿）；
 * - diag：src/assertion/diagnose（根因分类 + 证据 diff）；
 * - explain：从 schema 推导字段说明表（类型/必填/约束/描述）。
 */
import { randomUUID } from 'node:crypto';
import type { Assertion, HttpMethod, JsonSchema, TestCase } from '../types/models.js';
import { generateSchemaAssertions } from '../assertion/generate.js';
import { diagnoseFailure } from '../assertion/diagnose.js';
import type { DiagnoseInput } from '../assertion/diagnose.js';
import type { Diagnosis } from '../assertion/types.js';
import { sampleValue, schemaType } from '../spec-test/sample.js';
import { objectProperties, requiredPropertyNames } from '../spec-test/edge.js';
import {
  MODE_MARKER,
  SECTION_API_LIST,
  SECTION_COVERAGE_GAPS,
  SECTION_RULE_OUTPUT,
  SECTION_USER_INPUT,
  resolveProvider,
  type LlmMessage,
  type LlmProvider,
} from './provider.js';
import {
  buildMethodologyPrefix,
  generateMethodologyCases,
  type Methodology,
  type MethodologyCaseDraft,
} from './methodology.js';
import { makeCandidate, type ReviewCandidate, type ReviewKind } from './review.js';

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

/** 助手模式 */
export type AssistantMode = 'chat' | 'gen' | 'diag' | 'explain';

/** API 清单条目（上下文注入用的摘要信息） */
export interface ApiSummaryInfo {
  method: HttpMethod;
  path: string;
  /** 接口摘要（如 OpenAPI summary） */
  summary?: string;
  /** 认证方式（注入 prompt 供问答/生成参考） */
  auth_type?: string;
  /** 请求体 schema（gen / explain 的依据） */
  request_schema?: JsonSchema;
  /** 响应体 schema（explain 的依据） */
  response_schema?: JsonSchema;
}

/** gen 模式附带数据 */
export interface GenData {
  /** 生成落点的目标 API（不提供则无法生成用例候选） */
  api?: ApiSummaryInfo;
  /** 真实响应样例（提供则生成 schema 级断言候选） */
  response?: unknown;
  /** 响应状态码（断言生成用，默认 200） */
  status_code?: number;
}

/** diag 模式附带数据（与 src/assertion/diagnose 的 DiagnoseInput 对齐） */
export type DiagData = DiagnoseInput;

/** explain 模式附带数据 */
export interface ExplainData {
  /** 直接指定 schema（优先） */
  schema?: JsonSchema;
  /** schema 标签（缺省 'schema'） */
  schema_label?: string;
  /** 或指定 API（取其请求体/响应体 schema） */
  api?: ApiSummaryInfo;
}

/** 助手上下文（上下文注入 prompt 的材料） */
export interface AssistantContext {
  /** 当前集合的 API 清单摘要 */
  apis?: ApiSummaryInfo[];
  /** 覆盖率窟窿（如 'DELETE /users/:id 完全未测'） */
  coverage_gaps?: string[];
  /** 模式附带的结构化数据（GenData / DiagData / ExplainData） */
  data?: GenData | DiagData | ExplainData | unknown;
}

/** 单次请求 */
export interface AssistantRequest {
  mode: AssistantMode;
  /** 用户输入（自由文本） */
  input: string;
  /** 上下文（API 清单 / 覆盖率窟窿 / 模式数据） */
  context?: AssistantContext;
  /** 勾选的测试方法论（P2.4，影响 gen 模式） */
  methodology?: readonly Methodology[];
}

/** 字段说明行（explain 模式结构化产物） */
export interface FieldDoc {
  /** 字段路径（嵌套用点号） */
  path: string;
  type: string;
  required: boolean;
  /** 约束摘要（enum/min/max/minLength/format…） */
  constraints: string;
  description: string;
}

/** 单次回复 */
export interface AssistantReply {
  mode: AssistantMode;
  /** 回复正文（LLM 或 Mock 规则式） */
  content: string;
  provider: 'mock' | 'openai';
  degraded: boolean;
  /** gen 模式：候选卡片（P2.3 勾选人审的数据源） */
  candidates?: ReviewCandidate[];
  /** diag 模式：结构化诊断结果 */
  diagnosis?: Diagnosis;
  /** explain 模式：字段说明行 */
  fields?: FieldDoc[];
}

/* ------------------------------------------------------------------ */
/* 内部：用例草稿 → TestCase / 候选卡片                                 */
/* ------------------------------------------------------------------ */

/** 统一草稿（方法论草稿 + 默认 happy-path 草稿共用形状） */
interface CaseDraft {
  category: string;
  title: string;
  detail: string;
  method: HttpMethod;
  path: string;
  bodyOverrides: Record<string, unknown>;
  expect: '2xx' | '4xx';
  kind: ReviewKind;
  steps?: Array<{ method: HttpMethod; path: string }>;
}

/** 默认策略草稿（未勾选方法论时）：happy-path */
function happyPathDraft(api: ApiSummaryInfo): CaseDraft {
  return {
    category: 'happy-path',
    title: `${api.method} ${api.path} happy-path（默认策略）`,
    detail: '默认策略：按请求体 schema 取合法样例值的正向用例',
    method: api.method,
    path: api.path,
    bodyOverrides: {},
    expect: '2xx',
    kind: 'case',
  };
}

/** 宽松取 object（sampleValue 可能返回标量） */
function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/** 草稿 → TestCase（source=ai，review_status=pending 保持人审语义） */
function draftToTestCase(draft: CaseDraft, api: ApiSummaryInfo | undefined): TestCase {
  const now = new Date().toISOString();
  const base = api?.request_schema ? asObject(sampleValue(api.request_schema)) : {};
  const body = { ...base, ...draft.bodyOverrides };
  const hasBody = api?.request_schema !== undefined || Object.keys(draft.bodyOverrides).length > 0;
  return {
    id: randomUUID(),
    api_definition_id: '',
    name: draft.title,
    description: draft.detail,
    request: {
      method: draft.method,
      path: draft.path,
      query_params: {},
      headers: {},
      body: hasBody ? JSON.stringify(body) : undefined,
    },
    assertions: [
      { type: 'status', operator: 'in', expected: draft.expect === '2xx' ? [200, 201] : [400, 404, 422] },
    ],
    variables: {},
    source: 'ai',
    tags: ['ai', draft.category],
    last_result: 'pending',
    review_status: 'pending',
    created_at: now,
    updated_at: now,
  };
}

/** 草稿 → 候选卡片（case 载 TestCase；scenario 载步骤描述） */
function draftToCandidate(draft: CaseDraft, api: ApiSummaryInfo | undefined): ReviewCandidate {
  if (draft.kind === 'scenario') {
    return makeCandidate({
      kind: 'scenario',
      title: draft.title,
      payload: {
        name: draft.title,
        description: draft.detail,
        steps: draft.steps ?? [{ method: draft.method, path: draft.path }],
      },
      reason: `AI 依据：${draft.detail}`,
    });
  }
  return makeCandidate({
    kind: 'case',
    title: draft.title,
    payload: draftToTestCase(draft, api),
    reason: `AI 依据：${draft.detail}`,
  });
}

/* ------------------------------------------------------------------ */
/* 内部：四模式规则引擎                                                 */
/* ------------------------------------------------------------------ */

/** 规则引擎统一产出 */
interface EngineOutput {
  ruleText: string;
  candidates?: ReviewCandidate[];
  diagnosis?: Diagnosis;
  fields?: FieldDoc[];
}

/** chat：上下文材料（API 清单 + 覆盖率窟窿） */
function chatEngine(req: AssistantRequest): EngineOutput {
  const apis = req.context?.apis ?? [];
  const gaps = req.context?.coverage_gaps ?? [];
  const lines: string[] = [];
  if (apis.length > 0) {
    lines.push(`当前集合 ${apis.length} 个 API：`);
    for (const a of apis) {
      lines.push(`- ${a.method} ${a.path}${a.summary ? `：${a.summary}` : ''}`);
    }
  } else {
    lines.push('当前无 API 清单上下文。');
  }
  if (gaps.length > 0) {
    lines.push('', `覆盖率窟窿 ${gaps.length} 处：`);
    for (const g of gaps) lines.push(`- ${g}`);
  }
  return { ruleText: lines.join('\n') };
}

/** gen：方法论/默认策略用例草稿 + 响应样例断言 */
function genEngine(req: AssistantRequest): EngineOutput {
  const data = req.context?.data as GenData | undefined;
  const api = data?.api;
  const selected = req.methodology ?? [];
  const candidates: ReviewCandidate[] = [];

  // 1. 用例草稿：勾了方法论 → 方法论维度；没勾 → 默认 happy-path
  if (api) {
    const drafts: CaseDraft[] =
      selected.length > 0
        ? generateMethodologyCases(
            {
              method: api.method,
              path: api.path,
              request_schema: api.request_schema,
              scenario_apis: (req.context?.apis ?? []).map((a) => ({ method: a.method, path: a.path, summary: a.summary })),
            },
            selected,
          ).map(toCaseDraft)
        : [happyPathDraft(api)];
    for (const draft of drafts) candidates.push(draftToCandidate(draft, api));
  }

  // 2. 断言候选：真实响应样例 → schema 级断言（复用 src/assertion/generate）
  if (api && data?.response !== undefined) {
    const assertions: Assertion[] = generateSchemaAssertions(data.response, { status_code: data.status_code });
    candidates.push(
      makeCandidate({
        kind: 'assertion',
        title: `${api.method} ${api.path} 响应 schema 断言（${assertions.length} 条）`,
        payload: assertions,
        reason: 'AI 依据：从真实响应样例推导字段存在性/类型/取值断言',
      }),
    );
  }

  if (candidates.length === 0) {
    return {
      ruleText: '未提供目标 API（含请求体 schema）或响应样例，规则引擎无候选产出。请在上下文 data 里附带 api（gen 用）后重试。',
    };
  }

  const kindLabel: Record<ReviewKind, string> = { case: '用例', assertion: '断言', scenario: '场景' };
  const lines = [`候选 ${candidates.length} 项：`];
  for (const c of candidates) lines.push(`- [${kindLabel[c.kind]}] ${c.title}（${c.reason}）`);
  return { ruleText: lines.join('\n'), candidates };
}

/** MethodologyCaseDraft → 内部统一草稿形状 */
function toCaseDraft(d: MethodologyCaseDraft): CaseDraft {
  return { ...d, kind: d.category === 'scenario' ? 'scenario' : 'case' };
}

/** 根因中文标签 */
function rootCauseLabel(cause: Diagnosis['root_cause']): string {
  switch (cause) {
    case 'contract_break':
      return '契约破坏（contract_break）';
    case 'business_change':
      return '业务变更（business_change）';
    case 'environment_diff':
      return '环境差异（environment_diff）';
    default:
      return '通过（无根因）';
  }
}

/** diag：复用 src/assertion/diagnose 的失败诊断 */
function diagEngine(req: AssistantRequest): EngineOutput {
  const data = req.context?.data as DiagData | undefined;
  if (!data || !Array.isArray(data.assertions)) {
    return {
      ruleText: '未提供失败信息（期望断言 assertions + 实际响应 response），规则引擎无法诊断。请在上下文 data 里附带 DiagnoseInput 后重试。',
    };
  }
  const diagnosis = diagnoseFailure(data);
  const lines = [
    `根因分类：${rootCauseLabel(diagnosis.root_cause)}`,
    `判定理由：${diagnosis.reason}`,
  ];
  if (diagnosis.suggestions.length > 0) {
    lines.push('排查建议：');
    diagnosis.suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  lines.push('', '失败证据：', diagnosis.evidence.summary);
  return { ruleText: lines.join('\n'), diagnosis };
}

/** schema 约束摘要 */
function constraintsOf(schema: JsonSchema): string {
  const parts: string[] = [];
  if (Array.isArray(schema.enum)) parts.push(`enum=[${schema.enum.map((v) => JSON.stringify(v)).join(',')}]`);
  if (typeof schema.minimum === 'number') parts.push(`min=${schema.minimum}`);
  if (typeof schema.maximum === 'number') parts.push(`max=${schema.maximum}`);
  if (typeof schema.minLength === 'number') parts.push(`minLength=${schema.minLength}`);
  if (typeof schema.maxLength === 'number') parts.push(`maxLength=${schema.maxLength}`);
  if (typeof schema.format === 'string') parts.push(`format=${schema.format}`);
  return parts.length > 0 ? parts.join(', ') : '-';
}

/** 递归推导字段说明（深度上限 3，防爆炸） */
function fieldDocs(schema: JsonSchema | undefined, prefix = '', depth = 1): FieldDoc[] {
  if (!schema || depth > 3) return [];
  const out: FieldDoc[] = [];
  const required = requiredPropertyNames(schema);
  for (const [name, prop] of Object.entries(objectProperties(schema))) {
    const path = prefix === '' ? name : `${prefix}.${name}`;
    out.push({
      path,
      type: schemaType(prop) ?? 'unknown',
      required: required.includes(name),
      constraints: constraintsOf(prop),
      description: typeof prop.description === 'string' ? prop.description : '',
    });
    if (schemaType(prop) === 'object') out.push(...fieldDocs(prop, path, depth + 1));
  }
  return out;
}

/** explain：schema → 字段说明表 */
function explainEngine(req: AssistantRequest): EngineOutput {
  const data = req.context?.data as ExplainData | undefined;
  const schemas: Array<{ label: string; schema: JsonSchema | undefined }> = [];
  if (data?.schema) {
    schemas.push({ label: data.schema_label ?? 'schema', schema: data.schema });
  } else if (data?.api) {
    schemas.push({ label: '请求体', schema: data.api.request_schema });
    schemas.push({ label: '响应体', schema: data.api.response_schema });
  }
  const present = schemas.filter((s): s is { label: string; schema: JsonSchema } => s.schema !== undefined);
  if (present.length === 0) {
    return {
      ruleText: '未提供 schema（API 定义或字段 schema），规则引擎无法生成字段说明。请在上下文 data 里附带 schema 或 api（explain 用）后重试。',
    };
  }
  const fields: FieldDoc[] = [];
  const lines: string[] = [];
  for (const { label, schema } of present) {
    const docs = fieldDocs(schema);
    fields.push(...docs);
    lines.push(`字段说明（${label}，共 ${docs.length} 个字段）：`);
    lines.push('字段 | 类型 | 必填 | 约束 | 说明');
    for (const f of docs) {
      lines.push(`${f.path} | ${f.type} | ${f.required ? '是' : '否'} | ${f.constraints} | ${f.description === '' ? '-' : f.description}`);
    }
    lines.push('');
  }
  return { ruleText: lines.join('\n').trimEnd(), fields };
}

/* ------------------------------------------------------------------ */
/* AiAssistant                                                         */
/* ------------------------------------------------------------------ */

/** 模式指令（system prompt 的模式说明段） */
const MODE_INSTRUCTIONS: Record<AssistantMode, string> = {
  chat: '当前为自由问答模式：结合下方 API 清单与覆盖率信息，回答用户的接口测试问题。',
  gen: '当前为用例生成模式：规则引擎已按勾选的方法论产出候选（见用户消息的规则引擎输出）；请在其基础上润色说明并补充设计思路，不要虚构清单之外的接口行为。',
  diag: '当前为失败诊断模式：规则引擎已完成根因分类与证据收集；请用中文向用户解释根因，并把排查建议按优先级排列。',
  explain: '当前为含义解释模式：规则引擎已从 schema 生成字段说明表；请用中文解释各字段含义与约束，可补充业务理解但不要虚构字段。',
};

/**
 * AI 助手：四模式会话入口。
 * - provider 缺省走 resolveProvider()（env 配了 LLM 用真实端点，否则 Mock）；
 * - 实例级对话历史（最近 5 轮），buildMessages 时注入；
 * - 前端只传 mode + input + context + methodology，prompt 全部后端拼装。
 */
export class AiAssistant {
  private readonly provider: LlmProvider;
  private history: LlmMessage[] = [];
  /** 保留最近 10 条消息（5 轮对话） */
  private static readonly MAX_HISTORY = 10;

  constructor(provider?: LlmProvider) {
    this.provider = provider ?? resolveProvider();
  }

  /** 当前 provider 名（mock / openai） */
  get providerName(): 'mock' | 'openai' {
    return this.provider.name;
  }

  /** 对话历史（只读快照） */
  getHistory(): LlmMessage[] {
    return [...this.history];
  }

  /** 清空对话历史 */
  resetHistory(): void {
    this.history = [];
  }

  /** 单次问答：规则引擎 → 拼 prompt → 调 provider → 汇总回复 */
  async ask(req: AssistantRequest): Promise<AssistantReply> {
    const engine = this.runEngine(req);
    const userMessage: LlmMessage = {
      role: 'user',
      content: [`${SECTION_USER_INPUT}\n${req.input}`, `${SECTION_RULE_OUTPUT}\n${engine.ruleText}`].join('\n\n'),
    };
    const messages: LlmMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(req) },
      ...this.history,
      userMessage,
    ];

    const result = await this.provider.chat(messages);

    this.history.push(userMessage, { role: 'assistant', content: result.content });
    if (this.history.length > AiAssistant.MAX_HISTORY) {
      this.history = this.history.slice(-AiAssistant.MAX_HISTORY);
    }

    return {
      mode: req.mode,
      content: result.content,
      provider: result.provider,
      degraded: result.degraded,
      candidates: engine.candidates,
      diagnosis: engine.diagnosis,
      fields: engine.fields,
    };
  }

  /** 模式路由到规则引擎 */
  private runEngine(req: AssistantRequest): EngineOutput {
    switch (req.mode) {
      case 'chat':
        return chatEngine(req);
      case 'gen':
        return genEngine(req);
      case 'diag':
        return diagEngine(req);
      case 'explain':
        return explainEngine(req);
    }
  }

  /** system prompt 后端拼装：角色 + 模式标记与指令 + 方法论指令段 + 上下文注入 */
  private buildSystemPrompt(req: AssistantRequest): string {
    const parts: string[] = [
      '你是 VerifyOS 的 AI 接口测试助手。',
      MODE_MARKER[req.mode],
      MODE_INSTRUCTIONS[req.mode],
    ];

    const methodologyPrefix = buildMethodologyPrefix(req.methodology ?? []);
    if (methodologyPrefix !== '') parts.push(methodologyPrefix);

    const apis = req.context?.apis ?? [];
    if (apis.length > 0) {
      parts.push(
        [
          SECTION_API_LIST,
          ...apis.map(
            (a) =>
              `- ${a.method} ${a.path}${a.summary ? `：${a.summary}` : ''}` +
              `${a.auth_type && a.auth_type !== 'none' ? `（auth: ${a.auth_type}）` : ''}`,
          ),
        ].join('\n'),
      );
    }

    const gaps = req.context?.coverage_gaps ?? [];
    if (gaps.length > 0) {
      parts.push([SECTION_COVERAGE_GAPS, ...gaps.map((g) => `- ${g}`)].join('\n'));
    }

    parts.push('要求：使用简体中文；只基于给定材料回答，不要编造接口行为。');
    return parts.join('\n\n');
  }
}
