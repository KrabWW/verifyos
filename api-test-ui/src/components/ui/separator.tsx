import { cn } from '@/lib/utils';

export interface SeparatorProps {
  /** 方向：horizontal 横线 / vertical 竖线（vertical 需父容器有高度） */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

/** 分隔线（样式来自 index.css 的 .separator-h/.separator-v utility） */
export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return <div className={cn(orientation === 'vertical' ? 'separator-v' : 'separator-h', className)} />;
}
