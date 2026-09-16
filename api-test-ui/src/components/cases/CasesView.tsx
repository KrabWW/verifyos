/**
 * CasesView — 用例视图（nav === 'cases'），与 API 树视图区分：展示用例列表。
 *
 * 顶部：来源筛选 tabs（全部/录制/AI 生成/edge-case）+ 搜索。
 * 用例卡片：名称 + 来源标签（录制绿/AI 紫/edge-case 黄）+ 断言数 + 最近执行 verdict + 审阅状态。
 * 筛选无结果时显示空态引导。
 */
import { useMemo, useState } from 'react';
import { Search, FlaskConical, Sparkles, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, methodTone } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** 用例来源（筛选维度） */
type CaseSource = 'recorded' | 'ai' | 'edge-case';

/** 单条用例（mock，字段语义与 types.ts TestCase 对齐） */
interface CaseItem {
  id: string;
  name: string;
  method: string;
  path: string;
  source: CaseSource;
  assertionCount: number;
  lastResult: 'pass' | 'fail' | 'pending';
  reviewStatus: 'pending' | 'approved';
}

/** mock 用例数据：2 录制 / 2 AI / 2 edge-case，verdict 各异 */
const MOCK_CASES: CaseItem[] = [
  { id: 'c-01', name: '查询用户详情-正常', method: 'GET', path: '/users/1001', source: 'recorded', assertionCount: 4, lastResult: 'pass', reviewStatus: 'approved' },
  { id: 'c-02', name: '创建订单-主流程', method: 'POST', path: '/orders', source: 'recorded', assertionCount: 6, lastResult: 'pass', reviewStatus: 'pending' },
  { id: 'c-03', name: '登录-正常凭证', method: 'POST', path: '/auth/login', source: 'ai', assertionCount: 5, lastResult: 'pass', reviewStatus: 'approved' },
  { id: 'c-04', name: '更新用户-字段缺失', method: 'PUT', path: '/users/:id', source: 'ai', assertionCount: 3, lastResult: 'fail', reviewStatus: 'pending' },
  { id: 'c-05', name: '删除用户-不存在 ID', method: 'DELETE', path: '/users/:id', source: 'edge-case', assertionCount: 2, lastResult: 'fail', reviewStatus: 'pending' },
  { id: 'c-06', name: '订单列表-超大分页', method: 'GET', path: '/orders?page=99999', source: 'edge-case', assertionCount: 3, lastResult: 'pending', reviewStatus: 'approved' },
];

/** 来源筛选 tabs */
const SOURCE_TABS = [
  { value: 'all', label: '全部' },
  { value: 'recorded', label: '录制' },
  { value: 'ai', label: 'AI 生成' },
  { value: 'edge-case', label: 'edge-case' },
] as const;
type SourceFilter = (typeof SOURCE_TABS)[number]['value'];

/** 来源 → 标签样式（录制绿 / AI 紫 / edge-case 黄） */
const SOURCE_CLS: Record<CaseSource, string> = {
  recorded: 'bg-green-500/15 text-green-500 border border-green-500/30',
  ai: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  'edge-case': 'bg-amber-400/15 text-amber-400 border border-amber-400/30',
};
const SOURCE_LABEL: Record<CaseSource, string> = { recorded: '录制', ai: 'AI 生成', 'edge-case': 'edge-case' };

/** 最近执行 verdict → 徽章 */
const RESULT_TONE = { pass: 'badge-pass', fail: 'badge-fail', pending: 'badge-pending' } as const;
const RESULT_LABEL = { pass: '通过', fail: '失败', pending: '待执行' } as const;

export function CasesView() {
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [query, setQuery] = useState('');

  /** 筛选 + 搜索 */
  const cases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_CASES.filter((c) => {
      if (filter !== 'all' && c.source !== filter) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部：来源筛选 tabs + 搜索 */}
      <div className="flex items-center border-b border-border px-4">
        <h2 className="mr-4 text-[13px] font-semibold text-fg-primary">用例</h2>
        <Tabs value={filter} onChange={(v) => setFilter(v as SourceFilter)} items={[...SOURCE_TABS]} className="border-b-0" />
        <div className="relative ml-auto py-1.5">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索用例名称 / 路径"
            className="h-7 w-[200px] pl-7 text-xs"
          />
        </div>
      </div>

      {/* 用例卡片列表 / 空态 */}
      {cases.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-3">
          {cases.map((c) => (
            <div
              key={c.id}
              className="card mb-2 flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:border-accent-line"
            >
              <Badge tone={methodTone(c.method)} className="shrink-0">{c.method}</Badge>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-fg-primary">{c.name}</div>
                <div className="truncate font-mono text-[11px] text-fg-muted">{c.path}</div>
              </div>
              <span className={cn('badge shrink-0', SOURCE_CLS[c.source])}>{SOURCE_LABEL[c.source]}</span>
              <span className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-fg-muted">
                <span>断言 {c.assertionCount}</span>
                <span className={cn('badge', RESULT_TONE[c.lastResult])}>{RESULT_LABEL[c.lastResult]}</span>
                <span className={cn(
                  'badge',
                  c.reviewStatus === 'approved'
                    ? 'bg-accent-dim text-accent border border-accent-line'
                    : 'bg-amber-400/15 text-amber-400 border border-amber-400/30',
                )}>
                  {c.reviewStatus === 'approved' ? '已审' : '待审'}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* 空态：引导从录制或 AI 生成用例 */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <FlaskConical size={32} className="text-fg-muted" />
          <div className="text-center">
            <div className="mb-1 text-[13px] font-semibold text-fg-primary">还没有匹配的用例</div>
            <div className="text-xs text-fg-secondary">从录制真实流量，或让 AI 依据 API 资产生成用例</div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline">
              <Sparkles size={12} />AI 生成用例
            </Button>
            <Button size="sm">开始录制</Button>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-fg-muted">
            <ShieldAlert size={11} />提示：edge-case 边界用例可由 AI 自动补全
          </div>
        </div>
      )}
    </div>
  );
}
