/**
 * 插件示例 A：运行中 Run 事件读取（live-run-events）
 *
 * 解决的问题：GET /api/runs/:id/events 只在 run 完成后可查（events 落入内存
 * outcomes / PG），run 执行中排障只能翻 server.log。本插件订阅 run.event，
 * 把事件流缓存在内存里，执行中即可 REST 轮询——WS 之外给脚本/CI 一条只读通道。
 *
 * 设计要点（示例价值）：
 *   - onRunEvent 零侵入：与 WS 网关同一事件源，核心代码一行未改；
 *   - 有界内存：每 run 最多 800 条、进程内最多 50 个 run、完成后 30 分钟 TTL；
 *   - 短 id 兼容：mu57irzt / run_mu57irzt 均可查（与 runs.controller 同规则）。
 *
 * 验证：
 *   curl http://localhost:8082/api/plugins/live-run-events/runs
 *   curl "http://localhost:8082/api/plugins/live-run-events/runs/<runId>/events?since=0"
 */
'use strict';

const MAX_EVENTS_PER_RUN = 800;
const MAX_RUNS = 50;
const COMPLETED_TTL_MS = 30 * 60 * 1000;

/** runId -> { events: RunEvent[], completed: boolean, updatedAt: number } */
const runs = new Map();

function prune() {
  const now = Date.now();
  for (const [id, rec] of runs) {
    if (rec.completed && now - rec.updatedAt > COMPLETED_TTL_MS) runs.delete(id);
  }
  while (runs.size > MAX_RUNS) {
    const oldest = runs.keys().next().value;
    if (oldest === undefined) break;
    runs.delete(oldest);
  }
}

module.exports = {
  async activate(ctx) {
    ctx.onRunEvent((e) => {
      let rec = runs.get(e.runId);
      if (!rec) {
        rec = { events: [], completed: false, updatedAt: Date.now() };
        runs.set(e.runId, rec);
        prune();
      }
      if (rec.events.length < MAX_EVENTS_PER_RUN) rec.events.push(e);
      rec.updatedAt = Date.now();
      if (e.type === 'run.completed') rec.completed = true;
    });

    ctx.registerRoute('get', '/runs', (_req, res) => {
      prune();
      const list = [...runs.entries()].map(([runId, rec]) => ({
        runId,
        eventCount: rec.events.length,
        completed: rec.completed,
        updatedAt: new Date(rec.updatedAt).toISOString(),
      }));
      res.json({ found: true, count: list.length, runs: list });
    });

    ctx.registerRoute('get', '/runs/:id/events', (req, res) => {
      prune();
      const raw = String(req.params.id ?? '');
      const rid = raw.startsWith('run_') || raw.startsWith('dry_') ? raw : 'run_' + raw;
      const rec = runs.get(raw) ?? runs.get(rid);
      if (!rec) {
        res.json({
          found: false,
          runId: rid,
          note: '不在本进程内存（未在本进程执行过，或完成后超过 30 分钟被清理）。历史 run 用 GET /api/runs/:id/events；运行中 run 在触发后立即可查本端点',
        });
        return;
      }
      const since = Number(req.query.since ?? 0) || 0;
      const events = rec.events.slice(Math.max(0, since));
      res.json({
        found: true,
        runId: rid,
        completed: rec.completed,
        total: rec.events.length,
        returned: events.length,
        events,
      });
    });

    ctx.log('已挂接 run.event：GET /api/plugins/live-run-events/runs · GET /runs/:id/events?since=N');
  },
};
