import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  /** hover 时展示的提示文本 */
  label: string;
  children: ReactNode;
  /** 提示框位置，默认下方 */
  side?: 'top' | 'bottom' | 'right';
  className?: string;
}

/** 纯 CSS hover 提示（group-hover 显示，无 JS 状态） */
export function Tooltip({ label, children, side = 'bottom', className }: TooltipProps) {
  const posCls =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
      : side === 'right'
        ? 'left-full top-1/2 -translate-y-1/2 ml-1.5'
        : 'top-full left-1/2 -translate-x-1/2 mt-1.5';
  return (
    <span className={cn('relative inline-flex group/tt', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1',
          'bg-bg-tertiary border border-border text-fg-primary text-xs',
          'opacity-0 scale-95 transition-all duration-100',
          'group-hover/tt:opacity-100 group-hover/tt:scale-100',
          posCls,
        )}
      >
        {label}
      </span>
    </span>
  );
}
