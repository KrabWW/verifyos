/**
 * ApiTree — 左栏 API 资产树（对标 Hoppscotch 侧栏 + Postcat 资产树）。
 *
 * 功能：分组折叠/展开、搜索实时过滤、method 徽章着色、覆盖状态点、
 * hover「✦ 生成」按钮、点击选中高亮。
 *
 * 独立性：仅依赖同目录 types/data，不引用 src/types.ts / src/lib/utils.ts。
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, FolderClosed, FolderOpen, Sparkles } from "lucide-react";
import type { ApiDefinition, ApiGroup, CoverageStatus, HttpMethod } from "./types";

/* ---------- 样式映射 ---------- */

export const METHOD_BADGE: Record<HttpMethod, string> = {
  GET: "bg-get/15 text-get border-get/30",
  POST: "bg-post/15 text-post border-post/30",
  PUT: "bg-put/15 text-put border-put/30",
  DELETE: "bg-del/15 text-del border-del/30",
  PATCH: "bg-patch/15 text-patch border-patch/30",
};

export const COVERAGE_DOT: Record<CoverageStatus, { color: string; title: string }> = {
  full: { color: "bg-green-500", title: "全覆盖" },
  partial: { color: "bg-amber-400", title: "部分覆盖" },
  none: { color: "bg-red-500", title: "未测试" },
};

/* ---------- Props ---------- */

export interface ApiTreeProps {
  apis: ApiDefinition[];
  groups?: ApiGroup[];
  selectedId?: string | null;
  /** 初始搜索词（预览/测试用） */
  initialQuery?: string;
  onSelect?: (api: ApiDefinition) => void;
  /** hover 行「✦ 生成」回调 */
  onGenerate?: (api: ApiDefinition) => void;
  className?: string;
}

/* ---------- 组件 ---------- */

export default function ApiTree({ apis, groups = [], selectedId = null, onSelect, onGenerate, className = "" }: ApiTreeProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /** 搜索过滤：匹配名称 / path / method */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apis;
    return apis.filter(
      (a) => a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q) || a.method.toLowerCase().includes(q),
    );
  }, [apis, query]);

  const visibleGroups = useMemo(() => {
    const has = new Map<string, ApiDefinition[]>();
    for (const api of filtered) {
      if (!has.has(api.groupId)) has.set(api.groupId, []);
      has.get(api.groupId)!.push(api);
    }
    const known = groups.filter((g) => has.has(g.id));
    const orphans = [...has.keys()].filter((id) => !groups.some((g) => g.id === id));
    return [
      ...known,
      ...orphans.map((id) => ({ id, name: id })),
    ].map((g) => ({ group: g, apis: has.get(g.id)! }));
  }, [filtered, groups]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={`flex h-full flex-col bg-bg-secondary ${className}`}>
      {/* 搜索框 */}
      <div className="border-b border-border p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 API（名称 / 路径 / 方法）"
            className="h-8 w-full rounded-md border border-border bg-bg-primary pl-8 pr-2.5 text-xs text-fg-primary outline-none transition-colors placeholder:text-fg-muted focus:border-accent-line focus:bg-bg-tertiary"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-muted hover:text-fg-primary"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* 树 */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {visibleGroups.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-fg-muted">无匹配 API</div>
        )}

        {visibleGroups.map(({ group, apis: items }) => {
          const isCollapsed = collapsed.has(group.id);
          return (
            <div key={group.id} className="mb-0.5">
              {/* 分组头 */}
              <button
                onClick={() => toggle(group.id)}
                className="group flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-bg-tertiary"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                )}
                {isCollapsed ? (
                  <FolderClosed className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                )}
                <span className="truncate text-xs font-medium text-fg-primary">{group.name}</span>
                <span className="ml-auto rounded-full bg-bg-tertiary px-1.5 text-[10px] leading-4 text-fg-muted">
                  {items.length}
                </span>
              </button>

              {/* 分组行 */}
              {!isCollapsed && (
                <ul className="pb-1">
                  {items.map((api) => {
                    const selected = api.id === selectedId;
                    return (
                      <li key={api.id}>
                        <div
                          onClick={() => onSelect?.(api)}
                          className={`group relative mx-1.5 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                            selected ? "bg-accent-dim ring-1 ring-accent-line" : "hover:bg-bg-tertiary"
                          }`}
                        >
                          <span
                            className={`w-[52px] shrink-0 rounded border px-1 py-px text-center text-[10px] font-bold leading-4 tracking-wide ${METHOD_BADGE[api.method]}`}
                          >
                            {api.method}
                          </span>
                          <span
                            className={`truncate font-mono text-xs ${selected ? "text-fg-primary" : "text-fg-secondary"}`}
                            title={api.path}
                          >
                            {api.path}
                          </span>

                          {/* 右侧：默认覆盖状态点，hover 时变为「✦ 生成」 */}
                          <span className="ml-auto flex h-5 w-8 shrink-0 items-center justify-center">
                            {onGenerate ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onGenerate(api);
                                }}
                                title={`为 ${api.name} 生成测试用例`}
                                className="hidden h-5 items-center gap-0.5 rounded bg-accent/15 px-1.5 text-[10px] font-medium text-accent ring-1 ring-accent-line hover:bg-accent/25 group-hover:flex"
                              >
                                <Sparkles className="h-2.5 w-2.5" />
                                生成
                              </button>
                            ) : null}
                            <span
                              className={`ml-auto h-2 w-2 rounded-full group-hover:hidden ${COVERAGE_DOT[api.status].color}`}
                              title={COVERAGE_DOT[api.status].title}
                            />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部统计 */}
      <div className="border-t border-border px-3 py-1.5 text-[10px] text-fg-muted">
        {filtered.length}/{apis.length} 个接口 · 全覆盖 {apis.filter((a) => a.status === "full").length} · 未测{" "}
        {apis.filter((a) => a.status === "none").length}
      </div>
    </div>
  );
}
