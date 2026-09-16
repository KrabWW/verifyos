import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ExploreService } from '../explore/explore.service';

const GITLAB_DEFAULT_API = 'https://gitlab.com/api/v4';

export interface GitlabChanges {
  diffText?: string;
  changedFiles: string[];
}

interface GitlabConfig {
  apiUrl: string;
  token: string;
  webhookToken: string;
}

/** 常数时间字符串比较（避免时序侧信道泄漏 token） */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * GitLab 连接器（T5）：webhook token 鉴权 + 真拉 diff + 真回写 MR 评论。
 * 凭证读取顺序：env（GITLAB_API_URL / GITLAB_TOKEN / GITLAB_WEBHOOK_TOKEN）
 * → 凭据库（role = gitlab，字段 token/privateToken、webhookToken、apiUrl/baseUrl）。
 * 回写失败只留痕不抛错（不阻塞 Run / webhook 链路）。
 */
@Injectable()
export class GitlabClient {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
  ) {}

  private async readConfig(): Promise<GitlabConfig> {
    const out: GitlabConfig = {
      apiUrl: (process.env.GITLAB_API_URL ?? '').trim(),
      token: (process.env.GITLAB_TOKEN ?? '').trim(),
      webhookToken: (process.env.GITLAB_WEBHOOK_TOKEN ?? '').trim(),
    };
    if (!out.token || !out.webhookToken || !out.apiUrl) {
      try {
        await this.exploreSvc.ensureReady();
        const r = await this.exploreSvc.pg.query(
          `SELECT payload_enc FROM credential WHERE role = 'gitlab' ORDER BY created_at DESC LIMIT 1`,
        );
        if (r.rows.length > 0) {
          const vals = JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc as string)) as Record<string, string>;
          if (!out.token) out.token = (vals.token ?? vals.privateToken ?? vals.private_token ?? '').trim();
          if (!out.webhookToken) out.webhookToken = (vals.webhookToken ?? vals.webhook_token ?? '').trim();
          if (!out.apiUrl) out.apiUrl = (vals.apiUrl ?? vals.api_url ?? vals.baseUrl ?? vals.base_url ?? '').trim();
        }
      } catch (err) {
        console.log('[gitlab] 凭据库读取失败（继续用 env 兜底）：', err instanceof Error ? err.message : err);
      }
    }
    if (!out.apiUrl) out.apiUrl = GITLAB_DEFAULT_API;
    return out;
  }

  /** webhook 鉴权：X-Gitlab-Token 与 GITLAB_WEBHOOK_TOKEN 比对；未配置 token 时降级放行（log 警告） */
  async verifyWebhook(token: string | null | undefined): Promise<{ ok: boolean; reason: string }> {
    const cfg = await this.readConfig();
    const expected = cfg.webhookToken;
    if (!expected) {
      console.log('[gitlab] 未配置 GITLAB_WEBHOOK_TOKEN，webhook 鉴权降级放行（建议配置以免端点裸奔）');
      return { ok: true, reason: 'token-not-configured' };
    }
    const got = (token ?? '').trim();
    if (!got || !safeEqual(got, expected)) {
      return { ok: false, reason: 'X-Gitlab-Token 缺失或不匹配' };
    }
    return { ok: true, reason: 'ok' };
  }

  /** 真拉 diff：GET /projects/:project_id/merge_requests/:iid/changes（PRIVATE-TOKEN） */
  async fetchChanges(projectId: number | string, iid: number | string): Promise<GitlabChanges | null> {
    const cfg = await this.readConfig();
    if (!cfg.token) {
      console.log('[gitlab] 未配置 GITLAB_TOKEN，跳过 API 拉取 diff（降级 body 自带）');
      return null;
    }
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(iid))}/changes`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'PRIVATE-TOKEN': cfg.token },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      console.error('[gitlab] changes 请求异常：', err instanceof Error ? err.message : err);
      return null;
    }
    if (!res.ok) {
      console.error(`[gitlab] changes API 返回 HTTP ${res.status}：`, (await res.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const json = (await res.json().catch(() => null)) as { changes?: Array<{ new_path?: string; diff?: string }> } | null;
    const changes = Array.isArray(json?.changes) ? json.changes : [];
    const changedFiles = changes.map((c) => c.new_path).filter((x): x is string => typeof x === 'string' && x.length > 0);
    const diffText = changes.map((c) => c.diff).filter((x): x is string => typeof x === 'string' && x.length > 0).join('\n');
    return { diffText: diffText || undefined, changedFiles };
  }

  /** 真回写评论：POST /projects/:project_id/merge_requests/:iid/notes；失败只留痕不抛错 */
  async postComment(projectId: number | string, iid: number | string, body: string): Promise<{ ok: boolean; id?: string }> {
    const cfg = await this.readConfig();
    if (!cfg.token) {
      console.log('[gitlab] 未配置 GITLAB_TOKEN，跳过 MR 评论回写');
      return { ok: false };
    }
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(String(projectId))}/merge_requests/${encodeURIComponent(String(iid))}/notes`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'PRIVATE-TOKEN': cfg.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.error(`[gitlab] 评论回写失败 HTTP ${res.status}：`, (await res.text().catch(() => '')).slice(0, 300));
        return { ok: false };
      }
      const json = (await res.json().catch(() => null)) as { id?: number } | null;
      console.log(`[gitlab] MR 评论回写成功：note id=${json?.id ?? '?'}`);
      return { ok: true, id: json?.id != null ? String(json.id) : undefined };
    } catch (err) {
      console.error('[gitlab] 评论回写异常（不阻塞）：', err instanceof Error ? err.message : err);
      return { ok: false };
    }
  }
}
