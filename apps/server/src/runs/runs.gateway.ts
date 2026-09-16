import { OnModuleInit } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RunEvent, ev } from '@verifyos/shared';
import { ApprovalManager, type ApprovalResolution } from '@verifyos/agent-core';
import { RunsService } from './runs.service';
import { ExploreService } from '../explore/explore.service';

/**
 * Run 事件流 + Approval 门控 Gateway。
 * - run.watch：订阅 runId 后推送事件流（C4 接 Orchestrator 真实 Run，当前演示流验证协议端到端）
 * - approval.*：B3 凭据动态表单——worker 侧 approvals.request() 触发 'requested'，
 *   这里广播 'approval.requested' 给所有客户端弹卡；客户端 'approval.submit' 回传后 resolve 门控。
 */
@WebSocketGateway({ cors: true, path: '/ws' })
export class RunsGateway implements OnModuleInit {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly approvals: ApprovalManager,
    private readonly runs: RunsService,
    private readonly explore: ExploreService,
  ) {}

  onModuleInit() {
    // worker 发起门控 → 广播弹卡（MVP 广播全员；后续按 runId/projectId 房间隔离）
    this.approvals.on('requested', (req: { id: string }) => {
      this.server.emit('approval.requested', req);
    });
    this.approvals.on('resolved', (id: string, resolution: ApprovalResolution) => {
      this.server.emit('approval.resolved', { id, approved: resolution.approved });
    });
    // C1：真实 Run 事件流 + 完成摘要广播
    this.runs.on('run.event', (e: RunEvent) => {
      this.server.emit('run.event', e);
    });
    this.runs.on('run.done', (summary: Record<string, unknown>) => {
      this.server.emit('run.done', summary);
    });
    this.explore.on('explore.event', (e: unknown) => {
      this.server.emit('explore.event', e);
    });
  }

  @SubscribeMessage('approval.submit')
  submit(@MessageBody() body: { id: string; approved: boolean; values?: Record<string, string> }) {
    const ok = this.approvals.submit(
      body.id,
      body.approved
        ? { approved: true, values: body.values ?? {} }
        : { approved: false, reason: 'rejected_by_user' },
    );
    return { ok };
  }

  @SubscribeMessage('approval.pending')
  pending() {
    return { items: this.approvals.listPending() };
  }

  @SubscribeMessage('run.watch')
  watch(@MessageBody() body: { runId?: string }, @ConnectedSocket() client: Socket) {
    const runId = body?.runId || 'run_demo';
    const target = {
      applicationShortId: 'app_demo',
      platform: 'web' as const,
      environment: { url: 'https://crm.test.example.com', isPreview: false },
    };
    const demo: RunEvent[] = [
      ev.runStarted(runId, target),
      ev.stepStarted(runId, 'st_01', 0, '管理员登录', 'module'),
      ev.thinking(runId, 'st_01', '复用浏览器状态 admin_logged_in，免重复登录'),
      ev.action(runId, 'st_01', 'browser', 'navigate', { url: '/employees' }),
      ev.observation(runId, 'st_01', true, '员工列表页加载完成', 412),
      ev.stepCompleted(runId, 'st_01', 'pass', true),
      ev.runCompleted(runId, 'pass'),
    ];
    demo.forEach((e, i) => setTimeout(() => client.emit('run.event', e), i * 300));
    return { ok: true, runId };
  }
}
