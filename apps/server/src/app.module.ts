import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { ApprovalManager, CredentialCrypto, ToolRegistry } from '@verifyos/agent-core';
import { RunsController } from './runs/runs.controller';
import { PluginsController } from './plugins/plugins.controller';
import { PluginsService } from './plugins/plugins.service';
import { PluginRuntimeController } from './plugins/plugin-runtime.controller';
import { PluginRuntime } from './plugins/plugin-runtime.service';
import { OverviewController } from './overview.controller';
import { WebhooksController } from './webhooks.controller';
import { ToolsController, createToolRegistry } from './tools.controller';
import { ExploreService } from './explore/explore.service';
import { ExploreController } from './explore/explore.controller';
import { ExploreControlController } from './explore/explore-control.controller';
import { GraphController } from './explore/graph.controller';
import { QaPointsController } from './explore/qa-points.controller';
import { VerificationsController } from './explore/verifications.controller';
import { BrowserStatesController } from './explore/browser-states.controller';
import { ImportsController } from './explore/imports.controller';
import { CredentialsController } from './explore/credentials.controller';
import { LoginRecipesService } from './explore/login-recipes.service';
import { ChatController } from './chat/chat.controller';
import { IssuesController } from './issues.controller';
import { MrsController } from './mrs.controller';
import { MobileController } from './mobile.controller';
import { HealthController } from './health.controller';
import { RunsGateway } from './runs/runs.gateway';
import { RunsService } from './runs/runs.service';
import { LlmService } from './llm/llm.service';
import { FeishuNotifier } from './connectors/feishu.notifier';
import { DefectTracker } from './connectors/defect-tracker';
import { FigmaReader } from './connectors/figma.reader';
import { GitlabClient } from './connectors/gitlab.client';
import { GithubClient } from './connectors/github.client';

@Module({
  controllers: [HealthController, RunsController, OverviewController, WebhooksController, ToolsController, ExploreController, ExploreControlController, GraphController, QaPointsController, VerificationsController, BrowserStatesController, ImportsController, CredentialsController, ChatController, IssuesController, MrsController, MobileController, PluginsController, PluginRuntimeController],
  providers: [
    RunsGateway,
    RunsService,
    LlmService,
    FeishuNotifier,
    DefectTracker,
    FigmaReader,
    GitlabClient,
    GithubClient,
    // B3：全局 ApprovalManager 单例（WS 门控桥与 worker 共用）
    { provide: ApprovalManager, useFactory: () => new ApprovalManager() },
    // B3：凭据加解密（CREDENTIAL_ENCRYPTION_KEY 必填）
    {
      provide: CredentialCrypto,
      useFactory: () => {
        const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
        if (!key) throw new Error('缺少 CREDENTIAL_ENCRYPTION_KEY（64 位 hex）');
        return new CredentialCrypto(key);
      },
    },
    {
      provide: Pool,
      useFactory: () => {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        // WSL PG 空闲关停会触发 57P01 'terminating connection due to administrator command'：
        // 未处理的池 'error' 事件会让整个 Node 进程退出——吞掉并记录，由调用方重试。
        pool.on('error', (err) => {
          console.error('[pg] pool idle client error (ignored):', err.message);
        });
        return pool;
      },
    },
    // F15：ToolRegistry 单例（E1 引擎接入运行时——权限门控 + 审计落库）
    {
      provide: ToolRegistry,
      inject: [ApprovalManager, Pool],
      useFactory: createToolRegistry,
    },
    ExploreService,
    LoginRecipesService,
    PluginsService,
    PluginRuntime,
  ],
})
export class AppModule {}
