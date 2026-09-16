import type { RunEvent, Verdict } from '@verifyos/shared';

/**
 * 调度器领域类型（B6）
 * 对齐 qa.tech 依赖模型：Resume From（恰 1 个）/ Wait For（多个）
 * 链内串行共享浏览器状态 · 链间并行隔离 · per-environment 并发上限
 */

export interface VerificationNode {
  shortId: string;
  title: string;
  environmentShortId: string;
  /** 该验证最近一次成功 run 产出的浏览器状态（用于 6h 复用判定） */
  lastState?: { uri: string; capturedAt: Date; expiresAt: Date } | null;
}

export interface DependencyEdge {
  /** 依赖方（等待/继承的那个验证） */
  from: string;
  /** 被依赖方 */
  to: string;
  kind: 'resume_from' | 'wait_for';
}

export interface RunResult {
  verdict: Verdict;
  /** Output Values（Agent 显式保存，跨会话传递） */
  output?: Record<string, string>;
  /** 本次 run 产出的浏览器状态（供链内下一个 resume_from 继承） */
  browserStateUri?: string;
  failureSummary?: string;
}

/** 执行上下文：调度器注入 executor 的一切输入 */
export interface ExecContext {
  /** 链 ID（隔离 BrowserContext 的标识；同链相同，跨链不同） */
  chainId: string;
  /** resume_from 继承的浏览器状态 URI（无则新开会话） */
  browserState?: string;
  /** 全部依赖（两类）已完成 run 的 Output Values 合并（后者覆盖前者） */
  outputs: Record<string, string>;
  /** 状态是否来自 6h 复用（true = 依赖未重跑，直接继承） */
  stateReused: boolean;
}

/** 执行器接口：真实实现是 C1 run-worker（Stagehand）；测试注入 mock */
export type Executor = (v: VerificationNode, ctx: ExecContext) => Promise<RunResult>;

export interface SchedulerOptions {
  /** per-environment 并发上限；空 = 不限 */
  envConcurrency?: Record<string, number>;
  /** 全局并发上限（默认 8） */
  maxConcurrency?: number;
  /** Resume From 状态复用窗口（默认 6h，对齐 qa.tech） */
  resumeStateTtlMs?: number;
  /** 事件流回调（WS 广播/C4 实时渲染挂这里） */
  emit?: (e: RunEvent) => void;
  now?: () => Date;
}

export interface NodeOutcome {
  shortId: string;
  status: 'passed' | 'failed' | 'unknown' | 'skipped' | 'reused';
  verdict?: Verdict;
  output?: Record<string, string>;
  browserStateUri?: string;
  chainId: string;
  reason?: string;
}

export interface ScheduleReport {
  outcomes: NodeOutcome[];
  /** 全局执行顺序（shortId 序列，含 reused 标记） */
  order: string[];
  ok: boolean;
}
