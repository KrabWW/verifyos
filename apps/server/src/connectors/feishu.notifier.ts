import { Injectable } from '@nestjs/common';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ExploreService } from '../explore/explore.service';

export interface FeishuNotifyInput {
  /** 判定：pass / fail / unknown */
  verdict: string;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 失败摘要（失败时才有） */
  failureSummary?: string | null;
  /** 项目名 */
  projectName: string;
  /** run 短 id */
  runId: string;
  /** 证据链接（相对或绝对 URL；绝对优先） */
  evidenceUrl: string;
}

/**
 * 飞书推送（T3）：Run 完成/失败后向自定义机器人 Webhook 推送一条测试结果通知。
 * 事件驱动单向通知，异步触发，推送失败只留痕不阻塞主流程。
 * webhook URL 读取顺序：env FEISHU_WEBHOOK_URL → 凭据库（role = 飞书机器人，字段 webhookUrl/webhook/url）。
 * 未配置时静默跳过（log 提示），不抛错。
 */
@Injectable()
export class FeishuNotifier {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
  ) {}

  /** 解析 webhook URL：env 优先，凭据库兜底；都无则返回 null */
  private async resolveWebhookUrl(): Promise<string | null> {
    const env = process.env.FEISHU_WEBHOOK_URL?.trim();
    if (env) return env;
    try {
      await this.exploreSvc.ensureReady();
      const r = await this.exploreSvc.pg.query(
        `SELECT payload_enc FROM credential WHERE role = '飞书机器人' ORDER BY created_at DESC LIMIT 1`,
      );
      if (r.rows.length > 0) {
        const vals = JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc as string)) as Record<string, string>;
        const url = vals.webhookUrl ?? vals.webhook ?? vals.url;
        if (url?.trim()) return url.trim();
      }
    } catch (err) {
      console.log('[feishu] 凭据库读取失败（继续用 env 兜底）：', err instanceof Error ? err.message : err);
    }
    return null;
  }

  async notify(input: FeishuNotifyInput): Promise<void> {
    const url = await this.resolveWebhookUrl();
    if (!url) {
      console.log('[feishu] 未配置 FEISHU_WEBHOOK_URL / 飞书机器人凭据，跳过推送');
      return;
    }
    const verdictLabel = input.verdict === 'pass' ? 'PASS' : input.verdict === 'fail' ? 'FAIL' : 'UNKNOWN';
    const lines = [
      '【VerifyOS 测试通知】',
      `项目：${input.projectName}`,
      `判定：${verdictLabel}`,
      `耗时：${(input.durationMs / 1000).toFixed(1)}s`,
      `Run：${input.runId}`,
    ];
    if (input.failureSummary) lines.push(`失败摘要：${input.failureSummary}`);
    lines.push(`证据链接：${input.evidenceUrl}`);
    const payload = { msg_type: 'text', content: { text: lines.join('\n') } };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.error(`[feishu] 推送失败 HTTP ${res.status}：`, (await res.text().catch(() => '')).slice(0, 200));
        return;
      }
      // 飞书机器人成功返回 { code: 0 } / { StatusCode: 0 }
      const json = (await res.json().catch(() => null)) as { code?: number; StatusCode?: number; msg?: string } | null;
      const code = json?.code ?? json?.StatusCode;
      if (code !== undefined && code !== 0) {
        console.error('[feishu] 推送返回错误：', JSON.stringify(json));
        return;
      }
      console.log('[feishu] 推送成功');
    } catch (err) {
      console.error('[feishu] 推送异常（不阻塞 Run）：', err instanceof Error ? err.message : err);
    }
  }
}
