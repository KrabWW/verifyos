import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ExploreService } from '../explore/explore.service';

export type DefectSystem = 'zentao' | 'jira';

export interface DefectCreateInput {
  title: string;
  severity?: string | null;
  /** issue.source jsonb（用于拼复现步骤/描述） */
  source?: Record<string, unknown>;
}

/**
 * 缺陷系统连接器（T4）：禅道 API 2.0（token）+ Jira REST（Basic Auth）。
 * 凭证读取顺序：env（ZENTAO_URL/ZENTAO_TOKEN、JIRA_URL/JIRA_TOKEN/JIRA_EMAIL）
 * → 凭据库（role = 禅道 / jira）。缺凭证抛诚实错误，不再假装生成随机 ID。
 */
@Injectable()
export class DefectTracker {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
  ) {}

  /** 读取某系统配置：env 优先，凭据库兜底 */
  private async readConfig(system: DefectSystem): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const envMap: Record<string, string> = system === 'zentao'
      ? { url: 'ZENTAO_URL', token: 'ZENTAO_TOKEN', extra: 'ZENTAO_PRODUCT_ID' }
      : { url: 'JIRA_URL', token: 'JIRA_TOKEN', email: 'JIRA_EMAIL', extra: 'JIRA_PROJECT_KEY' };
    for (const [k, envName] of Object.entries(envMap)) {
      const v = process.env[envName]?.trim();
      if (v) out[k] = v;
    }
    // env 缺 url/token 时，用凭据库兜底
    if (!out.url || !out.token) {
      try {
        await this.exploreSvc.ensureReady();
        const role = system === 'zentao' ? '禅道' : 'jira';
        const r = await this.exploreSvc.pg.query(
          `SELECT payload_enc FROM credential WHERE role = $1 ORDER BY created_at DESC LIMIT 1`,
          [role],
        );
        if (r.rows.length > 0) {
          const vals = JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc as string)) as Record<string, string>;
          if (!out.url) out.url = (vals.url ?? vals.baseUrl ?? vals.base_url ?? '').trim();
          if (!out.token) out.token = (vals.token ?? '').trim();
          if (system === 'jira' && !out.email) out.email = (vals.email ?? vals.username ?? '').trim();
          if (!out.extra) out.extra = (system === 'zentao' ? (vals.productId ?? vals.product ?? '') : (vals.projectKey ?? vals.project ?? '')).trim();
        }
      } catch (err) {
        console.log('[defect] 凭据库读取失败（继续用 env 兜底）：', err instanceof Error ? err.message : err);
      }
    }
    return out;
  }

  /** 复现步骤/描述：从 issue.source 拼可读文本 */
  private buildDescription(input: DefectCreateInput): string {
    const parts: string[] = ['由 VerifyOS 自动创建。'];
    if (input.source && Object.keys(input.source).length > 0) {
      const detail = Object.entries(input.source)
        .map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');
      parts.push(`来源上下文：\n${detail}`);
    }
    return parts.join('\n\n');
  }

  /** 禅道 severity 映射：high→1 / medium→2 / low→3 */
  private zentaoSeverity(sev?: string | null): number {
    if (sev === 'high') return 1;
    if (sev === 'low') return 3;
    return 2;
  }

  async create(system: DefectSystem, input: DefectCreateInput): Promise<{ id: string }> {
    const cfg = await this.readConfig(system);
    const url = (cfg.url ?? '').trim();
    const token = (cfg.token ?? '').trim();
    if (!url || !token) {
      const hint = system === 'zentao'
        ? '未配置禅道凭据（需 ZENTAO_URL + ZENTAO_TOKEN，或凭据库 role=禅道）'
        : '未配置 Jira 凭据（需 JIRA_URL + JIRA_TOKEN + JIRA_EMAIL，或凭据库 role=jira）';
      throw new HttpException({ ok: false, reason: hint }, HttpStatus.BAD_GATEWAY);
    }

    let endpoint: string;
    let headers: Record<string, string>;
    let body: unknown;
    if (system === 'zentao') {
      endpoint = `${url.replace(/\/+$/, '')}/api.php/v1/bugs`;
      headers = { 'Content-Type': 'application/json', Token: token };
      const payload: Record<string, unknown> = {
        title: input.title,
        steps: this.buildDescription(input),
        severity: this.zentaoSeverity(input.severity),
      };
      if (cfg.extra) payload.product = Number(cfg.extra); // 禅道必填 product id
      body = payload;
    } else {
      endpoint = `${url.replace(/\/+$/, '')}/rest/api/2/issue`;
      const email = cfg.email ?? '';
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
      };
      const fields: Record<string, unknown> = {
        summary: input.title,
        description: this.buildDescription(input),
        issuetype: { name: 'Bug' },
      };
      if (cfg.extra) fields.project = { key: cfg.extra }; // Jira 必填 project key
      body = { fields };
    }

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[defect] ${system} 请求异常：`, msg);
      throw new HttpException({ ok: false, reason: `${system} 请求失败：${msg}` }, HttpStatus.BAD_GATEWAY);
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      console.error(`[defect] ${system} API 返回 HTTP ${res.status}：`, text);
      throw new HttpException({ ok: false, reason: `${system} API 返回 HTTP ${res.status}` }, HttpStatus.BAD_GATEWAY);
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const id = this.extractId(system, json);
    if (!id) {
      console.error(`[defect] ${system} 未返回缺陷 ID：`, JSON.stringify(json));
      throw new HttpException({ ok: false, reason: `${system} 未返回缺陷 ID` }, HttpStatus.BAD_GATEWAY);
    }
    console.log(`[defect] ${system} 建缺陷成功：${id}`);
    return { id };
  }

  /** 从响应提取真实缺陷 ID：禅道 {bug:{id}}/{id}；Jira {key}/{id} */
  private extractId(system: DefectSystem, json: Record<string, unknown> | null): string | null {
    if (!json) return null;
    if (system === 'zentao') {
      const bug = json.bug as Record<string, unknown> | undefined;
      const raw = (bug?.id ?? json.id) as unknown;
      return raw != null ? String(raw) : null;
    }
    const raw = (json.key ?? json.id) as unknown;
    return raw != null ? String(raw) : null;
  }
}
