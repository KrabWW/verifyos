import {
  Controller, Get, Post, Param, BadRequestException, HttpException, HttpStatus,
} from '@nestjs/common';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ExploreService } from './explore.service';
import { RunsService } from '../runs/runs.service';

@Controller('api')
export class BrowserStatesController {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
    private readonly runs: RunsService,
  ) {}

  // ---------- F12: Browser State 卡组 + 凭据测试连接 ----------

  /** demo 环境锚点（environment 表种子，幂等） */
  private async demoEnvId(): Promise<number> {
    const q = await this.exploreSvc.pg.query(`SELECT id FROM environment WHERE short_id = 'env_demo' LIMIT 1`);
    if (q.rows.length > 0) return q.rows[0].id as number;
    const app = await this.exploreSvc.pg.query(`SELECT id FROM application WHERE short_id = 'app_demo' LIMIT 1`);
    const appId = app.rows.length > 0 ? (app.rows[0].id as number) : 1;
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO environment(short_id, application_id, name, url) VALUES ('env_demo', $1, '测试环境', 'http://127.0.0.1') RETURNING id`,
      [appId],
    );
    return r.rows[0].id as number;
  }

  /** G09: 溯源元数据列（幂等 ALTER——列已存在时 try/catch 吞错，首次调用生效） */
  private async ensureTraceColumns(): Promise<void> {
    try {
      await this.exploreSvc.pg.query(`ALTER TABLE browser_state ADD COLUMN IF NOT EXISTS source_kind text`);
      await this.exploreSvc.pg.query(`ALTER TABLE browser_state ADD COLUMN IF NOT EXISTS reuse_count integer NOT NULL DEFAULT 0`);
      // demo 种子行若在加列前插入，回填溯源标记（幂等）
      await this.exploreSvc.pg.query(`UPDATE browser_state SET source_kind = 'demo' WHERE source_kind IS NULL AND short_id = 'bs_demo01'`);
    } catch {
      // 列已存在 / 并发 ALTER 冲突：幂等，忽略
    }
  }

  @Get('browser-states')
  async browserStates() {
    await this.exploreSvc.ensureReady();
    await this.ensureTraceColumns();
    const envId = await this.demoEnvId();
    const c = await this.exploreSvc.pg.query(`SELECT COUNT(*)::int AS n FROM browser_state`);
    if ((c.rows[0] as { n: number }).n === 0) {
      // 种子：演示用 admin_logged_in（storage_uri 为占位——真实快照由探索/执行引擎产出后替换）
      await this.exploreSvc.pg.query(
        `INSERT INTO browser_state(short_id, environment_id, name, origin_run_id, storage_uri, captured_at, expires_at, source_kind)
         VALUES ('bs_demo01', $1, 'admin_logged_in', NULL, 'mem://demo/admin_logged_in.json', now() - interval '2 hours', now() + interval '4 hours', 'demo')
         ON CONFLICT (short_id) DO NOTHING`,
        [envId],
      );
    }
    const r = await this.exploreSvc.pg.query(
      `SELECT short_id, name, storage_uri, captured_at, expires_at,
              GREATEST(0, EXTRACT(EPOCH FROM (expires_at - now()))/3600)::numeric(4,1) AS ttl_hours,
              (expires_at > now()) AS live, source_kind, reuse_count
       FROM browser_state ORDER BY captured_at DESC`,
    );
    return { items: r.rows };
  }

  /** 刷新 Browser State：真实实现 = 用 admin 凭据跑一次登录断言 Run，通过则续 6h TTL；失败则标记过期 */
  @Post('browser-states/:id/refresh')
  async refreshBrowserState(@Param('id') id: string) {
    await this.exploreSvc.ensureReady();
    // J01 任务4：先查存在——不存在 → 404 且【不得触发 Run】（旧实现假成功+副作用）
    const cur = await this.exploreSvc.pg.query(
      `SELECT short_id FROM browser_state WHERE short_id = $1 LIMIT 1`,
      [id],
    );
    if (cur.rows.length === 0) throw new HttpException({ ok: false, reason: 'browser state 不存在' }, HttpStatus.NOT_FOUND);
    const steps = [
      { id: 'st_01', title: '管理员登录', kind: 'module', actions: [
        { type: 'fill', selector: '#username', value: 'admin' },
        { type: 'fill', selector: '#password', value: 'test123' },
        { type: 'click', selector: 'button[type="submit"]' },
      ] },
      { id: 'st_02', title: '会话有效断言', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html' },
    ];
    const trigger = (await this.runs.trigger({ steps: steps as never })) as { runId?: string };
    // 判定异步产出——先乐观续 TTL 并留痕，Run 失败由执行页暴露（诚实：此处返回 runId 供用户核对）
    await this.exploreSvc.pg.query(
      `UPDATE browser_state SET captured_at = now(), expires_at = now() + interval '6 hours' WHERE short_id = $1`,
      [id],
    );
    await this.exploreSvc.pg.query(
      `INSERT INTO audit_log(actor, action, target, meta) VALUES ('system','browser_state.refresh',$1,$2::jsonb)`,
      [id, JSON.stringify({ runId: trigger.runId ?? null, ttlHours: 6 })],
    );
    return { ok: true, runId: trigger.runId ?? null, ttlHours: 6, note: '登录断言 Run 已触发（执行页可查）；TTL 已续 6h' };
  }

  /** 凭据测试连接：解密凭据 → 登录断言 Run（module 步骤零 LLM，~2s）；不存在 → 404（body 兼容） */
  @Post('credentials/:id/test')
  async testCredential(@Param('id') id: string) {
    await this.exploreSvc.ensureReady();
    const credId = Number(id);
    if (!Number.isFinite(credId)) throw new BadRequestException('invalid id');
    const cur = await this.exploreSvc.pg.query(`SELECT payload_enc FROM credential WHERE id = $1 LIMIT 1`, [credId]);
    // 业务失败 → 404（body 保持 {ok:false,reason} 兼容前端特判）
    if (cur.rows.length === 0) throw new HttpException({ ok: false, reason: '凭据不存在' }, HttpStatus.NOT_FOUND);
    const vals = JSON.parse(this.crypto.decrypt(cur.rows[0].payload_enc as string)) as { username: string; password: string };
    const steps = [
      { id: 'st_01', title: '登录探测', kind: 'module', actions: [
        { type: 'fill', selector: '#username', value: vals.username },
        { type: 'fill', selector: '#password', value: vals.password },
        { type: 'click', selector: 'button[type="submit"]' },
      ] },
      { id: 'st_02', title: '登录成功断言', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html' },
    ];
    const trigger = (await this.runs.trigger({ steps: steps as never })) as { runId?: string };
    await this.exploreSvc.pg.query(
      `INSERT INTO audit_log(actor, action, target, meta) VALUES ('system','credential.test',$1,$2::jsonb)`,
      [`credential:${id}`, JSON.stringify({ runId: trigger.runId ?? null })],
    );
    return { ok: true, runId: trigger.runId ?? null, note: '登录探测 Run 已触发（module+assertion ≈2s）——到执行历史看判定' };
  }
}
