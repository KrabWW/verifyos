import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** 暗色输入框（样式来自 index.css 的 .input utility） */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('input', className)} {...props} />
  ),
);
Input.displayName = 'Input';
