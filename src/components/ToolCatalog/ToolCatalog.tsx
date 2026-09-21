import { useStore } from "../../store";
import { ToolCard } from "../ToolCard";
import type { Tool } from "../../types";
import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap, motionReduced, scrollElementInto, staggerApps, staggerList } from "../../motion";
import { fuzzyScore } from "../../utils/fuzzy";
import { pickCommandText } from "../../utils/command";


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
  const dropTargetCatId = useStore((s) => s.dropTargetCatId);
  const setDropTargetCatId = useStore((s) => s.setDropTargetCatId);
  const setActiveCategoryId = useStore((s) => s.setActiveCategoryId);
  const restoredRef = useRef(false);
  const introRef = useRef(false);

  const runningToolIds = new Set(
    Object.entries(toolViews)
      .filter(([, tv]) => tv.terminals.some((t) => t.alive))
      .map(([id]) => id)
  );

  const filteredTools = tools.filter((t) => {
    if (t.trashed) return false;
    if (searchQuery) {
      const hay = `${t.name} ${t.description || ""} ${t.commands.map((c) => `${c.label} ${pickCommandText(c)}`).join(" ")}`;
      if (fuzzyScore(hay, searchQuery) <= 0) return false;
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

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || restoredRef.current || categories.length === 0) return;
    restoredRef.current = true;
    const { lastToolId, catalogScrollTop, activeCategoryId } = useStore.getState();
    const card = lastToolId ? document.getElementById(`tool-${lastToolId}`) : null;
    if (card) {
      scrollElementInto(container, card);
      return;
    }
    if (catalogScrollTop > 0) {
      container.scrollTop = catalogScrollTop;
      return;
    }
    if (activeCategoryId) {
      const section = document.getElementById(`cat-${activeCategoryId}`);
      if (section) scrollElementInto(container, section);
    }
  }, [categories, tools, scrollRef]);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || introRef.current || motionReduced) return;
    const apps = root.querySelectorAll(".cd-app");
    if (apps.length === 0) return;
    introRef.current = true;
    staggerApps(apps);
    const heads = root.querySelectorAll("section h2");
    if (heads.length) staggerList(heads, { duration: 0.4, stagger: 0.05 });
    return () => {
      gsap.killTweensOf(apps);
      gsap.set(apps, { clearProps: "opacity,transform" });
    };
  }, [categories, tools, scrollRef]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        useStore.getState().setCatalogScrollTop(container.scrollTop);
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef]);

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
      className="flex-1 overflow-y-auto px-5 py-5"
    >
      {visibleCategories.length === 0 && (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <h2 className="font-display text-[11px] text-gray-400">
            {tools.some((t) => !t.trashed) ? "没有找到匹配的工具" : "还没有工具"}
          </h2>
          <p className="mt-1 max-w-xs text-xs leading-5 text-gray-500">
            {tools.some((t) => !t.trashed)
              ? "尝试更换关键词，或关闭“运行中”筛选。"
              : "在左侧分类上点「添加工具」，或用底栏导入。"}
          </p>
          {tools.some((t) => !t.trashed) && (
          <button
            type="button"
            onClick={() => {
              useStore.getState().setSearchQuery("");
              useStore.getState().setFilterRunning(false);
            }}
            className="cd-btn mt-4"
          >
            清除筛选
          </button>
          )}
        </div>
      )}
      {categories.map((cat) => {
        const catTools = toolsByCategory(cat.id);
        if ((searchQuery || filterRunning) && catTools.length === 0) return null;

        const isDropTarget = Boolean(dragToolId && dropTargetCatId === cat.id);
        const isSource =
          dragToolId &&
          tools.find((t) => t.id === dragToolId)?.category_id === cat.id;

        return (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            className={`mb-8 scroll-mt-6 p-1 ${
              isDropTarget && !isSource
                ? "drop-hot bg-brand-500/8"
                : dragToolId && !isSource
                  ? "border border-dashed border-gray-800"
                  : ""
            }`}
            onPointerEnter={() => {
              if (dragToolId) setDropTargetCatId(cat.id);
            }}
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
              {isDropTarget && !isSource && (
                <span className="text-[10px] font-medium text-brand-300">放到这里</span>
              )}
            </div>

            {catTools.length > 0 ? (
              <div className="cd-app-grid">
                {catTools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            ) : (
              <div className={`border border-dashed py-8 text-center text-xs ${
                isDropTarget ? "border-brand-400/50 bg-brand-500/8 text-brand-300" : "border-gray-800 text-gray-600"
              }`}>
                {isDropTarget ? "松手放入此分类" : "此分类还没有工具，可在左侧树里添加"}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
