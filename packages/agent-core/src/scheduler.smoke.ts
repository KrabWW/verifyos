import { DependencyScheduler } from './scheduler';
import type { DependencyEdge, Executor, VerificationNode } from './types';

/**
 * B6 冒烟：mock executor 验证调度器 7 项语义
 * S1 两条链并行且隔离（chainId 不同）
 * S2 链内串行 + 浏览器状态继承（resume_from 收到上个 run 的 state uri）
 * S3 wait_for 跨链排序 + Output Values 传递
 * S4 依赖失败 → 下游 skipped
 * S5 6h 状态复用：依赖有未过期状态 → 不执行（reused）
 * S6 per-environment 并发上限排队
 * S7 RunEvent 事件流顺序（run.started → run.completed）
 */
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error('断言失败: ' + msg);
}

const node = (id: string, env = 'env_prod', lastState?: VerificationNode['lastState']): VerificationNode => ({
  shortId: id, title: id, environmentShortId: env, lastState: lastState ?? null,
});

async function main() {
  console.log('═══ B6 依赖链调度器冒烟 ═══');

  // ---------- S1+S2+S3：两链并行隔离 / 链内串行继承 / wait_for+output 传递 ----------
  {
    // 链 A：login → create（resume_from）  链 B：login2（独立）  C：verify（wait_for create + login2）
    const nodes = [node('login'), node('create'), node('login2'), node('verify')];
    const edges: DependencyEdge[] = [
      { from: 'create', to: 'login', kind: 'resume_from' },
      { from: 'verify', to: 'create', kind: 'wait_for' },
      { from: 'verify', to: 'login2', kind: 'wait_for' },
    ];
    const started: string[] = [];
    const ctxSeen: Record<string, { chainId: string; browserState?: string; outputs: Record<string, string> }> = {};
    const events: string[] = [];
    const executor: Executor = async (v, ctx) => {
      started.push(v.shortId);
      ctxSeen[v.shortId] = { chainId: ctx.chainId, browserState: ctx.browserState, outputs: { ...ctx.outputs } };
      await new Promise((r) => setTimeout(r, 30));
      const output: Record<string, string> | undefined =
        v.shortId === 'create' ? { order_id: 'SO-1001' } : v.shortId === 'login2' ? { user: 'u2' } : undefined;
      return { verdict: 'pass' as const, output, browserStateUri: `s3://state/${v.shortId}.json` };
    };
    const sch = new DependencyScheduler(nodes, edges, {
      emit: (e) => events.push(e.type),
    });
    const rep = await sch.run(executor);

    assert(ctxSeen['create'].browserState === 's3://state/login.json', 'S2 create 应继承 login 的状态');
    assert(ctxSeen['create'].chainId === 'login', 'S2 create 与 login 同链');
    assert(ctxSeen['login2'].chainId === 'login2' && ctxSeen['login2'].chainId !== ctxSeen['create'].chainId, 'S1 两条链隔离');
    assert(ctxSeen['verify'].outputs['order_id'] === 'SO-1001' && ctxSeen['verify'].outputs['user'] === 'u2', 'S3 output values 跨链传递');
    assert(started.indexOf('verify') > started.indexOf('create') && started.indexOf('verify') > started.indexOf('login2'), 'S3 wait_for 排序');
    assert(events[0] === 'run.started' && events[events.length - 1] === 'run.completed', 'S7 事件流首尾');
    assert(rep.ok, 'S1-3 全部 passed');
    console.log('✓ S1 链间并行隔离 / S2 链内串行继承状态 / S3 wait_for+OutputValues / S7 事件流');
  }

  // ---------- S4：依赖失败传播 skipped ----------
  {
    const nodes = [node('login'), node('create'), node('verify')];
    const edges: DependencyEdge[] = [
      { from: 'create', to: 'login', kind: 'resume_from' },
      { from: 'verify', to: 'create', kind: 'wait_for' },
    ];
    const executor: Executor = async (v) =>
      v.shortId === 'create'
        ? { verdict: 'fail', failureSummary: 'API 500' }
        : { verdict: 'pass', browserStateUri: `s3://state/${v.shortId}.json` };
    const rep = await new DependencyScheduler(nodes, edges).run(executor);
    const skipped = rep.outcomes.find((o) => o.shortId === 'verify');
    assert(skipped?.status === 'skipped', 'S4 verify 应 skipped');
    assert(rep.order.includes('verify(skipped)'), 'S4 order 记录 skipped');
    console.log('✓ S4 依赖失败 → 下游 skipped');
  }

  // ---------- S5：6h 状态复用（依赖不执行）----------
  {
    const fresh = new Date(Date.now() - 30 * 60 * 1000); // 30 分钟前捕获
    const stale = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 小时前（过期）
    const mkState = (d: Date) => ({ uri: 's3://state/login.json', capturedAt: d, expiresAt: new Date(d.getTime() + 6 * 3600 * 1000) });
    const executed: string[] = [];
    const executor: Executor = async (v) => {
      executed.push(v.shortId);
      return { verdict: 'pass', browserStateUri: `s3://state/${v.shortId}.json` };
    };
    // fresh：login 不执行
    const nodesA = [node('login', 'env_prod', mkState(fresh)), node('create')];
    const repA = await new DependencyScheduler(nodesA, [{ from: 'create', to: 'login', kind: 'resume_from' }]).run(executor);
    assert(!executed.includes('login'), 'S5 fresh 状态下 login 不应执行');
    assert(repA.outcomes.find((o) => o.shortId === 'login')?.status === 'reused', 'S5 login 标 reused');
    // stale：login 必须重跑
    executed.length = 0;
    const nodesB = [node('login', 'env_prod', mkState(stale)), node('create')];
    await new DependencyScheduler(nodesB, [{ from: 'create', to: 'login', kind: 'resume_from' }]).run(executor);
    assert(executed.includes('login'), 'S5 过期状态下 login 必须重跑');
    console.log('✓ S5 6h 复用窗口：fresh 不重跑（reused）/ stale 重跑');
  }

  // ---------- S6：per-environment 并发上限 ----------
  {
    const nodes = [node('a'), node('b'), node('c')]; // 全部独立、同环境
    let active = 0, peak = 0;
    const executor: Executor = async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 50));
      active--;
      return { verdict: 'pass' };
    };
    await new DependencyScheduler(nodes, [], { envConcurrency: { env_prod: 2 } }).run(executor);
    assert(peak === 2, `S6 并发峰值应为 2（实得 ${peak}）`);
    console.log('✓ S6 per-environment 并发上限排队（峰值=2）');
  }

  // ---------- 环检测 ----------
  {
    let threw = false;
    try {
      new DependencyScheduler(
        [node('x'), node('y')],
        [
          { from: 'x', to: 'y', kind: 'wait_for' },
          { from: 'y', to: 'x', kind: 'wait_for' },
        ],
      );
    } catch (e: any) {
      threw = /环/.test(e.message);
    }
    assert(threw, '环检测必须抛出');
    console.log('✓ 环检测');
  }

  console.log('\n═══ B6 全部语义断言通过 ═══');
}

main().catch((e) => {
  console.error('✗ B6 冒烟失败:', e.message);
  process.exit(1);
});
