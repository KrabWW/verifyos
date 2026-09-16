import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** 按钮视觉风格 */
export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger';
/** 按钮尺寸 */
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** 各 variant 的样式映射（accent 跟随主题色变量） */
const variantCls: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  ghost: 'bg-transparent text-fg-secondary hover:bg-bg-tertiary hover:text-fg-primary',
  outline: 'bg-transparent text-fg-primary border border-border hover:border-accent hover:text-accent',
  danger: 'bg-[#ef4444] text-white hover:opacity-90',
};

/** 各 size 的样式映射 */
const sizeCls: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1',
  md: 'h-8 px-3 text-[13px] gap-1.5',
};

/** 基础按钮（极简 shadcn 风格，无 radix） */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
