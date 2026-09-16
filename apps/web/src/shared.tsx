/**
 * 跨 View 共享的类型与工具函数。
 * 判定标准：被 ≥2 个 View 使用的类型/常量/函数放这里；只被一个 View 用的跟着该 View 走。
 */
import { CircleCheck, CircleX, TriangleAlert, Circle, CircleDashed } from 'lucide-react';

// U29：'plugin-page' = 插件 UI 扩展页（具体页面由 pluginPageRoute state 指向某插件的 manifest.ui 声明）
export type Route = 'dashboard' | 'chat' | 'explore' | 'qa' | 'run' | 'editor' | 'history' | 'map' | 'issues' | 'pr' | 'mobile' | 'cred' | 'plugins' | 'triage' | 'welcome' | 'import' | 'settings' | 'plugin-page';

export interface RecentRun { runId: string; verdict: string; durationMs: number; llmCalls: number; createdAt?: string; device?: string | null; trigger?: string; verShortId?: string | null; verTitle?: string | null }
export interface DoneSummary {
  runId: string;
  verdict: string;
  llmCalls: number;
  durationMs: number;
  cache?: { entries: number; totalHits: number };
}

export interface OverviewData {
  tools: { total: number };
  runs: { total: number; passed: number; unknown: number; failed: number };
  recent: RecentRun[];
  trend?: Array<{ day: string; pass: number; unknown: number; fail: number }>;
  prRuns?: number;
  uncoveredHigh?: Array<{ path: string; title: string | null }>;
}

export function verdictMeta(v?: string): { dot: string; cls: string } {
  switch (v) {
    case 'pass': return { dot: '✓', cls: 'ok' };
    case 'fail': return { dot: '✕', cls: 'fail' };
    case 'unknown': return { dot: '?', cls: 'warn' };
    case 'running': return { dot: '●', cls: 'run' };
    default: return { dot: '', cls: 'idle' };
  }
}

/** L1b：共享判定图标——细线 icon 独立于颜色传达语义（色盲友好），替代实心圆✓✕? 字符 */
export function VerdictIcon({ v, size = 12, strokeWidth }: { v?: string | null; size?: number; strokeWidth?: number }) {
  const common = { size, strokeWidth, style: { flexShrink: 0 } } as const;
  switch (v) {
    case 'pass': return <CircleCheck {...common} />;
    case 'fail': return <CircleX {...common} />;
    case 'unknown': return <TriangleAlert {...common} />;
    case 'running': return <CircleDashed {...common} />;
    default: return <Circle {...common} />;
  }
}
