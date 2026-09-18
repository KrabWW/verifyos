import { Injectable } from '@nestjs/common';
import { CredentialCrypto, type StepDef } from '@verifyos/agent-core';
import { ExploreService } from './explore.service';

/**
 * 登录配方服务（修「登录步骤写死」）：
 * - login_recipe 表按项目存登录步骤模板（steps 内 {{username}}/{{password}} 占位）
 * - resolveBySourceUrl(sourceUrl)：host → project_environment.url / qa_point.sourceUrl → 项目 → 配方
 * - render(recipe, actor)：按角色解密凭据替换占位符；凭据缺失时保留占位符原文（编辑器可手填）
 * - 无配方/表不可用时回退 DEMO_LOGIN_STEPS（与原硬编码行为一致，回滚安全）
 */

/** 与原 verifications.controller.ts 硬编码等价的兜底（demo fixture，占位符化） */
export const DEMO_LOGIN_STEPS: StepDef[] = [
  {
    id: 'st_l1', title: '管理员登录', kind: 'module',
    actions: [
      { type: 'fill', selector: '#username', value: '{{username}}' },
      { type: 'fill', selector: '#password', value: '{{password}}' },
      { type: 'click', selector: 'button[type="submit"]' },
    ],
  },
  { id: 'st_l2', title: '登录成功断言', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html' },
];

/** 大合规平台（cp-test.ruijie.com，Ruijie IDS SSO）条件式 ai 登录模板——与 004 迁移 lr_cptest 种子等价 */
export const CPTEST_LOGIN_STEPS: StepDef[] = [
  { id: 'st_l1', title: '打开站点', kind: 'deterministic', goto: 'https://cp-test.ruijie.com/' },
  { id: 'st_l2', title: '登录（如已登录则跳过）', kind: 'ai', instruction: '如果页面显示 Ruijie IDS 登录表单：在 Enter your account 输入框填入 {{username}}。如果已在系统内（左侧有菜单），什么都不做' },
  { id: 'st_l3', title: '填密码（如需要）', kind: 'ai', instruction: '如果页面显示密码输入框（Please enter Password）：在其中填入 {{password}}。如果没有密码框，什么都不做' },
  { id: 'st_l4', title: '点登录（如需要）', kind: 'ai', instruction: '如果页面显示 Sign In 按钮：点击它。如果不在登录页，什么都不做' },
];

export interface LoginRecipe {
  id: number;
  shortId: string;
  projectId: number;
  name: string;
  startUrl: string;
  steps: StepDef[];
}

export interface RenderedLogin {
  steps: StepDef[];
  startUrl: string;
  recipeShortId: string;
  credentialInjected: boolean;
  /** 凭据缺失/解密失败的原因（前端提示用） */
  note?: string;
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}

@Injectable()
export class LoginRecipesService {
  /** 运行时自愈种子：本进程是否已尝试过补种（fresh DB 上 project 运行时才建，迁移种子守卫跳过） */
  private recipesSeeded = false;

  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
  ) {}

  /**
   * 运行时配方自愈种子（配合 004 迁移的 FK 守卫）：fresh DB 上 project 由 explore.service.ts
   * 运行时才创建，迁移种子（WHERE project 存在）会静默跳过 → 配方永远缺失。
   * 进程内 once：首次调用时补种两条与迁移等价的 INSERT...SELECT...WHERE EXISTS(project)...
   * ON CONFLICT DO NOTHING；任何错误吞掉（表不存在/权限不足时保持无配方兜底，不阻塞主流程）。
   */
  private async ensureRecipes(): Promise<void> {
    if (this.recipesSeeded) return;
    this.recipesSeeded = true;
    try {
      await this.exploreSvc.ensureReady();
      await this.exploreSvc.pg.query(
        `INSERT INTO login_recipe(short_id, project_id, name, start_url, steps)
         SELECT 'lr_demo', p.id, '演示 CRM 登录（fixture）', '', $1::jsonb
         FROM project p WHERE p.id = 1
         ON CONFLICT (short_id) DO NOTHING`,
        [JSON.stringify(DEMO_LOGIN_STEPS)],
      );
      await this.exploreSvc.pg.query(
        `INSERT INTO login_recipe(short_id, project_id, name, start_url, steps)
         SELECT 'lr_cptest', p.id, '大合规平台 SSO 登录（cp-test）', 'https://cp-test.ruijie.com/', $1::jsonb
         FROM project p WHERE p.id = 2
         ON CONFLICT (short_id) DO NOTHING`,
        [JSON.stringify(CPTEST_LOGIN_STEPS)],
      );
    } catch {
      // 表不存在/连接失败 → 静默；resolveByXxx 后续查询自会走兜底
    }
  }

  /** sourceUrl → 项目 → 配方。优先级：project_environment.url host 匹配 → qa_point.sourceUrl host 匹配 */
  async resolveBySourceUrl(sourceUrl: string): Promise<LoginRecipe | null> {
    const host = hostOf(sourceUrl);
    if (!host) return null;
    try {
      await this.ensureRecipes();
      // 1) project_environment.url host 匹配（项目级环境表——大合规平台测试环境在此）
      const pe = await this.exploreSvc.pg.query(
        `SELECT r.id, r.short_id, r.project_id, r.name, r.start_url, r.steps
         FROM login_recipe r
         WHERE r.project_id = (
           SELECT pe.project_id FROM project_environment pe
           WHERE pe.url <> '' AND (
             position(lower($1) in lower(pe.url)) > 0 OR position(lower(pe.url) in lower($1)) > 0
           )
           ORDER BY (lower(pe.url) = lower($1)) DESC, pe.id
           LIMIT 1
         )
         ORDER BY r.updated_at DESC LIMIT 1`,
        [host],
      );
      if (pe.rows.length > 0) return this.mapRow(pe.rows[0]);
      // 2) qa_point.source->>sourceUrl host 匹配（QA 点直接记录了来源站点）
      const qa = await this.exploreSvc.pg.query(
        `SELECT r.id, r.short_id, r.project_id, r.name, r.start_url, r.steps
         FROM login_recipe r
         WHERE r.project_id = (
           SELECT a.project_id FROM qa_point qp JOIN application a ON a.id = qp.application_id
           WHERE qp.source->>'sourceUrl' ~ $1
           ORDER BY (qp.source->>'sourceUrl' = $1) DESC, qp.id
           LIMIT 1
         )
         ORDER BY r.updated_at DESC LIMIT 1`,
        [host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')],
      );
      if (qa.rows.length > 0) return this.mapRow(qa.rows[0]);
    } catch {
      // 表不存在/连接失败 → 走兜底
    }
    return null;
  }

  /** 指定项目 ID 直接取配方（空白新建等无 sourceUrl 场景） */
  async resolveByProject(projectId: number): Promise<LoginRecipe | null> {
    try {
      await this.ensureRecipes();
      const r = await this.exploreSvc.pg.query(
        `SELECT r.id, r.short_id, r.project_id, r.name, r.start_url, r.steps
         FROM login_recipe r WHERE r.project_id = $1
         ORDER BY r.updated_at DESC LIMIT 1`,
        [projectId],
      );
      if (r.rows.length > 0) return this.mapRow(r.rows[0]);
    } catch { /* 兜底 */ }
    return null;
  }

  /**
   * 渲染占位符。凭据解析链：角色+项目 → 项目内任意 → 全局角色 → 全局管理员（旧行为兜底）。
   * 拿不到凭据时占位符保留原文，编辑器里可手填（诚实暴露，不假填）。
   */
  async render(recipe: LoginRecipe | null, actor: string): Promise<RenderedLogin> {
    let username: string | undefined;
    let password: string | undefined;
    let note: string | undefined;
    try {
      await this.exploreSvc.ensureReady();
      const pid = recipe?.projectId;
      // 角色精确匹配（项目内优先，其次全局）
      const byRoleProj = pid
        ? await this.exploreSvc.pg.query(
            `SELECT payload_enc FROM credential WHERE role = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [actor, pid],
          )
        : { rows: [] as Record<string, unknown>[] };
      const byRole = byRoleProj.rows.length > 0
        ? byRoleProj
        : await this.exploreSvc.pg.query(
            `SELECT payload_enc FROM credential WHERE role = $1 ORDER BY created_at DESC LIMIT 1`,
            [actor],
          );
      // 项目内任意凭据（角色对不上时：单账号项目常见——如大合规平台只有普通用户）
      const byProject = byRole.rows.length === 0 && pid
        ? await this.exploreSvc.pg.query(
            `SELECT payload_enc FROM credential WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [pid],
          )
        : { rows: [] as Record<string, unknown>[] };
      // 全局管理员兜底（保持旧行为：demo 场景 admin/test123 由 DEMO 常量或库内凭据提供）
      const byAdmin = byRole.rows.length === 0 && byProject.rows.length === 0
        ? await this.exploreSvc.pg.query(
            `SELECT payload_enc FROM credential WHERE role = '管理员' ORDER BY created_at DESC LIMIT 1`,
          )
        : { rows: [] as Record<string, unknown>[] };
      const row = byRole.rows[0] ?? byProject.rows[0] ?? byAdmin.rows[0];
      if (row) {
        const vals = JSON.parse(this.crypto.decrypt(row.payload_enc as string)) as { username?: string; password?: string };
        username = vals.username;
        password = vals.password;
      }
      if (!username || !password) {
        note = `凭据库未找到角色「${actor}」可用的凭据（项目 ${pid ?? '未知'}），占位符已保留——请在编辑器手填或到凭据页添加`;
      }
    } catch (err) {
      note = '凭据库不可达：' + (err instanceof Error ? err.message : String(err));
    }
    const steps = (recipe?.steps ?? DEMO_LOGIN_STEPS).map((s) => this.renderStep(s, { username, password }));
    return {
      steps,
      startUrl: recipe?.startUrl ?? '',
      recipeShortId: recipe?.shortId ?? 'demo_fallback',
      credentialInjected: !!(username && password),
      note,
    };
  }

  private renderStep(s: StepDef, cred: { username?: string; password?: string }): StepDef {
    const out: StepDef = { ...s };
    if (s.actions) {
      out.actions = s.actions.map((a) => ({
        ...a,
        value: a.value === '{{username}}' && cred.username ? cred.username
          : a.value === '{{password}}' && cred.password ? cred.password
          : a.value,
      }));
    }
    if (s.instruction) {
      out.instruction = s.instruction
        .replace(/\{\{username\}\}/g, cred.username ?? '{{username}}')
        .replace(/\{\{password\}\}/g, cred.password ?? '{{password}}');
    }
    return out;
  }

  private mapRow(row: Record<string, unknown>): LoginRecipe {
    return {
      id: Number(row.id),
      shortId: String(row.short_id),
      projectId: Number(row.project_id),
      name: String(row.name),
      startUrl: String(row.start_url ?? ''),
      steps: (row.steps ?? []) as StepDef[],
    };
  }
}
