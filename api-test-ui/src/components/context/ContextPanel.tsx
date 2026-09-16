/**
 * ContextPanel — 右栏上下文面板（替换「详情面板」占位）。
 *
 * 三种状态：
 * 1) 左栏选中某个 API → 显示该 API 的详情摘要（method/path/auth/断言数/覆盖率）
 * 2) 场景模式（nav === 'scenario'）→ 显示场景摘要（步骤数/pass/fail/skip + 最近执行时间）
 * 3) 未选中任何 API → 显示快捷入口（新建请求 / 导入 OpenAPI / 打开 AI 助手）
 */
import { Plus, FileUp, Sparkles, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, methodTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NavKey } from '@/components/layout/Sidenav';
import type { ApiDefinition } from '@/components/api-tree/types';

/** 覆盖状态 → 展示文案 */
const STATUS_LABEL: Record<ApiDefinition['status'], { text: string; cls: string }> = {
  full: { text: '全覆盖', cls: 'bg-green-500/15 text-green-500 border border-green-500/30' },
  partial: { text: '部分覆盖', cls: 'bg-amber-400/15 text-amber-400 border border-amber-400/30' },
  none: { text: '未测试', cls: 'bg-red-500/15 text-red-500 border border-red-500/30' },
};

export interface ContextPanelProps {
  /** 当前导航（判断场景模式） */
  nav: NavKey;
  /** 左栏当前选中的 API（未选中为 null） */
  selectedApi: ApiDefinition | null;
  /** 快捷入口回调 */
  onNewRequest: () => void;
  onImportOpenAPI: () => void;
  onOpenAi: () => void;
}

/** 摘要行（key-value 小行） */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="shrink-0 text-[11px] text-fg-muted">{label}</span>
      <span className="truncate text-[11.5px] text-fg-secondary">{children}</span>
    </div>
  );
}

export function ContextPanel({ nav, selectedApi, onNewRequest, onImportOpenAPI, onOpenAi }: ContextPanelProps) {
  /* 场景模式：场景摘要（mock 数据，与 ScenarioTree 演示场景对齐） */
  if (nav === 'scenario') {
    return (
      <div className="flex h-full flex-col overflow-y-auto p-3">
        <div className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-fg-primary">
          <Workflow size={13} className="text-accent" />场景摘要
        </div>
        <div className="card mb-3 p-3">
          <div className="mb-2 text-[13px] font-medium text-fg-primary">下单主流程</div>
          <div className="divide-y divide-border/60">
            <Row label="步骤数">4</Row>
            <Row label="通过"><span className="text-green-500">3</span></Row>
            <Row label="失败"><span className="text-red-500">1</span></Row>
            <Row label="跳过">0</Row>
            <Row label="最近执行">2026-09-08 10:24</Row>
          </div>
        </div>
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-[11px] text-amber-400">
          步骤 3「查询订单详情」上次失败：期望 401 实际 500
        </div>
      </div>
    );
  }

  /* 选中 API：详情摘要 */
  if (selectedApi) {
    const status = STATUS_LABEL[selectedApi.status];
    return (
      <div className="flex h-full flex-col overflow-y-auto p-3">
        <div className="mb-3 text-[12px] font-semibold text-fg-primary">API 详情</div>
        <div className="card p-3">
          {/* method + path */}
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={methodTone(selectedApi.method)}>{selectedApi.method}</Badge>
          </div>
          <div className="mb-3 break-all font-mono text-[11.5px] text-fg-primary">{selectedApi.path}</div>
          <div className="divide-y divide-border/60">
            <Row label="名称">{selectedApi.name}</Row>
            <Row label="认证">{selectedApi.groupId === 'auth' ? '无需认证' : 'Bearer Token'}</Row>
            <Row label="断言数">{selectedApi.method === 'GET' ? 1 : 2}</Row>
            <Row label="覆盖率">
              <span className={cn('badge', status.cls)}>{status.text}</span>
            </Row>
          </div>
        </div>
        {selectedApi.description && (
          <div className="mt-3 rounded-md bg-bg-tertiary px-2.5 py-2 text-[11px] text-fg-secondary">
            {selectedApi.description}
          </div>
        )}
      </div>
    );
  }

  /* 未选中：快捷入口 */
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-3 text-[12px] font-semibold text-fg-primary">快捷入口</div>
      <div className="space-y-2">
        <Button variant="outline" size="md" className="w-full justify-start" onClick={onNewRequest}>
          <Plus size={14} />新建请求
        </Button>
        <Button variant="outline" size="md" className="w-full justify-start" onClick={onImportOpenAPI}>
          <FileUp size={14} />导入 OpenAPI
        </Button>
        <Button variant="outline" size="md" className="w-full justify-start" onClick={onOpenAi}>
          <Sparkles size={14} />打开 AI 助手
        </Button>
      </div>
      <div className="mt-4 text-[11px] leading-relaxed text-fg-muted">
        在左侧资产树选择一个 API 查看详情摘要，或切到「场景」查看场景执行概况。
      </div>
    </div>
  );
}
