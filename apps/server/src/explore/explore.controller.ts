import { Controller, Get, Post, Delete, Body, Query, Param, HttpException, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ExploreService, type ExploreInput } from './explore.service';
import { RunsService } from '../runs/runs.service';

@Controller('api')
export class ExploreController {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly runs: RunsService,
  ) {}


  /** 一键探索闭环（异步；进度走 WS explore.event） */
  @Post('explore')
  explore(@Body() body: ExploreInput) {
    const input: ExploreInput = {
      startUrl: body?.startUrl ?? this.runs.fixtureEntryUrl,
      intent: body?.intent,
      credential: body?.credential,
      headful: body?.headful, // G10: headful 人工接管模式
      maxDepth: body?.maxDepth, // G10: 探索参数贯通
      maxPages: body?.maxPages, // J03: maxPages 正式契约
      maxActions: body?.maxActions, // J03: 旧别名兼容
    };
    void this.exploreSvc.explore(input, (e) => {
      console.log('[explore]', e.phase, '-', e.message);
      this.exploreSvc.emit('explore.event', e);
    });
    return { accepted: true };
  }

  // ---------- F1: 新建项目（欢迎屏 → 开始探索） ----------
  // T9: 支持一次绑定多个 repo（url + kind）与多个 environment（name + url），旧字段 url/env 仍兼容（派生默认环境）。
  @Post('projects')
  async addProject(@Body() body: {
    name?: string; url?: string; env?: string;
    repos?: Array<{ url?: string; repo_url?: string; kind?: string }>;
    environments?: Array<{ name?: string; url?: string; is_production?: boolean }>;
  }) {
    await this.exploreSvc.ensureReady();
    const name = (body?.name ?? '').trim() || '未命名项目';
    const prj = await this.exploreSvc.pg.query(
      `INSERT INTO project(short_id, org_id, name) VALUES ($1, 1, $2) RETURNING id, short_id`,
      [`prj_${Math.random().toString(36).slice(2, 8)}`, name],
    );
    const projectId = prj.rows[0].id as number;
    const shortId = prj.rows[0].short_id as string;
    await this.exploreSvc.pg.query(
      `INSERT INTO application(short_id, project_id, name, type) VALUES ($1, $2, $3, 'web') RETURNING id`,
      [`app_${Math.random().toString(36).slice(2, 8)}`, projectId, name],
    );

    // 仓库：url/repo_url 双键兼容；去重（同 url 只建一条）
    const repos = await this.insertRepos(projectId, (body?.repos ?? []).map((r) => ({
      url: (r?.repo_url ?? r?.url ?? '').trim(),
      kind: (r?.kind ?? 'gitlab').trim() || 'gitlab',
    })));

    // 环境：显式 environments 优先；旧 url/env 派生一条默认环境（保兼容）
    const envs: Array<{ name: string; url: string; is_production: boolean }> = [];
    const seen = new Set<string>();
    for (const e of body?.environments ?? []) {
      const en = (e?.name ?? '').trim();
      if (!en || seen.has(en)) continue;
      seen.add(en);
      envs.push({ name: en, url: (e?.url ?? '').trim(), is_production: !!e?.is_production });
    }
    const defaultName = (body?.env ?? '').trim() || '测试环境';
    const defaultUrl = (body?.url ?? '').trim();
    if (!seen.has(defaultName) && (defaultUrl || envs.length === 0)) {
      envs.push({ name: defaultName, url: defaultUrl, is_production: defaultName === '生产环境' });
    }
    const environments = await this.insertEnvironments(projectId, envs);

    return {
      ok: true, projectId, shortId,
      env: body?.env ?? '测试环境', url: body?.url ?? '',
      repos, environments,
    };
  }

  /** H09 集成：项目列表（侧栏项目切换器数据源，与 POST /api/projects 同型） */
  @Get('projects')
  async listProjects() {
    await this.exploreSvc.ensureReady();
    const rs = await this.exploreSvc.pg.query(
      `SELECT id, short_id, name FROM project ORDER BY id DESC LIMIT 50`,
    );
    return { ok: true, projects: rs.rows };
  }

  /** T9: 项目详情——返回该项目的 repo 列表 + environment 列表 */
  @Get('projects/:shortId')
  async projectDetail(@Param('shortId') shortId: string) {
    await this.exploreSvc.ensureReady();
    const projectId = await this.resolveProjectId(shortId);
    const prj = await this.exploreSvc.pg.query(
      `SELECT id, short_id, name FROM project WHERE id = $1 LIMIT 1`, [projectId],
    );
    const repos = await this.exploreSvc.pg.query(
      `SELECT id, repo_url, kind, created_at FROM project_repo WHERE project_id = $1 ORDER BY id`, [projectId],
    );
    const envs = await this.exploreSvc.pg.query(
      `SELECT id, name, url, is_production, created_at FROM project_environment WHERE project_id = $1 ORDER BY id`, [projectId],
    );
    return { found: true, ...prj.rows[0], repos: repos.rows, environments: envs.rows };
  }

  /** T9: 给项目添加 repo（url + kind gitlab/github），重复 url 幂等 */
  @Post('projects/:shortId/repos')
  async addRepo(@Param('shortId') shortId: string, @Body() body: { url?: string; repo_url?: string; kind?: string }) {
    await this.exploreSvc.ensureReady();
    const projectId = await this.resolveProjectId(shortId);
    const url = (body?.repo_url ?? body?.url ?? '').trim();
    if (!url) throw new BadRequestException('repo url 不能为空');
    const kind = (body?.kind ?? 'gitlab').trim() || 'gitlab';
    if (kind !== 'gitlab' && kind !== 'github') throw new BadRequestException('kind 仅支持 gitlab/github');
    const ins = await this.exploreSvc.pg.query(
      `INSERT INTO project_repo(project_id, repo_url, kind) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, repo_url) DO UPDATE SET kind = EXCLUDED.kind
       RETURNING id, repo_url, kind`,
      [projectId, url, kind],
    );
    return { ok: true, repo: ins.rows[0] };
  }

  /** T9: 删除项目的某个 repo（按 repo id，校验归属） */
  @Delete('projects/:shortId/repos/:repoId')
  async removeRepo(@Param('shortId') shortId: string, @Param('repoId') repoId: string) {
    await this.exploreSvc.ensureReady();
    const projectId = await this.resolveProjectId(shortId);
    const n = await this.exploreSvc.pg.query(
      `DELETE FROM project_repo WHERE project_id = $1 AND id = $2 RETURNING id`, [projectId, Number(repoId)],
    );
    return { ok: true, removed: n.rows.length > 0 };
  }

  /** T9: 给项目添加 environment（name + url），同名幂等 */
  @Post('projects/:shortId/environments')
  async addEnvironment(@Param('shortId') shortId: string, @Body() body: { name?: string; url?: string; is_production?: boolean }) {
    await this.exploreSvc.ensureReady();
    const projectId = await this.resolveProjectId(shortId);
    const name = (body?.name ?? '').trim();
    if (!name) throw new BadRequestException('environment name 不能为空');
    const url = (body?.url ?? '').trim();
    const isProduction = !!body?.is_production;
    const ins = await this.exploreSvc.pg.query(
      `INSERT INTO project_environment(project_id, name, url, is_production) VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, name) DO UPDATE SET url = EXCLUDED.url, is_production = EXCLUDED.is_production
       RETURNING id, name, url, is_production`,
      [projectId, name, url, isProduction],
    );
    return { ok: true, environment: ins.rows[0] };
  }

  /** T9: 删除项目的某个 environment（按 environment id，校验归属） */
  @Delete('projects/:shortId/environments/:envId')
  async removeEnvironment(@Param('shortId') shortId: string, @Param('envId') envId: string) {
    await this.exploreSvc.ensureReady();
    const projectId = await this.resolveProjectId(shortId);
    await this.exploreSvc.pg.query(
      `DELETE FROM project_environment WHERE project_id = $1 AND id = $2`, [projectId, Number(envId)],
    );
    return { ok: true };
  }

  /** T9: 按 short_id 反查项目数字 id（不存在 → 404） */
  private async resolveProjectId(shortId: string): Promise<number> {
    const r = await this.exploreSvc.pg.query(`SELECT id FROM project WHERE short_id = $1 LIMIT 1`, [shortId]);
    if (r.rows.length === 0) throw new NotFoundException('project not found');
    return r.rows[0].id as number;
  }

  /** T9: 批量插 repo（去重 + 过滤空 url），返回落库后的完整列表 */
  private async insertRepos(projectId: number, repos: Array<{ url: string; kind: string }>): Promise<Array<{ id: number; repo_url: string; kind: string }>> {
    const out: Array<{ id: number; repo_url: string; kind: string }> = [];
    const seen = new Set<string>();
    for (const r of repos) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      const kind = r.kind === 'github' ? 'github' : 'gitlab';
      const ins = await this.exploreSvc.pg.query(
        `INSERT INTO project_repo(project_id, repo_url, kind) VALUES ($1, $2, $3)
         ON CONFLICT (project_id, repo_url) DO UPDATE SET kind = EXCLUDED.kind
         RETURNING id, repo_url, kind`,
        [projectId, r.url, kind],
      );
      out.push(ins.rows[0] as { id: number; repo_url: string; kind: string });
    }
    return out;
  }

  /** T9: 批量插环境（去重 + 过滤空 name），返回落库后的完整列表 */
  private async insertEnvironments(projectId: number, envs: Array<{ name: string; url: string; is_production: boolean }>): Promise<Array<{ id: number; name: string; url: string; is_production: boolean }>> {
    const out: Array<{ id: number; name: string; url: string; is_production: boolean }> = [];
    for (const e of envs) {
      const ins = await this.exploreSvc.pg.query(
        `INSERT INTO project_environment(project_id, name, url, is_production) VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, name) DO UPDATE SET url = EXCLUDED.url, is_production = EXCLUDED.is_production
         RETURNING id, name, url, is_production`,
        [projectId, e.name, e.url, e.is_production],
      );
      out.push(ins.rows[0] as { id: number; name: string; url: string; is_production: boolean });
    }
    return out;
  }

  // ---------- F4: 人工接管 + Live Findings ----------

  /** 探索控制状态（轮询/初载用；实时流走 WS explore.event）
   *  J03-9: ?explorationId=exp_xxx&since=n → 返回该会话 since 之后的事件（断线补看） */
  @Get('explore/control')
  exploreControl(
    @Query('explorationId') explorationId?: string,
    @Query('since') since?: string,
  ) {
    return this.exploreSvc.controlState({
      explorationId: explorationId || undefined,
      since: since != null && since !== '' && Number.isFinite(Number(since)) ? Number(since) : undefined,
    });
  }

  /** J03-7: 空闲态守卫——无活动探索返回 400（定向 stop 可带 explorationId） */
  @Post('explore/pause')
  explorePause(@Body() body: { on?: boolean; explorationId?: string }) {
    const n = this.exploreSvc.setPaused(!!body?.on, body?.explorationId || undefined);
    if (n === 0) throw new HttpException({ message: 'no active exploration' }, 400);
    return { ok: true, paused: !!body?.on, sessions: n };
  }

  /** L5: 探索截图端点——?key=exp_xxx/003.png（相对 out/evidence/explore；防目录穿越，参照 runs evidence） */
  @Get('explore/shot')
  exploreShot(@Query('key') key: string, @Res() res: Response) {
    const file = this.exploreSvc.shotPath(key ?? '');
    if (!file) return res.status(404).json({ error: 'shot not found' });
    res.sendFile(file);
  }

  /** J03-2/7: stop 语义修正——置位后 QA 提取跳过并发 stopped 终态事件；
   *  空闲态返回 400；不带 explorationId 时停所有活动会话（旧全局语义兼容） */
  @Post('explore/stop')
  exploreStop(@Body() body: { explorationId?: string }) {
    const n = this.exploreSvc.stop(body?.explorationId || undefined);
    if (n === 0) throw new HttpException({ message: 'no active exploration' }, 400);
    return { ok: true, stopped: n, note: '已停止——已爬页面照常落库，QA 提取跳过' };
  }
}
