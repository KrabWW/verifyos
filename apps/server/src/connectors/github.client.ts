import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ExploreService } from '../explore/explore.service';

const GITHUB_DEFAULT_API = 'https://api.github.com';

export interface GithubFiles {
  diffText?: string;
  changedFiles: string[];
}

interface GithubConfig {
  apiUrl: string;
  token: string;
  webhookSecret: string;
}

/** 常数时间字符串比较（避免时序侧信道泄漏 secret） */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * GitHub 连接器（T5）：X-Hub-Signature-256 HMAC 鉴权 + 真拉 changed files + 真回写 issue comment。
 * 凭证读取顺序：env（GITHUB_API_URL / GITHUB_TOKEN / GITHUB_WEBHOOK_SECRET）
 * → 凭据库（role = github，字段 token、webhookSecret/secret、apiUrl/baseUrl）。
 * 回写失败只留痕不抛错（不阻塞 Run / webhook 链路）。
 */
@Injectable()
export class GithubClient {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
  ) {}

  private async readConfig(): Promise<GithubConfig> {
    const out: GithubConfig = {
      apiUrl: (process.env.GITHUB_API_URL ?? '').trim(),
      token: (process.env.GITHUB_TOKEN ?? '').trim(),
      webhookSecret: (process.env.GITHUB_WEBHOOK_SECRET ?? '').trim(),
    };
    if (!out.token || !out.webhookSecret || !out.apiUrl) {
      try {
        await this.exploreSvc.ensureReady();
        const r = await this.exploreSvc.pg.query(
          `SELECT payload_enc FROM credential WHERE role = 'github' ORDER BY created_at DESC LIMIT 1`,
        );
        if (r.rows.length > 0) {
          const vals = JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc as string)) as Record<string, string>;
          if (!out.token) out.token = (vals.token ?? '').trim();
          if (!out.webhookSecret) out.webhookSecret = (vals.webhookSecret ?? vals.webhook_secret ?? vals.secret ?? '').trim();
          if (!out.apiUrl) out.apiUrl = (vals.apiUrl ?? vals.api_url ?? vals.baseUrl ?? vals.base_url ?? '').trim();
        }
      } catch (err) {
        console.log('[github] 凭据库读取失败（继续用 env 兜底）：', err instanceof Error ? err.message : err);
      }
    }
    if (!out.apiUrl) out.apiUrl = GITHUB_DEFAULT_API;
    return out;
  }

  /** webhook 鉴权：X-Hub-Signature-256 = sha256 HMAC(secret, rawBody)；未配置 secret 时降级放行（log 警告） */
  async verifySignature(rawBody: string, signature: string | null | undefined): Promise<{ ok: boolean; reason: string }> {
    const cfg = await this.readConfig();
    const secret = cfg.webhookSecret;
    if (!secret) {
      console.log('[github] 未配置 GITHUB_WEBHOOK_SECRET，webhook 签名校验降级放行（建议配置以免端点裸奔）');
      return { ok: true, reason: 'secret-not-configured' };
    }
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
    const got = (signature ?? '').trim();
    if (!got || !safeEqual(got, expected)) {
      return { ok: false, reason: 'X-Hub-Signature-256 缺失或不匹配' };
    }
    return { ok: true, reason: 'ok' };
  }

  /** 真拉 changed files：GET /repos/:owner/:repo/pulls/:number/files（Authorization: Bearer） */
  async fetchChangedFiles(owner: string, repo: string, number: number | string): Promise<GithubFiles | null> {
    const cfg = await this.readConfig();
    if (!cfg.token) {
      console.log('[github] 未配置 GITHUB_TOKEN，跳过 API 拉取 files（降级空变更集）');
      return null;
    }
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(number))}/files`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      console.error('[github] files 请求异常：', err instanceof Error ? err.message : err);
      return null;
    }
    if (!res.ok) {
      console.error(`[github] files API 返回 HTTP ${res.status}：`, (await res.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const json = (await res.json().catch(() => null)) as Array<{ filename?: string; patch?: string }> | null;
    const files = Array.isArray(json) ? json : [];
    const changedFiles = files.map((f) => f.filename).filter((x): x is string => typeof x === 'string' && x.length > 0);
    const diffText = files.map((f) => f.patch).filter((x): x is string => typeof x === 'string' && x.length > 0).join('\n');
    return { diffText: diffText || undefined, changedFiles };
  }

  /** 真回写评论：POST /repos/:owner/:repo/issues/:number/comments（PR 评论走 issue comment）；失败只留痕不抛错 */
  async postComment(owner: string, repo: string, number: number | string, body: string): Promise<{ ok: boolean; id?: string }> {
    const cfg = await this.readConfig();
    if (!cfg.token) {
      console.log('[github] 未配置 GITHUB_TOKEN，跳过 PR 评论回写');
      return { ok: false };
    }
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(String(number))}/comments`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.error(`[github] 评论回写失败 HTTP ${res.status}：`, (await res.text().catch(() => '')).slice(0, 300));
        return { ok: false };
      }
      const json = (await res.json().catch(() => null)) as { id?: number } | null;
      console.log(`[github] PR 评论回写成功：comment id=${json?.id ?? '?'}`);
      return { ok: true, id: json?.id != null ? String(json.id) : undefined };
    } catch (err) {
      console.error('[github] 评论回写异常（不阻塞）：', err instanceof Error ? err.message : err);
      return { ok: false };
    }
  }
}
