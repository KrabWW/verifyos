import { Radio, FileUp, PenLine, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 空态引导卡定义 */
const CARDS = [
  {
    icon: Radio,
    title: '录制流量',
    desc: '开启代理抓包，让真实业务流量自动沉淀为 API 资产与测试用例。',
    action: '开始',
  },
  {
    icon: FileUp,
    title: 'AI 生成 / 导入 OpenAPI',
    desc: '导入 OpenAPI 规范，或由 AI 依据资产智能生成覆盖补全用例。',
    action: '导入',
  },
  {
    icon: PenLine,
    title: '手写调试',
    desc: '像 Hoppscotch 一样直接构造请求，即时调试并保存为用例。',
    action: '新建',
  },
] as const;

export interface EmptyStateProps {
  /** 点击引导卡的回调（参数为卡片下标 0/1/2） */
  onStart?: (index: number) => void;
  className?: string;
}

/** 空态引导：三卡横排（录制流量 → AI 生成/导入 OpenAPI → 手写调试） */
export function EmptyState({ onStart, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center gap-6 p-8', className)}>
      {/* 标题区 */}
      <div className="text-center">
        <div className="mb-1 text-lg font-semibold text-fg-primary">从一条真实流量开始</div>
        <div className="text-xs text-fg-secondary">
          录制 → 生成 → 断言 → 覆盖率看板，API 测试资产全自动沉淀
        </div>
      </div>

      {/* 三卡横排 */}
      <div className="flex items-stretch gap-4">
        {CARDS.map(({ icon: Icon, title, desc, action }, i) => (
          <button
            key={title}
            type="button"
            onClick={() => onStart?.(i)}
            className="card group flex w-[210px] cursor-pointer flex-col items-start gap-2 p-4 text-left transition-colors hover:border-accent-line"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-dim text-accent">
              <Icon size={16} />
            </span>
            <span className="text-[13px] font-semibold text-fg-primary">{title}</span>
            <span className="text-xs leading-relaxed text-fg-secondary">{desc}</span>
            <span className="mt-auto flex items-center gap-1 pt-1 text-xs font-medium text-accent">
              {action}
              <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
