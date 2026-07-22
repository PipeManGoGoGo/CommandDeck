import { useStore } from "../../store";
import type { Category } from "../../types";

export function Sidebar() {
  const categories = useStore((s) => s.categories);
  const tools = useStore((s) => s.tools);
  const view = useStore((s) => s.view);
  const backToCatalog = useStore((s) => s.backToCatalog);
  const activeCategoryId = useStore((s) => s.activeCategoryId);
  const setActiveCategoryId = useStore((s) => s.setActiveCategoryId);

  const countByCategory = (catId: string) =>
    tools.filter((t) => t.category_id === catId).length;

  const scrollToCategory = (catId: string) => {
    setActiveCategoryId(catId);
    if (view !== "catalog") {
      backToCatalog();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .getElementById(`cat-${catId}`)
            ?.scrollIntoView({ behavior: "smooth" });
        });
      });
    } else {
      document
        .getElementById(`cat-${catId}`)
        ?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <aside className="w-56 shrink-0 bg-gray-925/95 border-r border-gray-800 flex flex-col h-full">
      <div className="flex h-[61px] items-center gap-3 border-b border-gray-800 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-500/10 text-xs font-bold text-brand-300 shadow-glow">
          SB
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide text-gray-100">SecBox</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Security workspace</div>
        </div>
      </div>
      <div className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        工具分类
      </div>
      <nav className="flex-1 overflow-y-auto px-2" aria-label="工具分类">
        {categories.map((cat) => (
          <SidebarItem
            key={cat.id}
            cat={cat}
            count={countByCategory(cat.id)}
            active={activeCategoryId === cat.id}
            onClick={() => scrollToCategory(cat.id)}
          />
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-gray-800 bg-gray-850/70 p-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">工作区概览</div>
        <div className="mt-2 flex items-end justify-between">
          <span className="text-xl font-semibold text-gray-100">{tools.length}</span>
          <span className="pb-0.5 text-xs text-gray-500">个工具</span>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({
  cat,
  count,
  active,
  onClick,
}: {
  cat: Category;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-cat-nav={cat.id}
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`group mb-0.5 w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-brand-500/10 text-brand-300"
          : "text-gray-400 hover:bg-gray-850 hover:text-gray-100"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full ring-2 ring-transparent transition group-hover:ring-gray-200/10" style={{ backgroundColor: cat.color || "#64748b" }} />
        <span className="truncate">{cat.name}</span>
      </span>
      <span className="ml-2 rounded-md bg-gray-850 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 group-hover:bg-gray-750 group-hover:text-gray-300">{count}</span>
    </button>
  );
}
