import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

// ---------- 类型 ----------

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  placeholder?: string;
}

export interface ApprovalRequest {
  id: string; // apr_xxx
  /** 门类：credential（凭据）；未来扩展 db.exec / vision 等工具 ask 级调用 */
  kind: string;
  title: string;
  reason: string;
  fields: FormField[];
  context: {
    url?: string;
    applicationId?: string;
    environmentId?: string;
    role?: string;
    runId?: string;
  };
  timeoutMs: number;
  createdAt: number;
}

export type ApprovalResolution =
  | { approved: true; values: Record<string, string> }
  | { approved: false; reason?: string };

export interface ApprovalEvents {
  requested: (req: ApprovalRequest) => void;
  resolved: (id: string, resolution: ApprovalResolution) => void;
}

/**
 * ApprovalManager（B3 核心）：WAITING_FOR_APPROVAL 门控。
 *
 * 用法（worker 侧）：
 *   const res = await approvals.request({ kind: 'credential', ... });
 *   if (res.approved) { 用 res.values 继续 }
 *
 * 用法（server/WS 侧）：
 *   approvals.on('requested', (req) => ws.emit('approval.requested', req));
 *   onClientSubmit((id, resolution) => approvals.submit(id, resolution));
 */
export class ApprovalManager extends EventEmitter {
  private pending = new Map<
    string,
    { req: ApprovalRequest; resolve: (r: ApprovalResolution) => void; timer: NodeJS.Timeout }
  >();

  request(req: Omit<ApprovalRequest, 'id' | 'createdAt'>): Promise<ApprovalResolution> {
    const id = `apr_${crypto.randomBytes(6).toString('hex')}`;
    const full: ApprovalRequest = { ...req, id, createdAt: Date.now() };

    return new Promise<ApprovalResolution>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          const timeout: ApprovalResolution = { approved: false, reason: 'timeout' };
          this.emit('resolved', id, timeout);
          resolve(timeout);
        }
      }, full.timeoutMs);

      this.pending.set(id, { req: full, resolve, timer });
      this.emit('requested', full);
    });
  }

  submit(id: string, resolution: ApprovalResolution): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(id);
    this.emit('resolved', id, resolution);
    p.resolve(resolution);
    return true;
  }

  listPending(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.req);
  }
}
