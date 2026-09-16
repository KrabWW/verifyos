/**
 * ScenarioTree —— 场景步骤树（MeterSphere 编排形态，六原语）。
 *
 * 能力：
 *  - 递归渲染树形步骤：缩进 + 连接线，条件/循环节点可折叠；
 *  - 六原语类型徽章：request 绿 / condition 橙 / loop 紫 / wait 灰 / assert 绿 / ref 青；
 *  - 每步骤行：启用 switch（off → 整行降透明 + 状态点灰）+ 执行状态点（pass/fail 发光/skip/run 脉冲）+ 耗时；
 *  - fail 节点红色高亮，可展开失败断言 diff（期望/实际）；
 *  - 运行按钮：逐步动画（running → pass/fail/skip），跑完显示汇总。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scenarioDemoNodes, type ScenarioNode, type StepStatus, type StepType } from './scenario.data';

export interface ScenarioTreeProps {
  /** 场景名称（顶栏展示） */
  scenarioName?: string;
  /** 初始步骤树，缺省使用内置演示数据 */
  nodes?: ScenarioNode[];
  /** 运行结束回调（汇总结果） */
  onRunFinish?: (summary: { pass: number; fail: number; skip: number; durationMs: number }) => void;
  className?: string;
}

/* ---------- 原语元信息 ---------- */

const TYPE_META: Record<StepType, { label: string; color: string }> = {
  request: { label: '请求', color: '#22c55e' },
  condition: { label: '条件', color: '#f97316' },
  loop: { label: '循环', color: '#a855f7' },
  wait: { label: '等待', color: '#71717c' },
  assert: { label: '断言', color: '#10b981' },
  ref: { label: '引用', color: '#06b6d4' },
};

function typeBadge(type: StepType) {
  const m = TYPE_META[type];
  return (
    <span
      className="badge shrink-0"
      style={{ background: `${m.color}1f`, color: m.color, borderColor: `${m.color}42` }}
    >
      {m.label}
    </span>
  );
}

/* ---------- 执行状态点 ---------- */

function StatusDot({ status, disabled }: { status?: StepStatus; disabled: boolean }) {
  const s: StepStatus = disabled ? 'skip' : (status ?? 'idle');
  const base = 'inline-block h-2 w-2 rounded-full shrink-0';
  if (s === 'pass') return <span className={cn(base, 'bg-get')} title="通过" />;
  if (s === 'fail')
    return <span className={cn(base, 'bg-del')} style={{ boxShadow: '0 0 6px 1px #ef4444cc' }} title="失败" />;
  if (s === 'skip') return <span className={cn(base, 'bg-fg-muted/50')} title="跳过" />;
  if (s === 'running')
    return <span className={cn(base, 'animate-pulse bg-put')} style={{ boxShadow: '0 0 6px 1px #f59e0b99' }} title="执行中" />;
  return <span className={cn(base, 'border border-fg-muted/50 bg-transparent')} title="待执行" />;
}

/* ---------- 启用开关 ---------- */

function EnableSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'relative h-[14px] w-[26px] shrink-0 cursor-pointer rounded-full transition-colors',
        checked ? 'bg-get/70' : 'bg-bg-tertiary border border-border'
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[10px] w-[10px] rounded-full bg-fg-primary transition-all',
          checked ? 'left-[13px]' : 'left-[2px] bg-fg-muted'
        )}
      />
    </button>
  );
}

/* ---------- 主组件 ---------- */

export function ScenarioTree({ scenarioName = '下单主链路回归', nodes: initialNodes = scenarioDemoNodes, onRunFinish, className }: ScenarioTreeProps) {
  const [nodes, setNodes] = useState<ScenarioNode[]>(initialNodes);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [diffOpen, setDiffOpen] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ pass: number; fail: number; skip: number; durationMs: number } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** 深度更新某节点（含子树） */
  const patchNode = useCallback((tree: ScenarioNode[], id: string, patch: Partial<ScenarioNode>, deep = false): ScenarioNode[] =>
    tree.map((n) => {
      if (n.id === id) return { ...n, ...patch, ...(deep && patch.status ? { children: patchChildrenAll(n.children, patch.status) } : {}) };
      if (n.children) return { ...n, children: patchNode(n.children, id, patch, deep) };
      return n;
    }), []);

  /** 禁用父节点时级联停用整棵子树 */
  const patchChildrenAll = (children: ScenarioNode[] | undefined, status: StepStatus): ScenarioNode[] | undefined =>
    children?.map((c) => ({ ...c, status, children: patchChildrenAll(c.children, status) }));

  const toggleEnabled = useCallback(
    (id: string, enabled: boolean) => {
      setNodes((t) => patchNode(t, id, { enabled }, true));
    },
    [patchNode]
  );

  const toggleCollapse = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleDiff = (id: string) =>
    setDiffOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** 运行：按 DFS 顺序逐步动画 */
  const run = useCallback(() => {
    if (running) return;
    setRunning(true);
    setSummary(null);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    // 展开所有可折叠节点，便于观看执行过程
    setCollapsed(new Set());

    // 重置所有状态：禁用节点直接 skip，其余 idle
    const reset = (list: ScenarioNode[]): ScenarioNode[] =>
      list.map((n) => ({ ...n, status: n.enabled ? 'idle' : 'skip', children: n.children ? reset(n.children) : undefined }));
    const tree = reset(nodes);
    setNodes(tree);

    // DFS 收集启用节点
    const order: string[] = [];
    const walk = (list: ScenarioNode[]) => list.forEach((n) => { if (n.enabled) { order.push(n.id); if (n.children) walk(n.children); } });
    walk(tree);

    const findNode = (list: ScenarioNode[], id: string): ScenarioNode | undefined =>
      list.find((n) => n.id === id) ?? list.flatMap((n) => (n.children ? (findNode(n.children, id) ? [findNode(n.children, id)!] : []) : []))[0];

    let acc = 0;
    order.forEach((id, i) => {
      const node = findNode(tree, id)!;
      const finalStatus = node.sim ?? 'pass';
      const dur = node.durationMs ?? 0;
      acc += dur;
      timers.current.push(
        window.setTimeout(() => setNodes((t) => patchNode(t, id, { status: 'running' })), i * 420 + 60)
      );
      timers.current.push(
        window.setTimeout(() => setNodes((t) => patchNode(t, id, { status: finalStatus, durationMs: node.durationMs })), i * 420 + 400)
      );
    });

    // 汇总
    const count = (list: ScenarioNode[], pred: (n: ScenarioNode) => boolean): number =>
      list.reduce((acc2, n) => acc2 + (pred(n) ? 1 : 0) + (n.children ? count(n.children, pred) : 0), 0);
    const sumDur = (list: ScenarioNode[]): number =>
      list.reduce((acc2, n) => acc2 + (n.enabled && n.sim !== 'skip' ? (n.durationMs ?? 0) : 0) + (n.children ? sumDur(n.children) : 0), 0);
    const totalDur = sumDur(tree);
    timers.current.push(
      window.setTimeout(() => {
        const s = {
          pass: count(tree, (n) => n.enabled && n.sim === 'pass'),
          fail: count(tree, (n) => n.enabled && n.sim === 'fail'),
          skip: count(tree, (n) => !n.enabled || n.sim === 'skip'),
          durationMs: totalDur,
        };
        setSummary(s);
        setRunning(false);
        onRunFinish?.(s);
      }, order.length * 420 + 480)
    );
  }, [nodes, running, patchNode, onRunFinish]);

  /* ---------- 递归渲染 ---------- */

  const renderNode = (node: ScenarioNode, depth: number): React.ReactNode => {
    const disabled = !node.enabled;
    const hasChildren = !!node.children?.length;
    const isCollapsed = collapsed.has(node.id);
    const status: StepStatus | undefined = disabled ? 'skip' : node.status;
    const failed = status === 'fail';
    const canOpenDiff = failed && !!node.assertionDiff?.length;

    return (
      <div key={node.id}>
        {/* 连接线：相对父级缩进 + 横向短线 */}
        <div
          className={cn(
            'group relative flex items-center gap-2 py-[5px] pr-3 transition-opacity',
            disabled && 'opacity-40',
            failed && 'rounded-r-md bg-del/10'
          )}
          style={{ paddingLeft: depth * 22 + 8 }}
        >
          {/* 竖向连接线 */}
          {depth > 0 && (
            <>
              <span className="absolute top-0 h-full w-px bg-border" style={{ left: depth * 22 - 8 }} />
              <span className="absolute top-1/2 h-px w-[18px] bg-border" style={{ left: depth * 22 - 8 }} />
            </>
          )}

          {/* twist 箭头 / 占位 */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapse(node.id)}
              className="cursor-pointer text-fg-muted hover:text-fg-primary"
              aria-label={isCollapsed ? '展开' : '折叠'}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : (
            <span className="w-[13px]" />
          )}

          <StatusDot status={node.status} disabled={disabled} />
          {typeBadge(node.type)}
          {node.branch && (
            <span
              className="badge shrink-0"
              style={
                node.branch === 'then'
                  ? { background: '#22c55e1a', color: '#22c55e', borderColor: '#22c55e3d' }
                  : { background: '#71717c1a', color: '#a1a1aa', borderColor: '#71717c3d' }
              }
            >
              {node.branch}
            </span>
          )}

          <span className={cn('flex-1 truncate text-[13px]', failed ? 'font-medium text-red-400' : 'text-fg-primary')}>
            {node.name}
          </span>

          {/* 配置摘要 */}
          {node.config && (
            <span className="hidden shrink-0 font-mono text-[10px] text-fg-muted lg:inline">
              {Object.entries(node.config)
                .slice(0, 2)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(' · ')}
            </span>
          )}

          {/* 耗时 */}
          <span className={cn('w-14 shrink-0 text-right font-mono text-[11px]', disabled ? 'text-fg-muted/60' : 'text-fg-secondary')}>
            {node.durationMs ? `${node.durationMs}ms` : '—'}
          </span>

          <EnableSwitch checked={node.enabled} onChange={() => toggleEnabled(node.id, !node.enabled)} />
        </div>

        {/* fail 断言 diff */}
        {canOpenDiff && (
          <div style={{ paddingLeft: depth * 22 + 30 }} className="mb-1">
            <button
              type="button"
              onClick={() => toggleDiff(node.id)}
              className="cursor-pointer text-[11px] text-red-400 hover:underline"
            >
              {diffOpen.has(node.id) ? '▾ 收起失败断言' : '▸ 展开失败断言'}
            </button>
            {diffOpen.has(node.id) && (
              <div className="mt-1 overflow-hidden rounded-md border border-del/30 font-mono text-[11px]">
                <div className="grid grid-cols-[1fr_1fr_1fr] bg-del/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                  <span>目标</span>
                  <span>期望</span>
                  <span>实际</span>
                </div>
                {node.assertionDiff!.map((a) => (
                  <div key={a.target} className="grid grid-cols-[1fr_1fr_1fr] border-t border-del/20 px-3 py-1">
                    <span className="text-fg-secondary">
                      {a.target} <span className="text-fg-muted">{a.operator}</span>
                    </span>
                    <span className="text-get">{a.expected}</span>
                    <span className="text-del">{a.actual}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* children */}
        {hasChildren && !isCollapsed && <div className="relative">{node.children!.map((c) => renderNode(c, depth + 1))}</div>}

        {/* 原语色彩左缘提示（容器节点折叠态也可见） */}
        <span aria-hidden className="hidden" data-type-color={node.type} />
      </div>
    );
  };

  const totalSteps = useMemo(() => {
    const c = (list: ScenarioNode[]): number => list.reduce((a, n) => a + 1 + (n.children ? c(n.children) : 0), 0);
    return c(nodes);
  }, [nodes]);

  return (
    <div className={cn('card flex flex-col overflow-hidden', className)}>
      {/* 顶栏 */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-[13px] font-semibold">{scenarioName}</span>
        <span className="badge">{totalSteps} 步骤</span>
        <div className="ml-auto flex items-center gap-2">
          {summary && (
            <span className="font-mono text-[11px] text-fg-secondary">
              <span className="text-get">{summary.pass} pass</span> ·{' '}
              <span className={summary.fail ? 'text-del' : 'text-fg-muted'}>{summary.fail} fail</span> ·{' '}
              <span className="text-fg-muted">{summary.skip} skipped</span> · 总耗时{' '}
              <span className="text-fg-primary">{(summary.durationMs / 1000).toFixed(1)}s</span>
            </span>
          )}
          {running ? (
            <span className="badge badge-pending animate-pulse">执行中…</span>
          ) : (
            <button
              type="button"
              onClick={run}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold transition-colors',
                summary
                  ? 'border border-border bg-bg-tertiary text-fg-secondary hover:text-fg-primary'
                  : 'bg-accent text-black hover:opacity-90'
              )}
              style={summary ? undefined : { background: 'hsl(var(--accent))' }}
            >
              {summary ? <RotateCcw size={12} /> : <Play size={12} />}
              {summary ? '重新运行' : '运行场景'}
            </button>
          )}
        </div>
      </div>

      {/* 树体 */}
      <div className="max-h-[520px] overflow-y-auto py-1.5">{nodes.map((n) => renderNode(n, 0))}</div>
    </div>
  );
}

export default ScenarioTree;
