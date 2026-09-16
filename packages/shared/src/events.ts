import { z } from 'zod';

/**
 * VerifyOS Run 事件协议 v1
 * 前后端唯一契约：Web / Mobile / PR 三场景复用（platform 无关）。
 * 反推 qa.tech 的产品化结论：thinking / action / observation 三分 + evidenceId 贯穿。
 * 详见《实现方案V1.md》§3。
 */

// ---------- 基础 ----------
export const Platform = z.enum(['web', 'mobile', 'api']);
export type Platform = z.infer<typeof Platform>;

export const StepKind = z.enum(['module', 'ai', 'deterministic', 'assertion']);
export type StepKind = z.infer<typeof StepKind>;

export const Verdict = z.enum(['pass', 'fail', 'unknown']);
export type Verdict = z.infer<typeof Verdict>;

/** 环境（含 Preview：PR 验证 = URL override 自动落 is_preview 记录） */
export const Environment = z.object({
  shortId: z.string().optional(),
  url: z.string(),
  name: z.string().optional(),
  isPreview: z.boolean().default(false),
  branch: z.string().optional(),
  prNumber: z.number().optional(),
});
export type Environment = z.infer<typeof Environment>;

export const RunTarget = z.object({
  applicationShortId: z.string(),
  platform: Platform.default('web'),
  environment: Environment,
  devicePresetShortId: z.string().optional(),
});
export type RunTarget = z.infer<typeof RunTarget>;

export const EvidenceKind = z.enum(['screenshot', 'video', 'network', 'console', 'trace', 'log']);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

/** 审批门：凭据填写 / 写操作确认（对应 WAITING_FOR_APPROVAL） */
export const ApprovalGate = z.object({
  gateId: z.string(),
  kind: z.enum(['credential', 'db_exec', 'vision', 'external_send', 'custom']),
  title: z.string(),
  /** 动态表单 schema（assistant-ui 式 JSON Schema 渲染） */
  formSchema: z.record(z.unknown()).optional(),
  message: z.string().optional(),
});
export type ApprovalGate = z.infer<typeof ApprovalGate>;

// ---------- 事件 ----------
const Base = z.object({
  runId: z.string(),
  ts: z.string().datetime().optional(),
});

export const RunStarted = Base.extend({
  type: z.literal('run.started'),
  target: RunTarget,
  trigger: z.enum(['manual', 'schedule', 'pr', 'api']).default('manual'),
  totalSteps: z.number().int().nonnegative().optional(),
});

export const StepStarted = Base.extend({
  type: z.literal('step.started'),
  stepId: z.string(),
  index: z.number().int().nonnegative(),
  title: z.string(),
  kind: StepKind,
});

/** 💭 Agent 思考（可多条，前端按顺序追加渲染） */
export const StepThinking = Base.extend({
  type: z.literal('step.thinking'),
  stepId: z.string(),
  text: z.string(),
});

/** 子动作（Click/Tap/Type/Scroll/…，工具名来自 ToolRegistry） */
export const StepAction = Base.extend({
  type: z.literal('step.action'),
  stepId: z.string(),
  tool: z.string(),
  action: z.string(),
  args: z.record(z.unknown()).optional(),
});

/** 观察结果（判定依据；screenshotId 可选挂截图） */
export const StepObservation = Base.extend({
  type: z.literal('step.observation'),
  stepId: z.string(),
  ok: z.boolean(),
  detail: z.string(),
  durationMs: z.number().nonnegative().optional(),
  screenshotId: z.string().optional(),
});

export const StepEvidence = Base.extend({
  type: z.literal('step.evidence'),
  stepId: z.string(),
  kind: EvidenceKind,
  uri: z.string(),
  meta: z.record(z.unknown()).optional(),
});

export const StepCompleted = Base.extend({
  type: z.literal('step.completed'),
  stepId: z.string(),
  verdict: Verdict,
  cacheHit: z.boolean().optional(),
  /** 步骤耗时（毫秒）——归档报告用 */
  durationMs: z.number().optional(),
  /** 本步骤 LLM 调用次数——归档报告用 */
  llmCalls: z.number().optional(),
});

export const RunWaitingApproval = Base.extend({
  type: z.literal('run.waiting_approval'),
  gate: ApprovalGate,
});

export const RunResumed = Base.extend({
  type: z.literal('run.resumed'),
  gateId: z.string(),
  approved: z.boolean(),
});

export const RunCompleted = Base.extend({
  type: z.literal('run.completed'),
  verdict: Verdict,
  durationMs: z.number().nonnegative().optional(),
  /** Output Values：Agent 显式保存，跨会话传递（依赖链数据流） */
  output: z.record(z.string()).optional(),
  failureSummary: z.string().optional(),
});

export const RunEvent = z.discriminatedUnion('type', [
  RunStarted,
  StepStarted,
  StepThinking,
  StepAction,
  StepObservation,
  StepEvidence,
  StepCompleted,
  RunWaitingApproval,
  RunResumed,
  RunCompleted,
]);
export type RunEvent = z.infer<typeof RunEvent>;

export const RunEventType = z.enum([
  'run.started',
  'step.started',
  'step.thinking',
  'step.action',
  'step.observation',
  'step.evidence',
  'step.completed',
  'run.waiting_approval',
  'run.resumed',
  'run.completed',
]);
export type RunEventType = z.infer<typeof RunEventType>;

// ---------- 便捷构造 ----------
export const ev = {
  runStarted: (runId: string, target: RunTarget, trigger: 'manual' | 'schedule' | 'pr' | 'api' = 'manual'): RunEvent =>
    RunStarted.parse({ type: 'run.started', runId, target, trigger, ts: new Date().toISOString() }),
  stepStarted: (runId: string, stepId: string, index: number, title: string, kind: StepKind): RunEvent =>
    StepStarted.parse({ type: 'step.started', runId, stepId, index, title, kind, ts: new Date().toISOString() }),
  thinking: (runId: string, stepId: string, text: string): RunEvent =>
    StepThinking.parse({ type: 'step.thinking', runId, stepId, text, ts: new Date().toISOString() }),
  action: (runId: string, stepId: string, tool: string, action: string, args?: Record<string, unknown>): RunEvent =>
    StepAction.parse({ type: 'step.action', runId, stepId, tool, action, args, ts: new Date().toISOString() }),
  observation: (runId: string, stepId: string, ok: boolean, detail: string, durationMs?: number): RunEvent =>
    StepObservation.parse({ type: 'step.observation', runId, stepId, ok, detail, durationMs, ts: new Date().toISOString() }),
  stepCompleted: (runId: string, stepId: string, verdict: Verdict, cacheHit?: boolean, durationMs?: number, llmCalls?: number): RunEvent =>
    StepCompleted.parse({ type: 'step.completed', runId, stepId, verdict, cacheHit, durationMs, llmCalls, ts: new Date().toISOString() }),
  evidence: (runId: string, stepId: string, kind: 'screenshot' | 'video' | 'network' | 'console' | 'trace' | 'log', uri: string, meta?: Record<string, unknown>): RunEvent =>
    StepEvidence.parse({ type: 'step.evidence', runId, stepId, kind, uri, meta, ts: new Date().toISOString() }),
  runCompleted: (runId: string, verdict: Verdict, output?: Record<string, string>, failureSummary?: string): RunEvent =>
    RunCompleted.parse({ type: 'run.completed', runId, verdict, output, failureSummary, ts: new Date().toISOString() }),
};
