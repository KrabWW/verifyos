/**
 * AiFloatingButton —— 全局 AI 入口浮动圆框（右下角兜底入口）。
 *
 * teal 渐变边框 + 微脉冲动画；hover 放大并展开「AI 助手」文字标签；
 * 点击触发 onOpen 打开 AiDrawer。树/编辑器/失败行/覆盖率等现场入口
 * 由各页面自行携带更精确的上下文调用同一抽屉。
 */
import { Sparkles } from 'lucide-react';

export interface AiFloatingButtonProps {
  onOpen: () => void;
  /** 附加类名（定位可被覆盖，默认固定右下角） */
  className?: string;
}

export function AiFloatingButton({ onOpen, className }: AiFloatingButtonProps) {
  return (
    <>
      <style>{`
        @keyframes ai-fab-pulse {
          0%   { box-shadow: 0 0 0 0 hsl(160 84% 39% / .35); }
          70%  { box-shadow: 0 0 0 10px hsl(160 84% 39% / 0); }
          100% { box-shadow: 0 0 0 0 hsl(160 84% 39% / 0); }
        }
      `}</style>

      <div className={`group fixed bottom-6 right-6 z-50 flex items-center ${className ?? ''}`}>
        {/* hover 展开的文字标签 */}
        <span className="pointer-events-none mr-2 rounded-full border border-[hsl(var(--accent-line))] bg-[hsl(var(--bg-primary))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--accent))] opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100">
          AI 助手
        </span>

        {/* teal 渐变边框：外层渐变背景 + 内层 2px padding 形成描边 */}
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(160_84%_45%)] via-[hsl(190_84%_45%)] to-[hsl(217_76%_55%)] p-[2px] shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95"
          style={{ animation: 'ai-fab-pulse 2.4s ease-out infinite' }}
          onClick={onOpen}
          aria-label="打开 AI 助手"
          title="AI 助手"
        >
          <span className="flex h-full w-full items-center justify-center rounded-full bg-[hsl(var(--bg-primary))] transition-colors group-hover:bg-[hsl(var(--bg-secondary))]">
            <Sparkles size={20} className="text-[hsl(var(--accent))]" />
          </span>
        </button>
      </div>
    </>
  );
}
