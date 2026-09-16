import { Code2, FlaskConical, Gauge, Workflow, FileBarChart2, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

/** 侧边导航项 */
export type NavKey = 'api' | 'cases' | 'coverage' | 'scenario' | 'report' | 'settings';

/** 导航定义（lucide 图标） */
const NAVS: { key: NavKey; label: string; icon: typeof Code2 }[] = [
  { key: 'api', label: 'API', icon: Code2 },
  { key: 'cases', label: '用例', icon: FlaskConical },
  { key: 'coverage', label: '覆盖率', icon: Gauge },
  { key: 'scenario', label: '场景', icon: Workflow },
  { key: 'report', label: '报告', icon: FileBarChart2 },
  { key: 'settings', label: '设置', icon: Settings },
];

export interface SidenavProps {
  /** 受控：当前导航项 */
  active: NavKey;
  onChange: (key: NavKey) => void;
}

/** 窄图标导航栏（48px），当前项 teal（accent）高亮 */
export function Sidenav({ active, onChange }: SidenavProps) {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-bg-secondary py-2">
      {NAVS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <Tooltip key={key} label={label} side="right">
            <button
              type="button"
              aria-label={label}
              onClick={() => onChange(key)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md cursor-pointer transition-colors',
                isActive
                  ? 'bg-accent-dim text-accent'
                  : 'text-fg-muted hover:bg-bg-tertiary hover:text-fg-primary',
              )}
            >
              <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
