import { ev, type RunEvent } from '@verifyos/shared';
import type {
  DependencyEdge,
  ExecContext,
  Executor,
  NodeOutcome,
  RunResult,
  ScheduleReport,
  SchedulerOptions,
  VerificationNode,
} from './types';

/**
 * 依赖链调度器（B6 · Orchestrator 骨架）
 *
 * 语义（对齐 qa.tech 文档 + PRD §2.2）：
 * 1. Resume From（每验证恰 1 个）构成链：链内串行、共享浏览器状态；
 *    被依赖方 6h 内有成功状态 → 直接复用，不重跑（reused）。
 * 2. Wait For（可多个）只做顺序与数据：被依赖方完成后才启动，新开会话。
 * 3. 链间并行（隔离 BrowserContext = 不同 chainId）；per-environment 并发上限，超额排队。
 * 4. 任一依赖失败 → 所有下游 skipped。
 * 5. Output Values：依赖的 run.output 合并注入下游 ctx.outputs。
 */
export class DependencyScheduler {
  private nodes = new Map<string, VerificationNode>();
  private resumeFrom = new Map<string, string>(); // from -> to（恰 1 个）
  private waitFor = new Map<string, string[]>(); // from -> [to...]
  private chainOf = new Map<string, string>();
  private opts: Required<Omit<SchedulerOptions, 'emit' | 'envConcurrency' | 'now'>> &
    Pick<SchedulerOptions, 'emit' | 'envConcurrency' | 'now'>;

  constructor(
    nodes: VerificationNode[],
    edges: DependencyEdge[],
    opts: SchedulerOptions = {},
  ) {
    this.opts = {
      maxConcurrency: opts.maxConcurrency ?? 8,
      resumeStateTtlMs: opts.resumeStateTtlMs ?? 6 * 60 * 60 * 1000,
      envConcurrency: opts.envConcurrency,
      emit: opts.emit,
      now: opts.now ?? (() => new Date()),
    };
    for (const n of nodes) this.nodes.set(n.shortId, n);
    for (const e of edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to))
        throw new Error(`依赖边指向不存在的验证: ${e.from} -> ${e.to}`);
      if (e.kind === 'resume_from') {
        if (this.resumeFrom.has(e.from))
          throw new Error(`${e.from} 有多个 resume_from（恰允许 1 个）`);
        this.resumeFrom.set(e.from, e.to);
      } else {
        this.waitFor.set(e.from, [...(this.waitFor.get(e.from) ?? []), e.to]);
      }
    }
    this.assertAcyclic();
    this.buildChains();
  }

  /** 全 DAG（两类边）拓扑排序检测环 */
  private assertAcyclic() {
    const indeg = new Map<string, number>([...this.nodes.keys()].map((k) => [k, 0]));
    const adj = new Map<string, string[]>();
    const addEdge = (a: string, b: string) => {
      adj.set(a, [...(adj.get(a) ?? []), b]);
      indeg.set(b, (indeg.get(b) ?? 0) + 1);
    };
    this.resumeFrom.forEach((to, from) => addEdge(to, from));
    this.waitFor.forEach((tos, from) => tos.forEach((to) => addEdge(to, from)));
    const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k);
    let seen = 0;
    while (queue.length) {
      const k = queue.shift()!;
      seen++;
      for (const nxt of adj.get(k) ?? []) {
        indeg.set(nxt, indeg.get(nxt)! - 1);
        if (indeg.get(nxt) === 0) queue.push(nxt);
      }
    }
    if (seen !== this.nodes.size) throw new Error('依赖图存在环');
  }

  /** resume_from 链构建：每个节点的 chainId = 链根的 shortId */
  private buildChains() {
    const rootOf = (id: string): string => {
      let cur = id;
      const guard = new Set<string>();
      while (this.resumeFrom.has(cur)) {
        if (guard.has(cur)) throw new Error('resume_from 链成环');
        guard.add(cur);
        cur = this.resumeFrom.get(cur)!;
      }
      return cur;
    };
    for (const id of this.nodes.keys()) this.chainOf.set(id, rootOf(id));
  }

  private emit(e: RunEvent) {
    this.opts.emit?.(e);
  }

  async run(executor: Executor): Promise<ScheduleReport> {
    const done = new Map<string, NodeOutcome>(); // 完成（含 reused/skipped）
    const running = new Map<string, Promise<void>>();
    const order: string[] = [];
    const envActive = new Map<string, number>();
    let globalActive = 0;

    const envLimit = (env: string) => this.opts.envConcurrency?.[env] ?? Infinity;
    const allDepsOf = (id: string): { to: string; kind: 'resume_from' | 'wait_for' }[] => {
      const list: { to: string; kind: 'resume_from' | 'wait_for' }[] = [];
      if (this.resumeFrom.has(id)) list.push({ to: this.resumeFrom.get(id)!, kind: 'resume_from' });
      for (const to of this.waitFor.get(id) ?? []) list.push({ to, kind: 'wait_for' });
      return list;
    };
    const depsSatisfied = (id: string) =>
      allDepsOf(id).every(({ to }) => {
        const o = done.get(to);
        return o && o.status !== 'skipped' && (o.status === 'passed' || o.status === 'reused');
      });
    const anyDepFailed = (id: string) =>
      allDepsOf(id).some(({ to }) => {
        const o = done.get(to);
        return o && (o.status === 'failed' || o.status === 'unknown' || o.status === 'skipped');
      });

    const startNode = (id: string): Promise<void> => {
      const node = this.nodes.get(id)!;
      const chainId = this.chainOf.get(id)!;
      const runId = `run_${id}`;
      order.push(id);

      // —— 6h 状态复用：resume_from 依赖刚跑完且带状态，或依赖历史状态未过期 ——
      const rfTo = this.resumeFrom.get(id);
      let inheritedState: string | undefined;
      let stateReused = false;
      if (rfTo) {
        const depOutcome = done.get(rfTo);
        if (depOutcome?.browserStateUri) {
          inheritedState = depOutcome.browserStateUri;
        }
        // 依赖历史状态未过期且本次被判定可复用 → 依赖在 plan 阶段已被标记 reused（见 tryReuse）
      }

      const outputs: Record<string, string> = {};
      for (const { to } of allDepsOf(id)) {
        Object.assign(outputs, done.get(to)?.output ?? {});
      }

      this.emit(ev.runStarted(runId, {
        applicationShortId: id,
        platform: 'web',
        environment: { url: '', isPreview: false },
      }, 'manual'));

      const ctx: ExecContext = { chainId, browserState: inheritedState, outputs, stateReused };
      const p = (async () => {
        let outcome: NodeOutcome;
        try {
          const r: RunResult = await executor(node, ctx);
          const status = r.verdict === 'pass' ? 'passed' : r.verdict === 'fail' ? 'failed' : 'unknown';
          outcome = {
            shortId: id, status, verdict: r.verdict, output: r.output,
            browserStateUri: r.browserStateUri, chainId, reason: r.failureSummary,
          };
          this.emit(ev.runCompleted(runId, r.verdict, r.output, r.failureSummary));
        } catch (e: any) {
          outcome = { shortId: id, status: 'failed', verdict: 'fail', chainId, reason: e?.message };
          this.emit(ev.runCompleted(runId, 'fail', undefined, e?.message));
        } finally {
          done.set(id, outcome!);
          running.delete(id);
          globalActive--;
          envActive.set(node.environmentShortId, (envActive.get(node.environmentShortId) ?? 1) - 1);
        }
      })();
      running.set(id, p);
      return p;
    };

    /** 6h 复用判定：依赖有未过期状态 → 不重跑，直接标 reused */
    const tryReuse = (id: string): boolean => {
      const rfTo = this.resumeFrom.get(id);
      if (!rfTo) return false;
      const dep = this.nodes.get(rfTo)!;
      const st = dep.lastState;
      if (!st) return false;
      const now = this.opts.now!().getTime();
      const fresh = st.expiresAt.getTime() > now && now - st.capturedAt.getTime() < this.opts.resumeStateTtlMs;
      if (!fresh) return false;
      // 依赖本身也必须满足其依赖（链根/上游已就绪）——若它自身有未满足依赖则不可复用
      if (allDepsOf(rfTo).length > 0 && !done.has(rfTo)) return false;
      if (done.has(rfTo) || running.has(rfTo)) return false; // 依赖已完成/进行中 → 走正常依赖流，不重标记
      {
        const outcome: NodeOutcome = {
          shortId: rfTo, status: 'reused', verdict: 'pass',
          browserStateUri: st.uri, chainId: this.chainOf.get(rfTo)!,
          reason: `状态复用（${Math.round((now - st.capturedAt.getTime()) / 60000)}min 前捕获，6h 窗口内）`,
        };
        done.set(rfTo, outcome);
        order.push(`${rfTo}(reused)`);
      }
      return true;
    };

    // —— 主循环 ——
    while (done.size < this.nodes.size) {
      // 失败传播：有依赖失败且自身未开始的 → skipped
      for (const id of this.nodes.keys()) {
        if (!done.has(id) && !running.has(id) && anyDepFailed(id)) {
          const chainId = this.chainOf.get(id)!;
          done.set(id, { shortId: id, status: 'skipped', chainId, reason: '依赖失败，自动跳过' });
          order.push(`${id}(skipped)`);
          this.emit(ev.runCompleted(`run_${id}`, 'unknown', undefined, 'skipped: 依赖失败'));
        }
      }

      // Pass 0：先做全图 6h 复用标记（先于任何节点调度，保证"fresh 依赖不执行"语义）
      let progressed = false;
      for (const id of this.nodes.keys()) {
        if (done.has(id) || running.has(id)) continue;
        if (tryReuse(id)) progressed = true;
      }
      for (const id of this.nodes.keys()) {
        if (done.has(id) || running.has(id)) continue;
        if (!depsSatisfied(id)) continue;
        const env = this.nodes.get(id)!.environmentShortId;
        if (globalActive >= this.opts.maxConcurrency) continue;
        if ((envActive.get(env) ?? 0) >= envLimit(env)) continue; // 排队
        globalActive++;
        envActive.set(env, (envActive.get(env) ?? 0) + 1);
        startNode(id);
        progressed = true;
      }

      if (done.size >= this.nodes.size) break;
      if (!progressed && running.size === 0) {
        const stuck = [...this.nodes.keys()].filter((k) => !done.has(k));
        throw new Error(`调度死锁：${stuck.join(', ')} 无法满足依赖（检查环或全部依赖失败传播遗漏）`);
      }
      if (running.size > 0) await Promise.race(running.values());
    }

    const outcomes = [...done.values()];
    return {
      outcomes,
      order,
      ok: outcomes.every((o) => o.status === 'passed' || o.status === 'reused' || o.status === 'skipped'),
    };
  }
}
