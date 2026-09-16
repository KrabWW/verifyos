import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PaneLayoutProps {
  /** 左栏内容（默认宽 232px） */
  left?: ReactNode;
  /** 中栏内容（flex-1） */
  children?: ReactNode;
  /** 右栏内容（默认宽 240px） */
  right?: ReactNode;
  /** 左栏初始宽度 */
  initialLeftWidth?: number;
  /** 右栏初始宽度 */
  initialRightWidth?: number;
  className?: string;
}

/** 拖拽分隔条（竖直细条，hover/拖拽中 accent 高亮） */
function DragHandle({ onDrag, ariaLabel }: { onDrag: (clientX: number) => void; ariaLabel: string }) {
  const dragging = useRef(false);

  const handleMove = useCallback(
    (e: MouseEvent) => {
      if (dragging.current) onDrag(e.clientX);
    },
    [onDrag],
  );

  const handleUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [handleMove, handleUp]);

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      onMouseDown={() => {
        dragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      className="group/drag relative w-px shrink-0 cursor-col-resize bg-border"
    >
      {/* 扩大热区 */}
      <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
      <div className="absolute inset-y-0 left-0 w-px bg-accent opacity-0 transition-opacity group-hover/drag:opacity-100" />
    </div>
  );
}

/** 三栏工作台布局：左 232px（可拖拽）/ 中 flex-1 / 右 240px（可拖拽） */
export function PaneLayout({
  left,
  children,
  right,
  initialLeftWidth = 232,
  initialRightWidth = 240,
  className,
}: PaneLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [rightWidth, setRightWidth] = useState(initialRightWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  /** 根据鼠标 X 计算左栏新宽度（跟随分隔条） */
  const dragLeft = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const w = clientX - rect.left;
    setLeftWidth(Math.min(Math.max(w, 160), rect.width * 0.5));
  }, []);

  /** 根据鼠标 X 计算右栏新宽度 */
  const dragRight = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const w = rect.right - clientX;
    setRightWidth(Math.min(Math.max(w, 160), rect.width * 0.5));
  }, []);

  return (
    <div ref={containerRef} className={cn('flex min-h-0 flex-1 overflow-hidden', className)}>
      {/* 左栏 */}
      {left && (
        <aside style={{ width: leftWidth }} className="flex min-w-0 shrink-0 flex-col overflow-hidden border-r border-border bg-bg-primary">
          {left}
        </aside>
      )}
      {left && <DragHandle onDrag={dragLeft} ariaLabel="调整左栏宽度" />}

      {/* 中栏 */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>

      {/* 右栏 */}
      {right && (
        <>
          <DragHandle onDrag={dragRight} ariaLabel="调整右栏宽度" />
          <aside style={{ width: rightWidth }} className="flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-border bg-bg-primary">
            {right}
          </aside>
        </>
      )}
    </div>
  );
}
