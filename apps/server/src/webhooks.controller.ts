import { Controller, Post, Body, Headers, Req, HttpException, HttpStatus } from '@nestjs/common';
import { RunsService, DEMO_STEPS } from './runs/runs.service';
import {
  analyzeImpact,
  buildMrComment,
  buildTestRuns,
  dedupeFindings,
  annotateCoverage,
  type LiveFinding,
  type StepDef,
  type RunOutcome,
  type ReviewReport,
} from '@verifyos/agent-core';
import * as nodePath from 'node:path';
import { ExploreService } from './explore/explore.service';
import { LoginRecipesService } from './explore/login-recipes.service';
import {
  loadPrConfig,
  mergePrConfig,
  extractPrLayers,
  shouldTriggerPr,
  applyGate,
  resolvePlan,
  type GatePolicy,
  type GateMode,
  type PlanTier,
} from './pr/pr-config';
import { GitlabClient } from './connectors/gitlab.client';
import { GithubClient } from './connectors/github.client';

/** T9: repo url / path 归一化——去除 .git 后缀、scheme/host、SSH 前缀，统一为 path 小写指纹（group/repo） */
function repoPath(u: unknown): string {
  let s = String(u ?? '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const ssh = s.match(/^git@[^:]+:(.+)$/i);
  if (ssh) s = ssh[1];
  const http = s.match(/^https?:\/\/[^/]+\/(.+)$/i);
  if (http) s = http[1];
  return s.toLowerCase();
}

/** 请求头可能是 string | string[]（express 的 IncomingHttpHeaders），统一取首个值 */
function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** G1：从 webhook payload 的 labels 数组提取标题（GitLab 元素形如 {title}，GitHub 形如 {name}；裸字符串也兼容） */
function labelTitles(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((x) => {
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        const t = o.title ?? o.name;
        return typeof t === 'string' && t.length > 0 ? t : null;
      }
      return typeof x === 'string' && x.length > 0 ? x : null;
    })
    .filter((x): x is string => x !== null);
  return out;
}

interface MatchedProject {
  projectId: number;
  shortId: string;
  name: string;
  repoUrl: string;
  repoKind: string;
  environment: { name: string; url: string } | null;
}

/** 双平台归一化后的 PR/MR 上下文（GitLab object_attributes / GitHub pull_request） */
interface PrContext {
  platform: 'gitlab' | 'github';
  /** GitLab iid / GitHub number（可能缺失，缺失时跳过 mr 落库与评论回写） */
  iid?: number;
  title: string;
  branch: string;
  /** MR/PR 描述文本（③ 禅道 bug 关联提取也扫这里） */
  description?: string;
  diffText?: string;
  changedFiles?: string[];
  /** MR/PR label 标题数组（GitLab labels[].title / GitHub labels[].name；G1 分档计划用） */
  labels?: string[];
  /** GitLab 项目 id（用于拉 changes / 回写 notes） */
  gitlabProjectId?: number | string;
  /** GitHub owner / repo（用于拉 files / 回写 issue comment） */
  githubOwner?: string;
  githubRepo?: string;
  body: Record<string, unknown>;
}

/** T5：把影响分析结果 + 回归 outcome 合成 ReviewReport（不二次调 LLM，直接喂给 buildMrComment） */
function buildReviewFromImpact(
  impact: { summary: string; affectedAreas: Array<{ area: string; reason: string; risk: string }> },
  outcome: RunOutcome,
): ReviewReport {
  return {
    summary: `${impact.summary}（回归判定：${outcome.verdict}${outcome.failureSummary ? '，失败：' + outcome.failureSummary : ''}）`,
    areas: impact.affectedAreas.map((a) => ({
      title: a.area.slice(0, 20),
      severity: (a.risk === 'high' ? 'high' : a.risk === 'medium' ? 'medium' : 'info') as ReviewReport['areas'][number]['severity'],
      related: 'pr' as const,
      suggestion: a.reason,
    })),
  };
}

/**
 * webhook 入口（GitLab + GitHub 双平台）。
 * 链路：鉴权（token / HMAC）→ 真拉 diff → 影响分析 → 定向回归 Run → 评论回写。
 * 评论回写与动态探索均为异步、失败不阻塞主链路。
 */
@Controller('api/webhooks')
export class WebhooksController {
  constructor(
    private readonly runs: RunsService,
    private readonly exploreSvc: ExploreService,
    private readonly gitlabClient: GitlabClient,
    private readonly githubClient: GithubClient,
    private readonly loginRecipes: LoginRecipesService,
  ) {}

  /** T9: 用 repo url/path 反查归属 project 及其环境（GitLab: project.http_url/web_url/path_with_namespace；GitHub: repository.*） */
  private async resolveProjectByRepo(body: Record<string, unknown>): Promise<MatchedProject | null> {
    const proj = (body?.project ?? {}) as Record<string, unknown>;
    const repo = (body?.repository ?? {}) as Record<string, unknown>;
    const candidates = [
      proj.http_url, proj.web_url, proj.path_with_namespace,
      repo.html_url, repo.clone_url, repo.full_name,
    ].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (candidates.length === 0) return null;
    const paths = candidates.map(repoPath);
    const rows = await this.exploreSvc.pg.query(
      `SELECT pr.id, pr.project_id, pr.repo_url, pr.kind, p.short_id AS p_short_id, p.name AS p_name
       FROM project_repo pr JOIN project p ON p.id = pr.project_id`,
    );
    const hit = (rows.rows as Array<Record<string, unknown>>).find((r) => paths.includes(repoPath(r.repo_url)));
    if (!hit) return null;
    // PR 验证优先用非生产环境（测试/预发），仅生产环境时才回退生产
    const envRows = await this.exploreSvc.pg.query(
      `SELECT name, url, is_production FROM project_environment WHERE project_id = $1 ORDER BY is_production ASC, id LIMIT 1`,
      [hit.project_id as number],
    );
    const envRow = envRows.rows[0] as { name: string; url: string } | undefined;
    return {
      projectId: hit.project_id as number,
      shortId: hit.p_short_id as string,
      name: hit.p_name as string,
      repoUrl: hit.repo_url as string,
      repoKind: hit.kind as string,
      environment: envRow && (envRow.url || envRow.name) ? { name: envRow.name, url: envRow.url } : null,
    };
  }

  /** D3：GitLab MR webhook → 鉴权 → 真拉 diff → 影响分析 → 定向 Run → 回写评论 */
  @Post('gitlab')
  async gitlab(@Body() body: Record<string, unknown>, @Headers('x-gitlab-token') token?: string) {
    await this.exploreSvc.ensureReady(); // webhook 可能是重启后第一个请求——先确保 pool/schema 就绪
    // T5: webhook 鉴权（X-Gitlab-Token），不匹配直接 401（未配置时降级放行）
    const auth = await this.gitlabClient.verifyWebhook(token ?? null);
    if (!auth.ok) throw new HttpException({ ok: false, reason: auth.reason }, HttpStatus.UNAUTHORIZED);

    const kind = (body?.object_kind as string) ?? 'unknown';
    if (kind !== 'merge_request') {
      return { accepted: false, reason: `ignored object_kind=${kind}` };
    }
    const attrs = (body?.object_attributes ?? {}) as Record<string, unknown>;
    const project = (body?.project ?? {}) as Record<string, unknown>;
    const iid = attrs.iid as number | undefined;
    const projectId = (attrs.target_project_id ?? attrs.source_project_id ?? project.id) as number | undefined;
    const branch = (attrs.source_branch as string) ?? 'unknown-branch';
    const title = (attrs.title as string) ?? `MR !${iid ?? '?'}`;

    // T5: 真拉 diff（替代 body.diff），失败降级 body 自带字段（不阻塞）
    let diffText = (body.diff as string) ?? undefined;
    let changedFiles = (body.changed_files as string[]) ?? undefined;
    if (iid != null && projectId != null) {
      const pulled = await this.gitlabClient.fetchChanges(projectId, iid).catch((err) => {
        console.log('[webhook] GitLab changes 拉取失败（降级 body.diff）：', err instanceof Error ? err.message.slice(0, 80) : err);
        return null;
      });
      if (pulled) {
        if (pulled.diffText) diffText = pulled.diffText;
        if (pulled.changedFiles.length > 0) changedFiles = pulled.changedFiles;
        console.log(`[webhook] GitLab changes 已拉取：${pulled.changedFiles.length} 个文件`);
      }
    }

    const description = (attrs.description as string) ?? undefined;
    // G1：label 标题（GitLab MR webhook 的 labels 在 body 顶层，元素 {title}；兼容 attrs.labels）
    const labels = labelTitles(body.labels) ?? labelTitles(attrs.labels) ?? [];
    if (labels.length > 0) console.log(`[webhook] MR labels: ${labels.join(', ')}`);
    return this.handlePr({ platform: 'gitlab', iid, title, branch, description, diffText, changedFiles, labels, gitlabProjectId: projectId, body });
  }

  /** T5：GitHub PR webhook → HMAC 鉴权 → 真拉 files → 影响分析 → 定向 Run → 回写评论 */
  @Post('github')
  async github(
    @Req() req: { rawBody?: Buffer; headers?: Record<string, string | string[] | undefined> },
    @Body() body: Record<string, unknown>,
  ) {
    await this.exploreSvc.ensureReady();
    // T5: webhook 鉴权（X-Hub-Signature-256，对 raw body 做 HMAC-SHA256；未配置 secret 时降级放行）
    const signature = firstHeader(req.headers?.['x-hub-signature-256']);
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);
    const auth = await this.githubClient.verifySignature(raw, signature);
    if (!auth.ok) throw new HttpException({ ok: false, reason: auth.reason }, HttpStatus.UNAUTHORIZED);

    // 仅处理 pull_request 事件（push / issue 等其他事件直接忽略，不进入重链路）
    if (!body?.pull_request || typeof body.pull_request !== 'object') {
      return { accepted: false, reason: 'ignored non-pull_request event' };
    }

    const pr = (body?.pull_request ?? {}) as Record<string, unknown>;
    const repo = (body?.repository ?? {}) as Record<string, unknown>;
    const owner = (repo.owner as Record<string, unknown> | undefined)?.login as string | undefined;
    const repoName = repo.name as string | undefined;
    const number = pr.number as number | undefined;
    const title = (pr.title as string) ?? `PR #${number ?? '?'}`;
    const branch = ((pr.head as Record<string, unknown> | undefined)?.ref as string) ?? 'unknown-branch';

    // T5: 真拉 changed files（替代空变更集），失败降级空（不阻塞）
    let diffText: string | undefined;
    let changedFiles: string[] | undefined;
    if (owner && repoName && number != null) {
      const pulled = await this.githubClient.fetchChangedFiles(owner, repoName, number).catch((err) => {
        console.log('[webhook] GitHub files 拉取失败（降级空变更集）：', err instanceof Error ? err.message.slice(0, 80) : err);
        return null;
      });
      if (pulled) {
        if (pulled.diffText) diffText = pulled.diffText;
        if (pulled.changedFiles.length > 0) changedFiles = pulled.changedFiles;
        console.log(`[webhook] GitHub files 已拉取：${pulled.changedFiles.length} 个文件`);
      }
    }

    // G1：label 标题（GitHub PR webhook 的 pr.labels 元素形如 {name}）
    const labels = labelTitles(pr.labels) ?? [];
    if (labels.length > 0) console.log(`[webhook] PR labels: ${labels.join(', ')}`);
    return this.handlePr({ platform: 'github', iid: number, title, branch, diffText, changedFiles, labels, githubOwner: owner, githubRepo: repoName, body });
  }

  /** 双平台共享主链路：三层配置 → 触发规则 → 影响分析 → 定向 Run → issue/mr 落库 → 异步回写评论 */
  private async handlePr(ctx: PrContext) {
    const { platform, iid, title, branch } = ctx;

    // T8：读 config.yaml（项目默认层）→ 合并 Test Plan 层与单次 Run override 层（三层优先级）
    const { pr: projectDefault, source: configSource } = loadPrConfig(process.cwd());
    const { testPlan, override } = extractPrLayers(ctx.body);
    const pr = mergePrConfig(projectDefault, testPlan, override);
    console.log(`[webhook] 按 config 门禁策略=${pr.gate}${configSource ? `（${configSource}）` : '（未找到 config.yaml，用默认）'}`);
    console.log(`[webhook] 门禁阈值：fail→${applyGate(pr.gate, 'fail').decision} · unknown→${applyGate(pr.gate, 'unknown').decision}`);
    if (pr.verifications.length > 0) console.log(`[webhook] config 指定验证=${pr.verifications.join(', ')}`);
    // G1：分档计划判定（分支通配 / label 命中 fullTriggers → full，否则 smoke）
    const plan = resolvePlan(pr, branch, ctx.labels ?? []);
    console.log(`[webhook] 分档计划=${plan}（gateMode=${pr.gateMode}${plan === 'full' ? `，命中 fullTriggers ${JSON.stringify(pr.fullTriggers)}` : '，默认冒烟档'}）`);
    if (override.gate || override.branches || override.files || override.verifications) {
      console.log('[webhook] 三层 merge：单次 Run override 已覆盖项目默认（override 最高优先级生效）');
    }

    // branches/files 触发规则：命中才触发定向回归，未命中直接跳过（不打断 webhook 链路）
    const triggerCheck = shouldTriggerPr(pr, branch, ctx.changedFiles ?? []);
    if (!triggerCheck.trigger) {
      console.log(`[webhook] 跳过：${triggerCheck.reason}`);
      return { accepted: false, skipped: true, reason: triggerCheck.reason, gate: pr.gate };
    }
    console.log(`[webhook] ${triggerCheck.reason}`);

    // T9: 按 repo url/path 反查归属 project——用该项目的环境作为 Run 目标（找不到则回退默认 fixture）
    const matched = await this.resolveProjectByRepo(ctx.body).catch((err) => {
      console.log('[webhook] ⚠️ repo 反查失败（不阻塞）：', err instanceof Error ? err.message.slice(0, 80) : err);
      return null;
    });
    if (matched) {
      console.log(`[webhook] repo 反查命中项目=${matched.name}(${matched.shortId}) repo=${matched.repoUrl} kind=${matched.repoKind}` +
        `${matched.environment ? ` 环境=${matched.environment.name}(${matched.environment.url})` : '（该项目无环境，回退 fixture）'}`);
    } else {
      console.log('[webhook] repo 未匹配任何项目（project_repo 空或 url 不匹配），按默认项目处理');
    }

    const llm = {
      apiKey: process.env.LLM_API_KEY ?? '',
      baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
    };
    // LLM 结构化输出偶发不合 schema（AI_NoObjectGeneratedError）——降级为启发式分析，webhook 链路不中断
    let impact: Awaited<ReturnType<typeof analyzeImpact>>;
    try {
      impact = await analyzeImpact({ prTitle: title, diffText: ctx.diffText, changedFiles: ctx.changedFiles, llm });
    } catch (err) {
      console.log('[webhook] ⚠️ LLM 影响分析失败，降级启发式：', err instanceof Error ? err.message.slice(0, 80) : err);
      const domain = ctx.changedFiles?.[0]?.split('/')[0] ?? branch.split('/')[1] ?? '核心业务';
      impact = {
        summary: `（LLM 分析降级：模型输出不合 schema）基于变更文件的启发式分析：本次改动涉及 ${domain} 域（${(ctx.changedFiles ?? []).join(', ') || branch}），建议对既有流程做定向回归。`,
        affectedAreas: [{ area: `${domain} 流程回归`, risk: 'medium', reason: `changed files: ${(ctx.changedFiles ?? []).join(', ') || '未知'}` }],
        regressionSuggestions: [
          { title: `${title} 变更后主流程回归`, targetUrlHint: 'list.html' },
          { title: `${domain} 关键断言复验`, targetUrlHint: 'list.html' },
        ],
      } as typeof impact;
    }

    // 定向回归步骤：前置确定性登录 + 每条 suggestion 变 assertion+targetRef（UNKNOWN 防假绿生效）
    // T9+：优先用项目 login_recipe（render 注入真实凭据）；无配方/凭据缺失时回退 DEMO_STEPS[0]（fixture）
    let loginSteps: StepDef[] = [DEMO_STEPS[0]];
    if (matched?.projectId) {
      try {
        const recipe = await this.loginRecipes.resolveByProject(matched.projectId);
        if (recipe) {
          const rendered = await this.loginRecipes.render(recipe, '管理员');
          if (rendered.credentialInjected && rendered.steps.length > 0) {
            loginSteps = rendered.steps;
          }
        }
      } catch (err) {
        console.log('[webhook] 登录配方解析失败，回退 fixture 登录：', err instanceof Error ? err.message.slice(0, 80) : String(err));
      }
    }
    const envBase = matched?.environment?.url?.replace(/\/+$/, '') ?? null;
    const targetSteps: StepDef[] = [
      ...loginSteps,
      ...impact.regressionSuggestions.slice(0, 3).flatMap((sug, i) => {
        // ④：targetUrlHint 是真实页面路径（以 / 开头）时——前置确定性导航步直达该页，
        // targetRef 从裸 host 收紧为具体路径（触达校验更严格，假绿空间更小）
        // 只有「纯路径」形态的 hint 才用于导航/触达（LLM 可能给出 "/articles → /articles/:slug"
        // 这类路由描述或含空格说明文本，直接 goto/匹配必然 UNKNOWN）
        const hintPath = typeof sug.targetUrlHint === 'string' && envBase && /^\/[A-Za-z0-9_\-./]*$/.test(sug.targetUrlHint)
          ? sug.targetUrlHint
          : null;
        return [
          ...(hintPath
            ? [{
                id: `st_nav_${i + 1}`,
                title: `导航到回归页面 ${hintPath}`,
                kind: 'deterministic' as const,
                goto: `${envBase}${hintPath}`,
              } as StepDef]
            : []),
          {
            id: `st_reg_${i + 1}`,
            title: sug.title,
            // T9+：fixture 断言（list.html）只适用于 demo 站点；真实环境改 LLM 驱动回归——
            // 浏览相关页面核查功能可用性，visitedUrls 触达校验（防假绿）用环境 host/路径
            kind: 'ai' as const,
            instruction: `在已登录的站点中验证回归点「${sug.title}」：通过页面导航浏览相关功能页面，确认页面正常渲染、无报错/空白/异常跳转。若一切正常，结束本步骤；若发现问题，描述具体现象。`,
            targetRef: hintPath ?? (matched?.environment?.url
              ? (() => { try { return new URL(matched.environment!.url!).host; } catch { return undefined; } })()
              : undefined),
          } as StepDef,
        ];
      }),
    ];

    // ②：config hardSteps（真实 UI 确定性操作链 + 硬断言）——有真实环境且 config 提供时追加，
    // 消除纯 AI 判定的假绿空间（{{envUrl}} 占位渲染为项目环境 url）
    if (envBase && pr.hardSteps.length > 0) {
      pr.hardSteps.forEach((hs, i) => {
        const ts = String(Date.now());
        const render = (u: string) =>
          u.replace(/\{\{envUrl\}\}/g, envBase).replace(/\{\{ts\}\}/g, ts);
        const step: StepDef = {
          id: `st_hard_${i + 1}`,
          title: hs.title,
          kind: hs.ai ? 'ai' : 'deterministic',
          ...(hs.goto ? { goto: render(hs.goto) } : {}),
          ...(hs.ai ? { instruction: hs.ai } : {}),
          ...(!hs.ai && hs.actions && hs.actions.length > 0
            ? {
                actions: hs.actions
                  .filter((a) => ['goto', 'fill', 'click', 'press'].includes(a.type))
                  .map((a) => ({
                    type: a.type as 'goto' | 'fill' | 'click' | 'press',
                    ...(a.selector ? { selector: a.selector } : {}),
                    ...(a.value !== undefined ? { value: render(a.value) } : {}),
                    ...(a.url ? { url: render(a.url) } : {}),
                  })),
              }
            : {}),
          ...(hs.assert && ['url_contains', 'url_matches', 'text_visible', 'element_visible'].includes(hs.assert.kind) && hs.assert.value
            ? { assert: { kind: hs.assert.kind as 'url_contains' | 'url_matches' | 'text_visible' | 'element_visible', value: hs.assert.value } }
            : {}),
          ...(hs.targetRef ? { targetRef: hs.targetRef } : {}),
        };
        targetSteps.push(step);
      });
      console.log(`[webhook] config 硬断言步骤已追加：${pr.hardSteps.length} 步（环境 ${envBase}）`);
    }

    // 高风险 affectedAreas → 自动转 issue 落库（同标题 open 去重）
    const issues: Array<{ title: string; severity: string }> = [];
    for (const a of impact.affectedAreas.filter((x) => x.risk !== 'low')) {
      const dup = await this.exploreSvc.pg.query(`SELECT id FROM issue WHERE title = $1 AND status = 'open' LIMIT 1`, [a.area]);
      if (dup.rows.length === 0) {
        await this.exploreSvc.pg.query(
          `INSERT INTO issue(short_id, application_id, title, severity, source)
           VALUES ($1, 1, $2, $3, $4::jsonb)`,
          [`iss_${Math.random().toString(36).slice(2, 8)}`, a.area, a.risk, JSON.stringify({ reason: a.reason, pr: title, mrIid: iid })],
        );
        issues.push({ title: a.area, severity: a.risk });
      }
    }

    // T9: 反查到项目且带环境 → 用该环境 url 作为 Run 目标；否则回退 fixture
    const startUrl = matched?.environment?.url || this.runs.fixtureEntryUrl;

    // ① webhook Run 落 verification：为本次 MR 审查创建 verification 对象（回放页左侧步骤定义
    // 与右侧回放对齐；run.verification_id 不再为 null）。锚点：项目 application + qa_mr_review。
    let verificationShortId: string | undefined;
    try {
      await this.exploreSvc.ensureReady();
      const projId = matched?.projectId ?? 1;
      let app = await this.exploreSvc.pg.query(
        `SELECT id FROM application WHERE project_id = $1 ORDER BY id LIMIT 1`, [projId]);
      if (app.rows.length === 0) {
        app = await this.exploreSvc.pg.query(
          `INSERT INTO application(short_id, project_id, name, type)
           VALUES ($1, $2, $3, 'web') RETURNING id`,
          [`app_${Math.random().toString(36).slice(2, 8)}`, projId, matched?.name ?? 'MR 审查目标']);
      }
      const appId = app.rows[0].id as number;
      let qa = await this.exploreSvc.pg.query(
        `SELECT id FROM qa_point WHERE short_id = 'qa_mr_review' LIMIT 1`);
      if (qa.rows.length === 0) {
        qa = await this.exploreSvc.pg.query(
          `INSERT INTO qa_point(short_id, application_id, title, category, status, confidence, source)
           VALUES ('qa_mr_review', $1, 'MR 自动审查（webhook 触发）', '正常流程', 'selected', 1.0, '{"webhook":true}'::jsonb)
           RETURNING id`, [appId]);
      }
      verificationShortId = `ver_${Math.random().toString(36).slice(2, 8)}`;
      await this.exploreSvc.pg.query(
        `INSERT INTO verification(short_id, qa_point_id, title, actor, steps, status)
         VALUES ($1, $2, $3, '管理员', $4::jsonb, 'ready')`,
        [verificationShortId, qa.rows[0].id, `MR 审查：${title}`, JSON.stringify(targetSteps)]);
    } catch (err) {
      console.log('[webhook] verification 落库失败（不阻塞 Run）：', err instanceof Error ? err.message.slice(0, 120) : String(err));
    }

    const trigger = await this.runs.trigger({ startUrl, steps: targetSteps, verificationShortId, trigger: 'pr' });

    // F11: webhook 落/更新 MR 记录（列表自动出现；review 存 impact 摘要供详情页渲染）
    if (iid != null) {
      const projName = matched?.name ?? String((ctx.body?.project as Record<string, unknown> | undefined)?.name ?? 'order-api');
      const repoLabel = matched?.repoUrl ?? String((ctx.body?.project as Record<string, unknown> | undefined)?.path_with_namespace ?? projName);
      const userName = String((ctx.body?.user as Record<string, unknown> | undefined)?.name ?? 'gitlab-user');
      await this.exploreSvc.pg.query(
        `INSERT INTO mr(iid, title, state, author, repo, source_branch, review)
         VALUES ($1,$2,'opened',$3,$4,$5,$6::jsonb)
         ON CONFLICT (iid) DO UPDATE SET title = EXCLUDED.title, source_branch = EXCLUDED.source_branch,
           review = EXCLUDED.review, running = false, updated_at = now()`,
        [iid, title, userName, repoLabel, branch, JSON.stringify({
          verdict: 'unknown',
          checkedAt: '刚刚 · webhook 自动触发（preview 就绪）',
          summary: impact.summary,
          // G3：影响面 × 回归步骤 覆盖标注（coveredBy=step#N / uncoveredReason）
          areas: annotateCoverage(impact.affectedAreas.map((a) => ({
            title: a.area, severity: a.risk === 'high' ? 'high' : 'info',
            related: a.risk === 'high' ? '本 PR 相关' : null, hint: a.reason, action: null,
          })), targetSteps.map((s) => ({ text: `${s.title} ${s.instruction ?? ''}`, kind: s.kind }))),
          // G5：分档引擎——full 档回归上限 8（smoke 5）
          tests: impact.regressionSuggestions.slice(0, plan === 'full' ? 8 : 5).map((s, i) => ({
            title: s.title, status: 'unknown', source: `webhook 定向回归 #${i + 1}`, durationSec: 0,
          })),
          bot: `webhook 触发（${plan === 'full' ? 'Full 全量档：回归上限 8 · 探索深度 ×2' : 'Smoke 冒烟档'}）：${impact.regressionSuggestions.length} 条定向回归建议已注入 Run 执行（防假绿 targetRef 生效）。`,
        })],
      );

      // F11-dyn: 动态探索（探索式回归）——mini-explore 收集 Live Findings，完成后合并进 MR review
      // 异步执行（webhook 响应不等待）；引擎忙则诚实标注跳过（explore 服务状态全局共享，并发会互相污染）
      void (async () => {
        if (this.exploreSvc.controlState().running) {
          await this.exploreSvc.pg.query(
            `UPDATE mr SET review = jsonb_set(review, '{bot}', to_jsonb((review->>'bot') || ' 动态探索跳过（探索引擎忙，稍后重试）。')), updated_at = now() WHERE iid = $1`,
            [iid],
          ).catch(() => undefined);
          return;
        }
        const findings: LiveFinding[] = [];
        try {
          const done = await this.exploreSvc.explore(
            // G5：full 档探索深度 ×2（maxActions 10 vs smoke 5）
            { startUrl, intent: `PR !${iid} 动态探索（探索式回归）`, maxActions: plan === 'full' ? 10 : 5, credential: { username: 'admin', password: 'test123' } },
            (e) => { if (e.finding) findings.push(e.finding); },
          );
          // G3：指纹去重——相似发现合并（occurrences+1、confidence+0.15），探索噪音不重复刷屏
          const ded = dedupeFindings(findings);
          const cur = await this.exploreSvc.pg.query(`SELECT review FROM mr WHERE iid = $1 LIMIT 1`, [iid]);
          if (cur.rows.length > 0) {
            const review = (cur.rows[0].review ?? {}) as Record<string, unknown>;
            review.dynamicFindings = ded.kept.slice(0, 6);
            review.dynamicStats = { pages: done.pages ?? 0, edges: done.edges ?? 0, qaCount: done.qaCount ?? 0, rawCount: findings.length, merged: ded.mergedCount };
            review.bot = `${(review.bot as string) ?? ''} 动态探索完成：${done.pages ?? 0} 页 · ${done.edges ?? 0} 边 · 新增 ${done.qaCount ?? 0} 条 QA 候选 · ${findings.length} 条新发现（去重后 ${ded.kept.length} 条，合并 ${ded.mergedCount} 条）。`;
            await this.exploreSvc.pg.query(`UPDATE mr SET review = $2::jsonb, updated_at = now() WHERE iid = $1`, [iid, JSON.stringify(review)]);
          }
        } catch (err) {
          console.log('[webhook] 动态探索失败（不阻塞主链路）：', err instanceof Error ? err.message.slice(0, 80) : err);
        }
      })();

      // T5: 回归完成后回写平台评论（异步，失败只留痕不阻塞 webhook）
      void this.writeBackComment(ctx, trigger.runId, impact, pr.gate, targetSteps, pr.gateMode, plan).catch((err) => {
        console.log('[webhook] 评论回写异常（不阻塞）：', err instanceof Error ? err.message.slice(0, 120) : err);
      });
    }

    return {
      accepted: true,
      platform,
      mr: { iid, branch, title },
      gate: pr.gate,
      gateMode: pr.gateMode,
      plan,
      triggerRule: { branches: pr.branches, files: pr.files },
      issuesCreated: issues.length > 0 ? issues : undefined,
      impact: {
        summary: impact.summary,
        affectedAreas: impact.affectedAreas,
        regressionCount: impact.regressionSuggestions.length,
      },
      targetSteps: targetSteps.map((s) => ({ id: s.id, title: s.title, targetRef: s.targetRef })),
      previewUrl: startUrl,
      matchedProject: matched
        ? { shortId: matched.shortId, name: matched.name, repoUrl: matched.repoUrl, kind: matched.repoKind, environment: matched.environment }
        : null,
      dynamicExplore: iid != null ? 'started（mini-explore 约 30-60s，完成后 MR 详情出现「动态探索新发现」）' : undefined,
      ...(trigger as object),
    };
  }

  /** T5：等待定向回归 Run 完成后，用 buildMrComment 生成三段式评论并回写平台（G1：带 gateMode + plan） */
  private async writeBackComment(
    ctx: PrContext,
    runId: string,
    impact: Awaited<ReturnType<typeof analyzeImpact>>,
    gatePolicy: GatePolicy,
    targetSteps: StepDef[],
    gateMode: GateMode = 'blocking',
    plan: PlanTier = 'smoke',
  ): Promise<void> {
    if (ctx.platform === 'gitlab' && ctx.gitlabProjectId == null) {
      console.log('[webhook] 缺少 GitLab project_id，跳过 MR 评论回写');
      return;
    }
    if (ctx.platform === 'github' && (!ctx.githubOwner || !ctx.githubRepo)) {
      console.log('[webhook] 缺少 GitHub owner/repo，跳过 PR 评论回写');
      return;
    }
    const outcome = await this.waitRun(runId);
    if (!outcome) {
      console.log('[webhook] 回归未在超时内完成，跳过评论回写');
      return;
    }
    const report = buildReviewFromImpact(impact, outcome);
    const testRuns = buildTestRuns(outcome, targetSteps);
    const gate = applyGate(gatePolicy, outcome.verdict);

    // 回填 MR review：触发时写入的是 verdict:'unknown' 占位，Run 完成后把真实结论同步回列表
    // （jsonb 合并保留影响面/动态探索字段；iid 定位与触发时 INSERT ON CONFLICT(iid) 一致）
    if (ctx.iid != null) {
      const ztBug = this.extractZentaoBugId(ctx);
      await this.exploreSvc.pg.query(
        `UPDATE mr SET review = review || $2::jsonb, running = false, run_id = $3, updated_at = now() WHERE iid = $1`,
        [ctx.iid, JSON.stringify({
          verdict: outcome.verdict,
          checkedAt: 'Run ' + runId.slice(0, 12) + ' · ' + Math.round(outcome.durationMs / 1000) + 's',
          // G1：门禁模式与分档计划落库（列表/详情页可读）
          gateMode,
          plan,
          tests: testRuns.map((t) => ({ title: t.title, status: t.verdict, source: t.kind === 'ai' ? 'LLM 定向回归' : t.kind === 'assertion' ? '断言步骤' : '确定性步骤', durationSec: Math.round((t.durationMs ?? 0) / 1000) })),
          // G1：reporting 非阻塞模式 → gate 结果只影响文本（ℹ️ 提示），不拦截合并
          bot: (gateMode === 'reporting'
            ? 'ℹ️ 非阻塞模式（reporting）· 门禁 ' + gate.decision.toUpperCase() + ' 仅提示不拦截 · '
            : gate.decision === 'allow' ? '✓ 门禁 ALLOW · ' : '⛔ 门禁 BLOCK · ') + 'Run ' + outcome.verdict + '，结论已回写 GitLab' + (ztBug ? ' 与禅道 bug #' + ztBug : '') + '。',
        }), runId],
      ).catch((err: unknown) => console.log('[webhook] MR review 回填失败（不阻塞）：', err instanceof Error ? err.message.slice(0, 120) : err));
    }
    let comment = buildMrComment({
      prTitle: ctx.title,
      report,
      outcome,
      testRuns,
      gate,
      evidenceBase: (process.env.VERIFYOS_BASE_URL ?? '').replace(/\/+$/, '') || undefined,
      // G1：非阻塞标注 + 分档计划（评论文本随 gateMode/plan 变化，不影响发送）
      opts: { gateMode, plan },
    });
    // G2b：报告深链（WEB_BASE_URL/#/pr/<iid>，直达站内 PR 验证详情）+ 证据截图内嵌（上传失败降级纯文字，不阻塞回写）
    const webBase = (process.env.WEB_BASE_URL ?? '').replace(/\/+$/, '');
    if (webBase && ctx.iid != null) {
      comment += `\n---\n🗂 **[在 VerifyOS 查看完整报告（回放 / 证据 / 步骤明细）](${webBase}/#/pr/${ctx.iid})**`;
    }
    const shotKeys = (outcome.evidenceKeys ?? []).filter((k) => k.includes('screenshot')).slice(-2);
    if (ctx.platform === 'gitlab' && ctx.gitlabProjectId != null && shotKeys.length > 0) {
      const baseDir = nodePath.resolve(process.cwd(), '../../out/evidence');
      const marks: string[] = [];
      for (const k of shotKeys) {
        const up = await this.gitlabClient.uploadFile(ctx.gitlabProjectId, nodePath.resolve(baseDir, k), `验证证据 ${String(k.split('/').pop() ?? k)}`);
        if (up.ok && up.markdown) marks.push(up.markdown);
      }
      if (marks.length > 0) comment += `\n### 关键证据截图\n${marks.join('\n')}\n`;
    }
    if (ctx.platform === 'gitlab') {
      await this.gitlabClient.postComment(ctx.gitlabProjectId!, ctx.iid!, comment);
    } else {
      await this.githubClient.postComment(ctx.githubOwner!, ctx.githubRepo!, ctx.iid!, comment);
    }

    // ③ 禅道回写：MR 标题/分支提到 bug #N 时，审查结论同步为禅道 bug 评论
    // （ZENTAO_WRITE_URL 指向 85.85 回写 shim：HTTP → zt_action(action='Commented')）
    const zentaoBugId = this.extractZentaoBugId(ctx);
    if (zentaoBugId) {
      const writeUrl = (process.env.ZENTAO_WRITE_URL ?? '').replace(/\/+$/, '');
      if (!writeUrl) {
        console.log('[webhook] 检测到禅道 bug #' + zentaoBugId + ' 但未配置 ZENTAO_WRITE_URL，跳过禅道回写');
        return;
      }
      const ztText = [
        '【VerifyOS MR 自动审查】MR !' + (ctx.iid ?? '?') + '「' + ctx.title + '」回归结论：',
        '• 门禁判定：' + gate.decision.toUpperCase() + '（' + gate.reason + '，策略 ' + gatePolicy + '）',
        '• Run 结论：' + outcome.verdict + '，耗时 ' + Math.round(outcome.durationMs / 1000) + 's，LLM 调用 ' + outcome.llmCalls + ' 次',
        '• 影响分析：' + impact.summary,
        (process.env.VERIFYOS_BASE_URL ? '• 详情：' + process.env.VERIFYOS_BASE_URL.replace(/\/+$/, '') + '/runs/' + runId : ''),
        '（本评论由 VerifyOS 机器人自动写入）',
      ].filter(Boolean).join('\n');
      try {
        const resp = await fetch(writeUrl + '/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectType: 'bug', objectID: zentaoBugId, actor: 'Crab', comment: ztText }),
        });
        const bodyTxt = (await resp.text()).slice(0, 200);
        console.log('[webhook] 禅道回写 bug #' + zentaoBugId + '：HTTP ' + resp.status + ' ' + bodyTxt);
      } catch (err) {
        console.log('[webhook] 禅道回写失败（不阻塞）：', err instanceof Error ? err.message.slice(0, 120) : String(err));
      }
    }
  }

  /** ③ 从 MR 标题/描述/分支提取禅道 bug id（bug #5 / #5 / bug5；标题→描述→分支） */
  private extractZentaoBugId(ctx: PrContext): number | null {
    const texts = [ctx.title, ctx.description ?? '', ctx.branch];
    const patterns = [/bug\s*#?(\d{1,6})\b/i, /#(\d{1,6})\b/];
    for (const re of patterns) {
      for (const t of texts) {
        const m = re.exec(t);
        if (m) return Number(m[1]);
      }
    }
    return null;
  }

  /** 等待 run.done 事件并取回 RunOutcome（触发后立即调用，超时兜底避免悬挂） */
  private waitRun(runId: string, timeoutMs = 180000): Promise<RunOutcome | null> {
    return new Promise((resolve) => {
      const cached = this.runs.get(runId);
      if (cached) { resolve(cached); return; }
      let settled = false;
      const onDone = (d: { runId: string }) => {
        if (d.runId !== runId) return;
        finish(this.runs.get(runId) ?? null);
      };
      const finish = (o: RunOutcome | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.runs.off('run.done', onDone);
        resolve(o);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      this.runs.on('run.done', onDone);
    });
  }
}
