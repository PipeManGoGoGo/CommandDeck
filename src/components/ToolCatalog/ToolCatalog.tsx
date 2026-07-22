import { useStore } from "../../store";
import { ToolCard } from "../ToolCard";
import type { Tool } from "../../types";
import { useEffect, useState, useCallback } from "react";

interface Props {
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function ToolCatalog({ scrollRef }: Props) {
  const categories = useStore((s) => s.categories);
  const tools = useStore((s) => s.tools);
  const searchQuery = useStore((s) => s.searchQuery);
  const filterRunning = useStore((s) => s.filterRunning);
  const toolViews = useStore((s) => s.toolViews);
  const dragToolId = useStore((s) => s.dragToolId);
  const setDragToolId = useStore((s) => s.setDragToolId);
  const moveTool = useStore((s) => s.moveTool);
  const setActiveCategoryId = useStore((s) => s.setActiveCategoryId);

  const [hoverCatId, setHoverCatId] = useState<string | null>(null);

  const runningToolIds = new Set(
    Object.entries(toolViews)
      .filter(([, tv]) => tv.terminals.some((t) => t.alive))
      .map(([id]) => id)
  );

  const filteredTools = tools.filter((t) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !t.description?.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filterRunning && !runningToolIds.has(t.id)) {
      return false;
    }
    return true;
  });

  const toolsByCategory = (catId: string): Tool[] =>
    filteredTools.filter((t) => t.category_id === catId);

  const visibleCategories = categories.filter(
    (cat) => !(searchQuery || filterRunning) || toolsByCategory(cat.id).length > 0
  );

  // Global mouseup: cancel drag or execute drop
  useEffect(() => {
    if (!dragToolId) return;

    const handleMouseUp = () => {
      if (hoverCatId && dragToolId) {
        const tool = tools.find((t) => t.id === dragToolId);
        if (tool && tool.category_id !== hoverCatId) {
          moveTool(dragToolId, hoverCatId);
        }
      }
      setDragToolId(null);
      setHoverCatId(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragToolId, hoverCatId, tools, moveTool, setDragToolId]);

  const handleCatMouseEnter = useCallback(
    (catId: string) => {
      if (dragToolId) setHoverCatId(catId);
    },
    [dragToolId]
  );

  const handleCatMouseLeave = useCallback(
    (catId: string) => {
      if (dragToolId && hoverCatId === catId) setHoverCatId(null);
    },
    [dragToolId, hoverCatId]
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const catId = entry.target.id.replace("cat-", "");
            setActiveCategoryId(catId);
          }
        }
      },
      { root: container, rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );

    container
      .querySelectorAll("[id^='cat-']")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories, scrollRef, setActiveCategoryId]);

  return (
    <div
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      className="flex-1 overflow-y-auto px-5 py-6"
    >
      {visibleCategories.length === 0 && (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-750 bg-gray-850 text-xl text-gray-500">⌕</div>
          <h2 className="text-sm font-medium text-gray-200">没有找到匹配的工具</h2>
          <p className="mt-1 max-w-xs text-xs leading-5 text-gray-500">尝试更换关键词，或关闭“运行中”筛选条件。</p>
          <button
            type="button"
            onClick={() => {
              useStore.getState().setSearchQuery("");
              useStore.getState().setFilterRunning(false);
            }}
            className="mt-4 rounded-lg border border-gray-750 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-850"
          >
            清除筛选
          </button>
        </div>
      )}
      {categories.map((cat) => {
        const catTools = toolsByCategory(cat.id);
        if ((searchQuery || filterRunning) && catTools.length === 0) return null;

        const isDropTarget = dragToolId && hoverCatId === cat.id;
        const isSource =
          dragToolId &&
          tools.find((t) => t.id === dragToolId)?.category_id === cat.id;

        return (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            className={`mb-9 scroll-mt-6 rounded-xl p-1 transition-colors ${
              isDropTarget && !isSource
                ? "ring-2 ring-brand-400 bg-brand-500/5"
                : ""
            }`}
            onMouseEnter={() => handleCatMouseEnter(cat.id)}
            onMouseLeave={() => handleCatMouseLeave(cat.id)}
          >
            <div className="mb-4 flex items-center gap-2.5 px-1">
              <div
                className="h-4 w-1 rounded-full"
                style={{ backgroundColor: cat.color || "#6b7280" }}
              />
              <h2 className="text-sm font-semibold text-gray-200">
                {cat.name}
              </h2>
              <span className="rounded-md bg-gray-850 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500">
                {catTools.length}
              </span>
            </div>

            {catTools.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
                {catTools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-750 bg-gray-925/40 py-9 text-center text-xs text-gray-500">
                此分类还没有工具，可从底部操作栏添加
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
