/**
 * C3：UNKNOWN 触达校验（UNKNOWN ≠ PASS 防假绿）。
 *
 * 语义：步骤全绿 ≠ 验证了想验证的东西。步骤声明 targetRef（目标分支/页面），
 * Run 实际触达路径（visitedUrls）没经过它、且 Coverage Graph 里也找不到该分支 → 判 unknown。
 * graph 可选：提供时做「节点存在性」反查，让解释更有据（原型 PR 屏「未触达回调分支」的引擎级实现）。
 */

export interface GraphLike {
  nodes: Array<{ ref: string; title?: string | null }>;
  edges: Array<{ fromRef: string; toRef: string }>;
}

export interface ReachabilityInput {
  stepId: string;
  stepTitle: string;
  /** 步骤声明的目标分支（URL 子串或图节点 ref） */
  targetRef: string;
  /** 步骤本身的执行判定（pass 才需要做触达校验） */
  stepVerdict: 'pass' | 'fail' | 'unknown';
  /** 本次 Run 实际触达的 URL 路径（按序采样） */
  visitedUrls: string[];
  /** 当前 Coverage Graph（可选；提供则做节点存在性反查） */
  graph?: GraphLike;
}

export interface ReachabilityVerdict {
  stepId: string;
  verdict: 'pass' | 'unknown' | 'fail';
  explanation: string;
  /** 命中的实际 URL（诊断用） */
  matchedUrl?: string;
  graphHasNode: boolean;
}

export function verifyReachability(input: ReachabilityInput): ReachabilityVerdict {
  const { stepId, stepTitle, targetRef, stepVerdict, visitedUrls, graph } = input;

  // 步骤本身失败/已 unknown → 不做触达改判
  if (stepVerdict !== 'pass') {
    return { stepId, verdict: stepVerdict, explanation: `步骤执行判定为 ${stepVerdict}`, graphHasNode: false };
  }

  const matchedUrl = visitedUrls.find((u) => u.includes(targetRef));
  const graphHasNode = graph ? graph.nodes.some((n) => n.ref.includes(targetRef)) : false;

  if (matchedUrl) {
    return {
      stepId,
      verdict: 'pass',
      explanation: `已触达目标「${targetRef}」（${matchedUrl}）`,
      matchedUrl,
      graphHasNode,
    };
  }

  // 步骤全绿但未触达目标 → UNKNOWN
  const graphHint = graph
    ? graphHasNode
      ? `Coverage Graph 中存在节点「${targetRef}」，但本次 Run 路径未经过它`
      : `Coverage Graph 中不存在「${targetRef}」节点（该分支从未被任何探索覆盖）`
    : '实际触达路径未经过该目标';
  return {
    stepId,
    verdict: 'unknown',
    explanation: `步骤全绿但未触达目标「${targetRef}」——${graphHint}。按 UNKNOWN 处理，不允许假绿（UNKNOWN ≠ PASS）。`,
    graphHasNode,
  };
}

/** 批量校验 + Run 级聚合：any fail → fail；else any unknown → unknown；else pass */
export function aggregateVerdicts(checks: ReachabilityVerdict[], stepVerdicts: Array<'pass' | 'fail' | 'unknown'>): 'pass' | 'fail' | 'unknown' {
  if (stepVerdicts.includes('fail')) return 'fail';
  if (stepVerdicts.includes('unknown') || checks.some((c) => c.verdict === 'unknown')) return 'unknown';
  return 'pass';
}
