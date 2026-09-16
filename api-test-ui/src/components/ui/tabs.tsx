import { cn } from '@/lib/utils';

export interface TabsProps<T extends string> {
  /** 受控：当前激活 tab 的 key */
  value: T;
  /** 切换回调 */
  onChange: (value: T) => void;
  /** tab 定义列表 */
  items: { value: T; label: string }[];
  className?: string;
}

/** 极简受控 tab 切换（下划线式，accent 高亮） */
export function Tabs<T extends string>({ value, onChange, items, className }: TabsProps<T>) {
  return (
    <div className={cn('flex items-center gap-0.5 border-b border-border', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'relative px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors',
              active ? 'text-accent' : 'text-fg-muted hover:text-fg-secondary',
            )}
          >
            {item.label}
            {/* 激活态下划线 */}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}
