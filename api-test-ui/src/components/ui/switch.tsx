import { cn } from '@/lib/utils';

export interface SwitchProps {
  /** 受控：是否开启 */
  checked: boolean;
  /** 切换回调 */
  onChange: (checked: boolean) => void;
  /** 禁用态 */
  disabled?: boolean;
  className?: string;
}

/** 开关：accent 高亮（点击热区 32x18，视觉滑块居中） */
export function Switch({ checked, onChange, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors cursor-pointer',
        'disabled:pointer-events-none disabled:opacity-50',
        checked ? 'bg-accent border-accent' : 'bg-bg-tertiary border-border',
        className,
      )}
    >
      {/* 滑块 */}
      <span
        className={cn(
          'ml-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-3.5',
        )}
      />
    </button>
  );
}
