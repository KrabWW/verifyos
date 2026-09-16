/**
 * CoverageBoard —— API 覆盖率看板。
 *
 * 布局（对标 Total Shift Left 覆盖率看板）：
 *  1. 顶部统计卡：总 API 数 / 已测 / 未测 + 覆盖率大数字（accent teal）；
 *  2. 每 API 覆盖行：method 徽章 + path + 覆盖状态 + 响应码点阵；
 *  3. 未覆盖清单：按 risk 降序，「✦ 补测」触发 onFillGap（打开 AI 抽屉）；
 *  4. 最近 7 天覆盖率趋势 SVG 折线图。
 */
import { useMemo } from 'react';
import type { CoverageReport, HttpMethod, OperationCoverage, UncoveredApi } from '@/types';
import { cn } from '@/lib/utils';
import { coverageTrend, mockCoverageReport, type TrendPoint } from './coverage.data';

export interface CoverageBoardProps {
  /** 覆盖率报告数据，缺省时使用内置演示数据 */
  report?: CoverageReport;
  /** 点击「补测」回调（通常用于打开 AI 抽屉） */
  onFillGap?: (api: UncoveredApi) => void;
  className?: string;
}

/* ---------- 小工具 ---------- */

const METHOD_CLS: Record<HttpMethod, string> = {
  GET: 'badge badge-get',
  POST: 'badge badge-post',
  PUT: 'badge badge-put',
  DELETE: 'badge badge-delete',
  PATCH: 'badge badge-patch',
  HEAD: 'badge',
  OPTIONS: 'badge',
  CONNECT: 'badge',
};

const RISK_STYLE = {
  high: { background: '#ef44441f', color: '#ef4444', borderColor: '#ef444442' },
  mid: { background: '#f59e0b1f', color: '#f59e0b', borderColor: '#f59e0b42' },
  low: undefined,
} as const;

function riskLevel(risk: number): 'high' | 'mid' | 'low' {
  if (risk >= 70) return 'high';
  if (risk >= 40) return 'mid';
  return 'low';
}

function coverageStatus(op: OperationCoverage): { label: string; cls: string } {
  if (!op.covered) return { label: '未覆盖', cls: 'text-red-400' };
  if (!op.codes_fully_covered) return { label: '部分覆盖', cls: 'text-amber-400' };
  return { label: '已覆盖', cls: 'text-get' };
}

function formatDate(iso: string | null): string {
  if (!iso) return '从未执行';
  return iso.slice(5, 16).replace('T', ' ');
}

/* ---------- 统计卡 ---------- */

function StatCard({ label, value, numCls, hint }: { label: string; value: number | string; numCls: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={cn('mt-1 font-mono text-[26px] font-bold leading-none', numCls)}>{value}</div>
      {hint && <div className="mt-1.5 text-[11px] text-fg-muted">{hint}</div>}
    </div>
  );
}

/* ---------- 趋势折线图 ---------- */

function TrendChart({ points }: { points: TrendPoint[] }) {
  const W = 560;
  const H = 150;
  const PAD_L = 34;
  const PAD_B = 22;
  const PAD_T = 12;
  const min = Math.min(...points.map((p) => p.rate)) - 8;
  const max = Math.max(...points.map((p) => p.rate)) + 6;
  const x = (i: number) => PAD_L + (i * (W - PAD_L - 10)) / (points.length - 1);
  const y = (r: number) => PAD_T + (1 - (r - min) / (max - min)) * (H - PAD_T - PAD_B);
  const line = points.map((p, i) => `${x(i)},${y(p.rate)}`).join(' ');
  const area = `${PAD_L},${H - PAD_B} ${line} ${x(points.length - 1)},${H - PAD_B}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="覆盖率趋势">
      <defs>
        <linearGradient id="cov-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 网格线 + y 轴刻度 */}
      {[0, 0.5, 1].map((t) => {
        const gy = PAD_T + t * (H - PAD_T - PAD_B);
        const val = Math.round(max - t * (max - min));
        return (
          <g key={t}>
            <line x1={PAD_L} y1={gy} x2={W - 10} y2={gy} stroke="hsl(222 10% 17%)" strokeDasharray="3 4" />
            <text x={PAD_L - 6} y={gy + 3.5} textAnchor="end" fontSize="9" fill="hsl(228 6% 45%)" fontFamily="monospace">
              {val}%
            </text>
          </g>
        );
      })}
      <polygon points={area} fill="url(#cov-fill)" />
      <polyline points={line} fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.rate)} r="3" fill="#0f1720" stroke="#14b8a6" strokeWidth="1.5" />
          <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="hsl(228 6% 45%)" fontFamily="monospace">
            {p.label}
          </text>
          <text x={x(i)} y={y(p.rate) - 8} textAnchor="middle" fontSize="9" fill="#14b8a6" fontFamily="monospace">
            {p.rate}%
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------- 主组件 ---------- */

export function CoverageBoard({ report = mockCoverageReport, onFillGap, className }: CoverageBoardProps) {
  const uncovered = useMemo(() => [...report.uncovered].sort((a, b) => b.risk - a.risk), [report.uncovered]);
  const ratePct = Math.round(report.rate * 100);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 顶部统计 */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="总 API 数" value={report.total} numCls="text-fg-primary" hint="inventory 资产" />
        <StatCard label="已测" value={report.covered_count} numCls="text-get" hint="存在关联用例" />
        <StatCard label="未测" value={report.uncovered_count} numCls="text-red-400" hint="无任何用例" />
        <div
          className="card px-4 py-3"
          style={{ borderColor: 'hsl(160 84% 39% / 0.35)', background: 'hsl(160 84% 39% / 0.08)' }}
        >
          <div className="text-[11px] uppercase tracking-wider" style={{ color: '#14b8a6' }}>
            覆盖率
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-[32px] font-bold leading-none text-teal-400">{ratePct}%</span>
            <span className="text-[11px] text-teal-500/80">▲ 3% / 7d</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
            <div className="h-full rounded-full bg-teal-400" style={{ width: `${ratePct}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {/* 每 API 覆盖行 */}
        <div className="card col-span-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[13px] font-semibold">API 覆盖明细</span>
            <span className="text-[11px] text-fg-muted">
              ■ 已测响应码 <span className="text-fg-muted/70">■</span> 未测响应码
            </span>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {report.operations.map((op) => {
              const st = coverageStatus(op);
              return (
                <div key={op.api_key} className="flex items-center gap-2.5 border-b border-border/60 px-4 py-[7px] last:border-b-0 hover:bg-bg-tertiary/50">
                  <span className={METHOD_CLS[op.method]}>{op.method}</span>
                  <span className="flex-1 truncate font-mono text-[12px] text-fg-primary">{op.path}</span>
                  {/* 响应码点阵 */}
                  <div className="flex items-center gap-1">
                    {op.codes.map((c) => (
                      <span
                        key={c.status_code}
                        title={`${c.status_code} ${c.covered ? '已测' : '未测'}`}
                        className={cn(
                          'inline-block h-[9px] w-[9px] rounded-[2px]',
                          c.covered ? 'bg-get' : 'border border-fg-muted/50 bg-transparent'
                        )}
                      />
                    ))}
                  </div>
                  <span className="w-14 text-right font-mono text-[11px] text-fg-muted">{op.test_case_count} 例</span>
                  <span className={cn('w-16 text-right text-[11px] font-medium', st.cls)}>{st.label}</span>
                  <span className="w-24 text-right font-mono text-[10px] text-fg-muted">{formatDate(op.last_tested_at)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右列：未覆盖清单 + 趋势 */}
        <div className="col-span-2 flex flex-col gap-3">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-[13px] font-semibold">未覆盖清单</span>
              <span className="text-[11px] text-fg-muted">按风险降序</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {uncovered.map((u) => {
                const lv = riskLevel(u.risk);
                return (
                  <div key={u.api_key} className="flex items-center gap-2 border-b border-border/60 px-4 py-[7px] last:border-b-0">
                    <span className={cn('badge', lv === 'low' && 'badge-pending')} style={RISK_STYLE[lv]}>
                      R{u.risk}
                    </span>
                    <span className={METHOD_CLS[u.method]}>{u.method}</span>
                    <span className="flex-1 truncate font-mono text-[12px]">{u.path}</span>
                    <button
                      type="button"
                      onClick={() => onFillGap?.(u)}
                      className="badge badge-accent cursor-pointer transition-transform hover:scale-105"
                      title="AI 生成补测用例"
                    >
                      ✦ 补测
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-[13px] font-semibold">覆盖率趋势</span>
              <span className="text-[11px] text-fg-muted">最近 7 天</span>
            </div>
            <div className="px-2 pb-2 pt-3">
              <TrendChart points={coverageTrend} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoverageBoard;
