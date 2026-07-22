import { useStore } from "../../store";

export function FilterBar() {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const filterRunning = useStore((s) => s.filterRunning);
  const setFilterRunning = useStore((s) => s.setFilterRunning);
  const toolViews = useStore((s) => s.toolViews);
  const tools = useStore((s) => s.tools);

  const runningCount = Object.values(toolViews).filter((tv) =>
    tv.terminals.some((t) => t.alive)
  ).length;

  return (
    <header className="flex min-h-[61px] items-center gap-4 border-b border-gray-800 bg-gray-925/75 px-5 backdrop-blur">
      <div className="min-w-0 shrink-0">
        <h1 className="text-sm font-semibold text-gray-100">工具工作台</h1>
        <p className="mt-0.5 text-[11px] text-gray-500">管理并快速启动你的命令行工具</p>
      </div>
      <div className="relative ml-auto w-full max-w-sm">
        <input
          type="text"
          aria-label="搜索工具"
          placeholder={`搜索 ${tools.length} 个工具...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-750 bg-gray-850/80 py-2 pl-9 pr-8 text-sm text-gray-100 placeholder-gray-500 transition focus:border-brand-500/70 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
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
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-200" aria-label="清空搜索">✕</button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setFilterRunning(!filterRunning)}
        aria-pressed={filterRunning}
        className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
          filterRunning
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
            : "border-gray-750 bg-gray-850 text-gray-400 hover:border-gray-600 hover:text-gray-200"
        }`}
      >
        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${runningCount > 0 ? "bg-emerald-400" : "bg-gray-600"}`} />
        运行中 {runningCount > 0 && ` ${runningCount}`}
      </button>
    </header>
  );
}
