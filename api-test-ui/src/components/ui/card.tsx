import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** 卡片容器：bg-secondary + 圆角边框（样式来自 index.css 的 .card utility） */
export function Card({ className, ...props }: CardProps) {
  return <div className={cn('card', className)} {...props} />;
}

/** 卡片标题区 */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pt-3 pb-2', className)} {...props} />;
}

/** 卡片内容区 */
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}
