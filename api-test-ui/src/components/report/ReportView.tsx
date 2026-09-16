/**
 * ReportView — 执行报告视图（nav === 'report'）。
 *
 * 顶部时间范围筛选 + 报告列表（点击展开详情）+ 底部汇总统计。
 * 当前为 mock 数据阶段：5 条报告（3 pass / 1 fail / 1 unknown）。
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Zap, FileText, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, methodTone } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';

/** 报告 verdict */
type Verdict = 'pass' | 'fail' | 'unknown';

/** 单条执行报告（mock 结构，字段与后续后端 ScenarioReport 对齐） */
interface ReportItem {
  id: string;
  /** 触发来源：场景名或单接口名 */
  target: string;
  /** 目标 URL */
  url: string;
  method: string;
  verdict: Verdict;
  /** 耗时（秒） */
  durationSec: number;
  /** LLM 调用次数 */
  llmCalls: number;
  /** 时间戳 */
  at: string;
  /** 证据数量（截图/响应体等） */
  evidences: number;
  /** 步骤结果（verdict/说明） */
  steps: { name: string; ok: boolean; note: string }[];
  /** 触达校验结果 */
  reachChecks: { label: string; ok: boolean }[];
}

/** mock 报告数据：3 pass / 1 fail / 1 unknown */
const MOCK_REPORTS: ReportItem[] = [
  {
    id: 'r-01', target: '下单主流程', url: 'https://api.example.com/orders', method: 'POST',
    verdict: 'pass', durationSec: 4.2, llmCalls: 6, at: '2026-09-08 10:24', evidences: 5,
    steps: [
      { name: '登录获取 token', ok: true, note: '200 · 提取 access_token' },
      { name: '创建订单', ok: true, note: '201 · 断言 order.id 存在' },
      { name: '查询订单详情', ok: true, note: '200 · 状态与金额一致' },
    ],
    reachChecks: [
      { label: '目标域名可达', ok: true },
      { label: '核心字段触达（order.id）', ok: true },
      { label: '无静默降级响应', ok: true },
    ],
  },
  {
    id: 'r-02', target: '用户详情读取', url: 'https://api.example.com/users/1001', method: 'GET',
    verdict: 'pass', durationSec: 1.8, llmCalls: 2, at: '2026-09-08 09:51', evidences: 3,
    steps: [
      { name: '查询用户详情', ok: true, note: '200 · schema 校验通过' },
    ],
    reachChecks: [
      { label: '目标域名可达', ok: true },
      { label: '核心字段触达（user.name）', ok: true },
    ],
  },
  {
    id: 'r-03', target: '登录接口冒烟', url: 'https://api.example.com/auth/login', method: 'POST',
    verdict: 'fail', durationSec: 3.1, llmCalls: 4, at: '2026-09-07 18:02', evidences: 4,
    steps: [
      { name: '正常登录', ok: true, note: '200 · 返回 token' },
      { name: '错误密码登录', ok: false, note: '期望 401 实际 500 · 断言失败' },
    ],
    reachChecks: [
      { label: '目标域名可达', ok: true },
      { label: '错误分支响应体触达', ok: false },
    ],
  },
  {
    id: 'r-04', target: '订单列表分页', url: 'https://api.example.com/orders?page=2', method: 'GET',
    verdict: 'pass', durationSec: 2.4, llmCalls: 3, at: '2026-09-06 14:37', evidences: 2,
    steps: [
      { name: '第二页查询', ok: true, note: '200 · items 长度 20' },
    ],
    reachChecks: [
      { label: '目标域名可达', ok: true },
      { label: '分页字段触达（page/total）', ok: true },
    ],
  },
  {
    id: 'r-05', target: '删除用户（危险操作演练）', url: 'https://api.example.com/users/:id', method: 'DELETE',
    verdict: 'unknown', durationSec: 6.5, llmCalls: 9, at: '2026-09-05 11:19', evidences: 6,
    steps: [
      { name: '创建临时用户', ok: true, note: '201' },
      { name: '删除临时用户', ok: true, note: '204' },
      { name: '复核删除结果', ok: false, note: '复核请求超时，无法判定' },
    ],
    reachChecks: [
      { label: '目标域名可达', ok: true },
      { label: '删除后状态复核', ok: false },
    ],
  },
];

/** 时间范围筛选定义 */
const RANGE_ITEMS = [
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
  { value: 'all', label: '全部' },
] as const;
type RangeKey = (typeof RANGE_ITEMS)[number]['value'];

/** verdict → 徽章样式（pass 绿 / fail 红 / unknown 黄） */
const VERDICT_CLS: Record<Verdict, string> = {
  pass: 'badge-pass',
  fail: 'badge-fail',
  unknown: 'bg-amber-400/15 text-amber-400 border border-amber-400/30',
};
const VERDICT_LABEL: Record<Verdict, string> = { pass: '通过', fail: '失败', unknown: '未判定' };

export function ReportView() {
  const [range, setRange] = useState<RangeKey>('7d');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** 按时间范围过滤（mock 时间基准：2026-09-08） */
  const reports = useMemo(() => {
    if (range === 'all') return MOCK_REPORTS;
    const cutoff = range === '7d' ? 7 : 30;
    // mock 时间戳均为 9/5 - 9/8，7 天与 30 天结果一致，仅演示筛选交互
    return MOCK_REPORTS.filter(() => cutoff >= 7);
  }, [range]);

  /** 汇总统计 */
  const total = reports.length;
  const passCount = reports.filter((r) => r.verdict === 'pass').length;
  const passRate = total === 0 ? 0 : Math.round((passCount / total) * 100);
  const avgDuration = total === 0 ? 0 : (reports.reduce((s, r) => s + r.durationSec, 0) / total).toFixed(1);
  const llmTotal = reports.reduce((s, r) => s + r.llmCalls, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部：标题 + 时间范围筛选 */}
      <div className="flex items-center gap-4 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-fg-primary">执行报告</h2>
        <Tabs value={range} onChange={(v) => setRange(v as RangeKey)} items={[...RANGE_ITEMS]} className="border-b-0" />
      </div>

      {/* 报告列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        {reports.map((r) => {
          const expanded = expandedId === r.id;
          return (
            <div key={r.id} className="card mb-2 overflow-hidden !p-0">
              {/* 列表条目（点击展开/收起） */}
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : r.id)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-bg-tertiary/50"
              >
                {expanded
                  ? <ChevronDown size={14} className="shrink-0 text-fg-muted" />
                  : <ChevronRight size={14} className="shrink-0 text-fg-muted" />}
                <Badge tone={methodTone(r.method)} className="shrink-0">{r.method}</Badge>
                <span className={cn('badge shrink-0', VERDICT_CLS[r.verdict])}>{VERDICT_LABEL[r.verdict]}</span>
                <span className="truncate font-mono text-xs text-fg-primary">{r.url}</span>
                <span className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-fg-muted">
                  <span className="flex items-center gap-1"><Clock size={11} />{r.durationSec}s</span>
                  <span className="flex items-center gap-1"><Zap size={11} />LLM {r.llmCalls}</span>
                  <span className="flex items-center gap-1"><FileText size={11} />证据 {r.evidences}</span>
                  <span className="w-[110px] text-right">{r.at}</span>
                </span>
              </button>

              {/* 展开详情：verdict / 步骤结果 / 触达校验 / 证据清单 */}
              {expanded && (
                <div className="border-t border-border bg-bg-secondary/60 px-4 py-3 text-xs">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-fg-muted">结论：</span>
                    <span className={cn('badge', VERDICT_CLS[r.verdict])}>{VERDICT_LABEL[r.verdict]}</span>
                    <span className="text-fg-secondary">场景「{r.target}」 · {r.steps.length} 个步骤 · 证据 {r.evidences} 份</span>
                  </div>

                  <div className="mb-1 flex items-center gap-1.5 font-medium text-fg-primary">
                    <ShieldCheck size={13} className="text-accent" />步骤结果
                  </div>
                  <div className="mb-3 space-y-1 pl-5">
                    {r.steps.map((s) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className={s.ok ? 'text-green-500' : 'text-red-500'}>{s.ok ? '✓' : '✗'}</span>
                        <span className="text-fg-primary">{s.name}</span>
                        <span className="text-fg-muted">{s.note}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mb-1 flex items-center gap-1.5 font-medium text-fg-primary">
                    <ShieldCheck size={13} className="text-accent" />触达校验
                  </div>
                  <div className="mb-3 space-y-1 pl-5">
                    {r.reachChecks.map((c) => (
                      <div key={c.label} className="flex items-center gap-2">
                        <span className={c.ok ? 'text-green-500' : 'text-red-500'}>{c.ok ? '✓' : '✗'}</span>
                        <span className="text-fg-secondary">{c.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mb-1 flex items-center gap-1.5 font-medium text-fg-primary">
                    <ShieldCheck size={13} className="text-accent" />证据清单
                  </div>
                  <div className="space-y-1 pl-5">
                    {Array.from({ length: r.evidences }, (_, i) => (
                      <div key={i} className="flex items-center gap-2 text-fg-muted">
                        <FileText size={12} />
                        <span className="font-mono">evidence_{r.id}_{String(i + 1).padStart(2, '0')}.json</span>
                        <span className="ml-auto text-[10px]">{r.at}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部：汇总统计 */}
      <div className="flex items-center gap-4 border-t border-border bg-bg-secondary px-4 py-2 text-[11.5px] text-fg-secondary">
        <span>总执行 <b className="text-fg-primary">{total}</b> 次</span>
        <span>通过率 <b className="text-green-500">{passRate}%</b></span>
        <span>平均耗时 <b className="text-fg-primary">{avgDuration}s</b></span>
        <span>总 LLM 调用 <b className="text-fg-primary">{llmTotal}</b> 次</span>
      </div>
    </div>
  );
}
