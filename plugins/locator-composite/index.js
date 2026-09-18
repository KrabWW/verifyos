/**
 * 插件示例 C：复合动作序列采集（locator-composite）——LocatorCache 固化方向
 *
 * 解决的问题：核心 locator_cache 只缓存「单击/填值」单动作（instruction→selector），
 * 多段交互（antd Select 点开下拉→点选项、fill→press Enter 提交）没有固化素材，
 * 每次 run 都要重走 LLM 规划。本插件从 run.event 采集「一个步骤内的子动作序列」
 * （≥2 个 step.action），落盘 JSONL 并暴露查询——先做素材库，人审查后可转
 * deterministic steps；自动固化回放需要核心在 runner 留执行前 hook（后续方向，
 * 文档 docs/plugin-dev-guide.md §案例C 如实说明）。
 *
 * 设计要点：
 *   - 序列 = 同一 stepId 的连续 step.action（tool/action/args 全量）+ step.observation
 *     的 ok + step.completed 的 verdict/llmCalls/durationMs；
 *   - 落盘 out/locator-composite/sequences.jsonl（追加写，重启不丢）；
 *   - ver 过滤：run 表反查 verification.short_id（事件本身不携带验证 id）。
 *
 * 验证：
 *   跑一次含多子动作步骤的 run（如 ver_5cm3ay），然后
 *   curl "http://localhost:8082/api/plugins/locator-composite/sequences?limit=5"
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  async activate(ctx) {
    const storeDir = path.join(ctx.rootDir, 'out', 'locator-composite');
    const storeFile = path.join(storeDir, 'sequences.jsonl');
    /** runId -> { steps: Map<stepId, rec> } */
    const active = new Map();

    const appendRow = (row) => {
      try {
        fs.mkdirSync(storeDir, { recursive: true });
        fs.appendFileSync(storeFile, JSON.stringify(row) + '\n');
      } catch (err) {
        ctx.log('落盘失败:', err instanceof Error ? err.message : err);
      }
    };

    ctx.onRunEvent((e) => {
      if (e.type === 'run.started') {
        active.set(e.runId, { steps: new Map() });
        return;
      }
      const run = active.get(e.runId);
      if (!run) return;

      if (e.type === 'step.started') {
        run.steps.set(e.stepId, {
          stepId: e.stepId,
          title: e.title,
          kind: e.kind,
          actions: [],
          ok: null,
          verdict: null,
        });
        return;
      }
      const step = run.steps.get(e.stepId);
      if (!step) return;

      if (e.type === 'step.action') {
        step.actions.push({ tool: e.tool, action: e.action, args: e.args ?? {} });
      } else if (e.type === 'step.observation') {
        step.ok = e.ok;
        step.detail = String(e.detail ?? '').slice(0, 200);
      } else if (e.type === 'step.completed') {
        step.verdict = e.verdict;
        // 只归档复合序列：单动作已由核心 locator_cache 覆盖，避免双份
        if (step.actions.length >= 2) {
          appendRow({
            runId: e.runId,
            stepId: step.stepId,
            title: step.title,
            kind: step.kind,
            verdict: step.verdict,
            ok: step.ok,
            llmCalls: e.llmCalls ?? 0,
            durationMs: e.durationMs ?? 0,
            actions: step.actions,
            recordedAt: new Date().toISOString(),
          });
        }
      } else if (e.type === 'run.completed') {
        active.delete(e.runId);
      }
    });

    const loadRows = () => {
      if (!fs.existsSync(storeFile)) return [];
      return fs
        .readFileSync(storeFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    };

    ctx.registerRoute('get', '/sequences', async (req, res) => {
      let rows = loadRows().reverse(); // 新的在前
      const run = String(req.query.run ?? '');
      const ver = String(req.query.ver ?? '');
      if (run) {
        rows = rows.filter((r) => r.runId === run || r.runId === 'run_' + run);
      } else if (ver) {
        try {
          const rr = await ctx.pg.query(
            `SELECT short_id FROM run WHERE verification_id IN
               (SELECT id FROM verification WHERE short_id = $1)`,
            [ver],
          );
          const ids = new Set(rr.rows.map((x) => String(x.short_id)));
          rows = rows.filter((r) => ids.has(r.runId));
        } catch (err) {
          ctx.log('ver 反查失败（忽略过滤）:', err instanceof Error ? err.message : err);
        }
      }
      const q = String(req.query.q ?? '').toLowerCase();
      if (q) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
      const limit = Math.min(Number(req.query.limit ?? 100) || 100, 300);
      res.json({
        found: true,
        count: rows.length,
        sequences: rows.slice(0, limit),
        note: '审查后可把 actions 转成 deterministic steps（fill/click/press 序列）；自动固化回放是核心 runner 的后续 hook 方向',
      });
    });

    ctx.registerRoute('get', '/stats', (_req, res) => {
      const rows = loadRows();
      const byRun = new Map();
      for (const r of rows) byRun.set(r.runId, (byRun.get(r.runId) ?? 0) + 1);
      res.json({
        found: true,
        totalSequences: rows.length,
        runs: [...byRun.entries()].map(([runId, count]) => ({ runId, count })),
        storeFile,
      });
    });

    ctx.log('已挂接 run.event，落盘 ' + storeFile);
  },
};
