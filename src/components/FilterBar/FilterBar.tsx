import { useLayoutEffect, useRef } from "react";
import { useStore } from "../../store";
import { confirm } from "@tauri-apps/plugin-dialog";
import { gsap, motionReduced, EASE } from "../../motion";
import { IconSizePicker } from "../IconSizePicker/IconSizePicker";

export function FilterBar() {
  const barRef = useRef<HTMLElement>(null);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const filterRunning = useStore((s) => s.filterRunning);
  const setFilterRunning = useStore((s) => s.setFilterRunning);
  const toolViews = useStore((s) => s.toolViews);
  const tools = useStore((s) => s.tools);

  const runningCount = Object.values(toolViews).filter((tv) =>
    tv.terminals.some((t) => t.alive)
  ).length;

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || motionReduced) return;
    const tween = gsap.fromTo(el, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.36, ease: EASE.out });
    return () => {
      tween.kill();
    };
  }, []);

  return (
    <header ref={barRef} className="flex h-12 items-center gap-3 border-b border-gray-800 bg-gray-950 px-5">
      <IconSizePicker compact />
      <div className="relative ml-auto w-full max-w-md">
        <input
          id="tool-search"
          type="text"
          aria-label="搜索工具"
          placeholder={`筛选 ${tools.length} 个工具`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && searchQuery) {
              e.preventDefault();
              setSearchQuery("");
            }
          }}
          className="h-9 w-full rounded-lg border border-gray-800 bg-gray-925 py-1.5 pl-8 pr-12 text-[13px] text-gray-50 placeholder-gray-500 outline-none focus:border-white/16"
        />
        <svg
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {searchQuery ? (
          <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-200" aria-label="清空搜索">✕</button>
        ) : (
          <kbd className="cd-keycap pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">⌘ K</kbd>
        )}
      </div>

      {runningCount > 0 && (
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const ok = await confirm(`关闭全部 ${runningCount} 个运行中的终端？`, {
                title: "CommandDeck",
                kind: "warning",
              });
              if (!ok) return;
              await useStore.getState().closeAllTools();
            })().catch((error) => {
              console.error(error);
            });
          }}
          className="cd-btn cd-btn-danger shrink-0"
        >
          全部关闭
        </button>
      )}
      <button
        type="button"
        onClick={() => setFilterRunning(!filterRunning)}
        aria-pressed={filterRunning}
        className={`cd-btn shrink-0 ${
          filterRunning ? "border-emerald-400/30 text-emerald-300" : ""
        }`}
      >
        {runningCount > 0 ? (
          <span data-pulse className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        ) : (
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gray-600" />
        )}
        运行中 {runningCount > 0 && ` ${runningCount}`}
      </button>
    </header>
  );
}
