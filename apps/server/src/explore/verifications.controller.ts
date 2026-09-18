import {
  Controller, Get, Post, Put, Body, Param, BadRequestException, NotFoundException,
} from '@nestjs/common';
import type { StepDef } from '@verifyos/agent-core';
import { ExploreService } from './explore.service';
import { RunsService } from '../runs/runs.service';
import { LoginRecipesService, DEMO_LOGIN_STEPS } from './login-recipes.service';
import { LlmService } from '../llm/llm.service';

/** F7（审查）：括号配平提取第一个完整 JSON 对象（贪婪正则在多对象输出时整体失败）。 */
function extractFirstJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

@Controller('api')
export class VerificationsController {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly runs: RunsService,
    private readonly loginRecipes: LoginRecipesService,
    private readonly llm: LlmService,
  ) {}

  /** 数字 id 参数统一防护（J01 任务2）：NaN → 400 */
  private numericId(raw: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new BadRequestException('invalid id');
    return n;
  }

  /** F2（审查）：LLM 输出 goto 白名单校验——仅 http/https 且 host 与 sourceUrl 同注册域。
   *  不合规返回 null（调用方丢弃该条目）。防 prompt 注入诱导 runner 导航外站/javascript: URI。 */
  private sanitizeGoto(goto: string, sourceUrl: string): string | null {
    let u: URL;
    try { u = new URL(goto); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    let base: URL | null = null;
    try { base = sourceUrl ? new URL(sourceUrl) : null; } catch { base = null; }
    if (base) {
      const reg = (h: string) => h.split('.').slice(-2).join('.').toLowerCase();
      if (reg(u.hostname) !== reg(base.hostname)) return null;
    }
    return u.toString();
  }

  /** F2（审查）：instruction 明显注入模式过滤——命中返回 null（丢弃该步）。
   *  拦截账号密码外传/导航外站/复制页面数据等二阶注入常用指令。 */
  private sanitizeInstruction(instruction: string): string | null {
    const patterns = [
      /password|密码|账号.*填|凭据|credential/i,
      /fetch\(|xmlhttp|axios|ajax|\$\.post|\$\.get/i,
      /document\.cookie|localstorage|sessionstorage/i,
      /\b(eval|function)\s*\(/i,
      /(?:https?:\/\/|www\.)\S+/i,
    ];
    if (patterns.some((p) => p.test(instruction))) return null;
    return instruction;
  }

  /**
   * AI 起草业务步骤（U30：mode='ai'）：LLM 按 QA 点场景（标题/分类/风险/理由/页面/角色）生成
   * 中段业务操作步骤；登录段仍由项目配方负责。超时/解析失败返回 null（调用方回退纯模板）。
   */
  private async draftScenarioSteps(
    row: { title: string; category: string; risk?: string; source: Record<string, unknown> },
    sourceUrl: string,
    actor: string,
  ): Promise<StepDef[] | null> {
    const sys = [
      '你是 Web 自动化测试专家。根据给定的 QA 点信息，为已通过平台登录的测试执行者起草业务操作步骤。',
      '规则：',
      '1. 不要生成任何登录/账号/密码步骤（登录由平台配方负责）；不要在步骤中出现具体账号密码。',
      '2. 聚焦该 QA 点场景本身：在目标页面上点什么、填什么、切换什么状态、检查什么结果。',
      '3. kind 取值：deterministic（有确定 URL 的导航）| ai（需要看页面再决定的操作，一句话自包含中文指令）| assertion（结果检查）。',
      '4. assert.kind 取值：url_contains | text_visible | element_visible；断言值必须是页面上可检验的具体文本/URL 片段/选择器。',
      '5. 步骤数 2-6 条，从关键操作到可观察结果，层层递进到断言结束。',
      '6. 只输出严格 JSON，格式：{"steps":[{"kind":"...","title":"...","goto":"...","instruction":"...","assert":{"kind":"...","value":"..."}}]}，不要任何解释或代码块标记。',
    ].join('\n');
    const user = [
      'QA 点：' + row.title,
      '分类：' + row.category,
      '风险：' + (row.risk ?? '未知'),
      '目标页面：' + (sourceUrl || '（未提供）'),
      '执行角色：' + actor,
      '背景理由：' + String(row.source?.rationale ?? '无'),
      '页面路径提示：' + String(row.source?.sourceUrl ?? ''),
    ].join('\n');
    // F1（审查）：AbortController 真正取消底层请求 + 成功路径清理计时器（不再悬挂连接/泄漏定时器）
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50_000);
    let raw: string;
    try {
      raw = await this.llm.chat(
        [{ role: 'system', content: sys }, { role: 'user', content: user }],
        { signal: controller.signal },
      );
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
    // F7（审查）：贪婪正则在多对象输出时整体解析失败——改括号配平提取第一个完整 JSON 对象
    const m = extractFirstJson(String(raw));
    if (!m) return null;
    let parsed: { steps?: Array<Record<string, unknown>> };
    try { parsed = JSON.parse(m); } catch { return null; }
    const out: StepDef[] = [];
    const entries = Array.isArray(parsed.steps) ? parsed.steps.slice(0, 8) : [];
    entries.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const kind = String(s.kind);
      const title = String(s.title ?? '').slice(0, 40) || ('业务步骤 ' + (i + 1));
      const assert = s.assert as { kind?: unknown; value?: unknown } | undefined;
      const assertKind = String(assert?.kind ?? '');
      if (kind === 'assertion' && ['url_contains', 'text_visible', 'element_visible'].includes(assertKind) && String(assert?.value ?? '').trim()) {
        const value = String(assert?.value).slice(0, 160);
        out.push({ id: 'st_a' + (i + 1), title, kind: 'assertion', assert: { kind: assertKind as 'url_contains' | 'text_visible' | 'element_visible', value }, targetRef: value });
      } else if (kind === 'deterministic' && String(s.goto ?? '').trim()) {
        // F2（审查）：goto 白名单——仅 http/https 且 host 与 sourceUrl 同注册域，防 LLM 被诱导外跳/javascript: URI
        const goto = this.sanitizeGoto(String(s.goto).slice(0, 300), sourceUrl);
        if (goto) out.push({ id: 'st_a' + (i + 1), title, kind: 'deterministic', goto });
      } else if (String(s.instruction ?? '').trim()) {
        // F2（审查）：instruction 过滤明显注入模式（账号密码/外传/导航到外站 URL），命中即丢弃
        const instruction = this.sanitizeInstruction(String(s.instruction).slice(0, 300));
        if (instruction) out.push({ id: 'st_a' + (i + 1), title, kind: 'ai', instruction });
      }
    });
    return out.length > 0 ? out : null;
  }
  /** QA 点 → 验证生成（探索→执行最后一公里）：从 QA 点构造步骤（登录前置 + 断言 + targetRef），可一键触发；mode='ai' 时 LLM 起草业务步骤 */
  @Post('verifications')
  async genVerification(@Body() body: { qaShortId: string; trigger?: boolean; mode?: 'template' | 'ai' }) {
    await this.exploreSvc.ensureReady();
    const qa = await this.exploreSvc.pg.query(
      `SELECT id, title, category, risk, source FROM qa_point WHERE short_id = $1 LIMIT 1`,
      [body.qaShortId],
    );
    if (qa.rows.length === 0) return { found: false };
    const row = qa.rows[0] as { id: number; title: string; category: string; risk?: string; source: Record<string, unknown> };
    const sourceUrl = String(row.source?.sourceUrl ?? '');
    // 断言值兜底（审查 d 项）：有 path 用 path；裸域名（无 path）用 host 做弱断言；
    // 仅完全无 sourceUrl（demo 老流程）才保持 list.html 旧行为
    const pathHint = sourceUrl.replace(/^https?:\/\/[^/]+/, '');
    const assertHint = pathHint
      ? pathHint.replace(/^\//, '')
      : sourceUrl
        ? sourceUrl.replace(/^https?:\/\//, '')
        : 'list.html';

    // 登录前置：按 sourceUrl 匹配项目配方（login_recipe 表）；无配方时回退 demo 登录模板。
    // 明文凭据修复（安全审查项）：DB 与 GET 响应一律存/回占位符模板（{{username}}/{{password}}），
    // 真实凭据只在 trigger 触发运行时由 RunsService.injectCredential 按项目作用域注入，不再落库/回传。
    const actor = String(row.source?.actor ?? '管理员');
    const recipe = await this.loginRecipes.resolveBySourceUrl(sourceUrl);
    const login = await this.loginRecipes.render(recipe, actor); // 仅取 credentialInjected/note 元数据；steps 弃用（不落明文）
    const template: StepDef[] = recipe?.steps ?? DEMO_LOGIN_STEPS;
    // U30：mode='ai' —— LLM 按 QA 点场景起草中段业务步骤（登录段仍走配方）；失败/超时回退纯模板
    let generatedBy: 'ai' | 'template' = 'template';
    let scenarioSteps: StepDef[] | null = null;
    if (body?.mode === 'ai') {
      scenarioSteps = await this.draftScenarioSteps(row, sourceUrl, actor).catch(() => null);
      if (scenarioSteps && scenarioSteps.length > 0) generatedBy = 'ai';
      else scenarioSteps = null;
    }
    // F3（审查）：AI 步骤已含 assertion 时不再追加 st_end 基线断言——
    // AI 业务步骤常导航离开 sourceUrl 页面（进详情/提交跳转），固定 url_contains(sourceUrl) 必然假阴性
    const aiHasAssertion = (scenarioSteps ?? []).some((s) => s.kind === 'assertion');
    const steps: StepDef[] = [
      ...template,
      // 真实站点流程：登录成功后停在首页（如 /home），需补一个确定性导航步到 QA 点 sourceUrl 页面，
      // 断言 url_contains 才可能命中；demo 回退流程（无配方/无 sourceUrl）不插入，保持旧行为
      ...(recipe && sourceUrl
        ? [{ id: 'st_nav', title: '导航到目标页面', kind: 'deterministic', goto: sourceUrl } as StepDef]
        : []),
      // U30：AI 起草的业务步骤（点什么/填什么/查什么），插在导航与基线断言之间
      ...(scenarioSteps ?? []),
      ...((scenarioSteps && aiHasAssertion)
        ? []
        : [{
            id: 'st_end', title: row.title, kind: 'assertion',
            assert: { kind: 'url_contains', value: assertHint },
            targetRef: assertHint,
          } as StepDef]),
    ];
    const shortId = `ver_${Math.random().toString(36).slice(2, 8)}`;
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO verification(short_id, qa_point_id, title, actor, steps, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'ready') RETURNING id`,
      [shortId, row.id, row.title, actor, JSON.stringify(steps)],
    );
    const verificationId = r.rows[0].id as number;
    // F5: QA 状态机流转（生成验证后 → generated）
    await this.exploreSvc.pg.query(`UPDATE qa_point SET status = 'generated', updated_at = now() WHERE id = $1`, [row.id]);

    let runId: string | undefined;
    if (body?.trigger) {
      // steps 是占位符模板：RunsService.trigger → injectCredential 按 verificationShortId 解析项目、
      // 按 actor 解密凭据后再执行（真实密码只在内存/运行时出现）
      const trigger = await this.runs.trigger({
        steps: steps as never,
        actor,
        verificationShortId: shortId,
        ...(recipe?.startUrl ? { startUrl: recipe.startUrl } : {}),
      });
      runId = (trigger as { runId?: string }).runId;
    }
    return { found: true, verificationId, shortId, steps, runId, loginRecipe: login.recipeShortId, credentialInjected: login.credentialInjected, loginNote: login.note, generatedBy };
  }

  // ---------- F6：验证编辑器（列表 / 详情 / 步骤保存 / 空白新建） ----------

  /** 空白验证挂靠的「手工」QA 锚点（qa_point_id NOT NULL 约束下的诚实方案） */
  private async manualQaAnchorId(): Promise<number> {
    const q = await this.exploreSvc.pg.query(`SELECT id FROM qa_point WHERE short_id = 'qa_manual' LIMIT 1`);
    if (q.rows.length > 0) return q.rows[0].id as number;
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO qa_point(short_id, application_id, title, category, status, confidence, source)
       VALUES ('qa_manual', 1, '手工创建（验证编辑器入口）', '正常流程', 'selected', 1.0, '{"manual":true}'::jsonb)
       RETURNING id`,
    );
    return r.rows[0].id as number;
  }

  @Get('verifications')
  async listVerifications() {
    await this.exploreSvc.ensureReady();
    const r = await this.exploreSvc.pg.query(
      `SELECT v.id, v.short_id, v.title, v.actor, v.status, v.steps,
              q.short_id AS qa_short_id, q.title AS qa_title
       FROM verification v LEFT JOIN qa_point q ON q.id = v.qa_point_id
       ORDER BY v.updated_at DESC LIMIT 200`,
    );
    return { items: r.rows };
  }

  @Get('verifications/:id')
  async getVerification(@Param('id') id: string) {
    await this.exploreSvc.ensureReady();
    const r = await this.exploreSvc.pg.query(
      `SELECT v.id, v.short_id, v.title, v.actor, v.status, v.steps,
              q.short_id AS qa_short_id, q.title AS qa_title
       FROM verification v LEFT JOIN qa_point q ON q.id = v.qa_point_id
       WHERE v.id = $1 LIMIT 1`,
      [Number(id)],
    );
    if (r.rows.length === 0) return { found: false };
    return { found: true, ...r.rows[0] };
  }

  /** 空白验证：预填登录模块 + 断言步骤（登录配方数据驱动；可选 projectId 指定目标项目） */
  @Post('verifications/blank')
  async createBlank(@Body() body: { title?: string; actor?: string; projectId?: number }) {
    await this.exploreSvc.ensureReady();
    const qaId = await this.manualQaAnchorId();
    const shortId = `ver_${Math.random().toString(36).slice(2, 8)}`;
    // 登录配方：指定项目 → 项目配方；否则全局兜底（demo 模板）
    const recipe = body?.projectId
      ? await this.loginRecipes.resolveByProject(Number(body.projectId))
      : null;
    const actor = body?.actor?.trim() || '管理员';
    const login = await this.loginRecipes.render(recipe, actor);
    const steps = [
      ...login.steps,
      {
        id: 'st_end', title: '新断言步骤', kind: 'assertion',
        assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html',
      },
    ];
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO verification(short_id, qa_point_id, title, actor, steps, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'draft') RETURNING id, short_id`,
      [shortId, qaId, body?.title?.trim() || '手工验证', actor, JSON.stringify(steps)],
    );
    return { found: true, id: r.rows[0].id, shortId: r.rows[0].short_id, steps, loginRecipe: login.recipeShortId, credentialInjected: login.credentialInjected, loginNote: login.note };
  }

  /** 保存步骤（含标题/角色）：status 流转 draft→ready；不存在 → 404（0 行更新不再假成功） */
  @Put('verifications/:id/steps')
  async putSteps(@Param('id') id: string, @Body() body: { title?: string; actor?: string; steps?: unknown[] }) {
    await this.exploreSvc.ensureReady();
    const verId = this.numericId(id);
    const sets: string[] = [`updated_at = now()`];
    const vals: unknown[] = [verId];
    if (body?.title != null) { sets.push(`title = $${vals.length + 1}`); vals.push(String(body.title)); }
    if (body?.actor != null) { sets.push(`actor = $${vals.length + 1}`); vals.push(String(body.actor)); }
    if (Array.isArray(body?.steps)) {
      sets.push(`steps = $${vals.length + 1}::jsonb`);
      vals.push(JSON.stringify(body.steps));
      sets.push(`status = 'ready'`);
    }
    if (sets.length === 1) return { ok: false, reason: 'no fields to update' };
    // RETURNING id：无 RETURNING 的 UPDATE 在 node-pg 里 rows 恒为空，会把存在的 id 误判 404（保存并运行永远短路的根因）
    const r = await this.exploreSvc.pg.query(`UPDATE verification SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, vals);
    if (r.rows.length === 0) throw new NotFoundException('not found');
    return { ok: true };
  }
}
