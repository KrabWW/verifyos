import { useState } from 'react';
import { ChevronDown, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

/** 顶栏环境 */
export type EnvKey = 'dev' | 'staging' | 'prod';
/** AI 模型 */
export type ModelKey = 'glm-4.6' | 'deepseek' | 'gpt-4o';
/** 主题 accent 九色 */
export type AccentKey =
  | 'teal' | 'blue' | 'violet' | 'rose' | 'amber'
  | 'green' | 'cyan' | 'red' | 'orange';

/** 环境定义（prod 红色警示） */
const ENVS: { key: EnvKey; label: string }[] = [
  { key: 'dev', label: 'dev' },
  { key: 'staging', label: 'staging' },
  { key: 'prod', label: 'prod' },
];

/** 模型定义 */
const MODELS: { key: ModelKey; label: string }[] = [
  { key: 'glm-4.6', label: 'glm-4.6' },
  { key: 'deepseek', label: 'deepseek' },
  { key: 'gpt-4o', label: 'gpt-4o' },
];

/** 九色 accent 色值（与 index.css data-accent 变量一致） */
const ACCENTS: { key: AccentKey; color: string }[] = [
  { key: 'teal', color: '#16b981' },
  { key: 'blue', color: '#3b82f6' },
  { key: 'violet', color: '#8b5cf6' },
  { key: 'rose', color: '#ec4899' },
  { key: 'amber', color: '#f59e0b' },
  { key: 'green', color: '#22c55e' },
  { key: 'cyan', color: '#06b6d4' },
  { key: 'red', color: '#ef4444' },
  { key: 'orange', color: '#f97316' },
];

export interface TopBarProps {
  env: EnvKey;
  onEnvChange: (env: EnvKey) => void;
  model: ModelKey;
  onModelChange: (model: ModelKey) => void;
  accent: AccentKey;
  onAccentChange: (accent: AccentKey) => void;
  onOpenAssistant?: () => void;
}

/** 顶栏：logo + 环境切换 + 模型下拉 + 九色 accent 切换 + AI 助手按钮 */
export function TopBar({
  env, onEnvChange, model, onModelChange, accent, onAccentChange, onOpenAssistant,
}: TopBarProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const currentModel = MODELS.find((m) => m.key === model) ?? MODELS[0];

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-bg-secondary px-3">
      {/* logo */}
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none text-accent">◐</span>
        <span className="text-[13px] font-semibold tracking-wide text-fg-primary">api·test</span>
      </div>

      {/* 环境切换（prod 红色警示） */}
      <div className="flex items-center rounded-md border border-border bg-bg-tertiary p-0.5">
        {ENVS.map((e) => {
          const active = e.key === env;
          const isProd = e.key === 'prod';
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => onEnvChange(e.key)}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors',
                active
                  ? isProd
                    ? 'bg-[#ef4444]/20 text-[#ef4444]'
                    : 'bg-accent-dim text-accent'
                  : isProd
                    ? 'text-[#ef4444]/70 hover:text-[#ef4444]'
                    : 'text-fg-muted hover:text-fg-secondary',
              )}
            >
              {isProd && <TriangleAlert size={11} />}
              {e.label}
            </button>
          );
        })}
      </div>

      {/* 模型下拉 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setModelOpen((v) => !v)}
          onBlur={() => setModelOpen(false)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-2 text-xs text-fg-secondary cursor-pointer hover:text-fg-primary"
        >
          <Sparkles size={12} className="text-accent" />
          {currentModel.label}
          <ChevronDown size={12} className="opacity-60" />
        </button>
        {modelOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-md border border-border bg-bg-secondary py-1 shadow-lg">
            {MODELS.map((m) => (
              <button
                key={m.key}
                type="button"
                onMouseDown={() => {
                  onModelChange(m.key);
                  setModelOpen(false);
                }}
                className={cn(
                  'flex w-full items-center px-3 py-1.5 text-left text-xs cursor-pointer hover:bg-bg-tertiary',
                  m.key === model ? 'text-accent' : 'text-fg-secondary',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 九色 accent 切换（点击改 html data-accent） */}
      <div className="flex items-center gap-1.5">
        {ACCENTS.map((a) => (
          <Tooltip key={a.key} label={a.key}>
            <button
              type="button"
              aria-label={`切换主题色 ${a.key}`}
              onClick={() => onAccentChange(a.key)}
              style={{ backgroundColor: a.color }}
              className={cn(
                'h-4 w-4 cursor-pointer rounded-full transition-transform',
                accent === a.key
                  ? 'scale-110 ring-2 ring-offset-1 ring-offset-bg-secondary'
                  : 'opacity-55 hover:opacity-90',
              )}
            />
          </Tooltip>
        ))}
      </div>

      <div className="flex-1" />

      {/* AI 助手按钮（teal 固定色，与 accent 无关） */}
      <button
        type="button"
        onClick={onOpenAssistant}
        className="flex h-7 items-center gap-1.5 rounded-md bg-[#14b8a6]/15 px-2.5 text-xs font-medium text-[#2dd4bf] border border-[#14b8a6]/30 cursor-pointer hover:bg-[#14b8a6]/25"
      >
        <Sparkles size={12} />
        AI 助手
      </button>
    </header>
  );
}
