import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** 徽章类别：HTTP 方法色 / 执行状态 / accent 跟随主题 */
export type BadgeTone =
  | 'default'
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'pass'
  | 'fail'
  | 'pending'
  | 'accent';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** tone → utility class（类定义在 index.css @layer components） */
const toneCls: Record<BadgeTone, string> = {
  default: '',
  get: 'badge-get',
  post: 'badge-post',
  put: 'badge-put',
  patch: 'badge-patch',
  delete: 'badge-delete',
  pass: 'badge-pass',
  fail: 'badge-fail',
  pending: 'badge-pending',
  accent: 'badge-accent',
};

/** 小徽章：方法色（GET 绿/POST 蓝/PUT 橙/DELETE 红/PATCH 紫）+ 状态色 + accent */
export function Badge({ className, tone = 'default', ...props }: BadgeProps) {
  return <span className={cn('badge', toneCls[tone], className)} {...props} />;
}

/** HTTP 方法 → 徽章 tone 的快捷映射（供资产树/请求视图复用） */
export function methodTone(method: string): BadgeTone {
  const m = method.toUpperCase();
  if (m === 'GET') return 'get';
  if (m === 'POST') return 'post';
  if (m === 'PUT') return 'put';
  if (m === 'PATCH') return 'patch';
  if (m === 'DELETE') return 'delete';
  return 'default';
}
