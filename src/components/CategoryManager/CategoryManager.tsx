import { useState } from "react";
import { useStore } from "../../store";

export function CategoryManager() {
  const categories = useStore((s) => s.categories);
  const tools = useStore((s) => s.tools) ?? [];
  const addCategory = useStore((s) => s.addCategory);
  const updateCategory = useStore((s) => s.updateCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const reorderCategories = useStore((s) => s.reorderCategories);
  const backToCatalog = useStore((s) => s.backToCatalog);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const countByCategory = (catId: string) =>
    tools.filter((t) => t.category_id === catId).length;

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addCategory(newName.trim());
    setNewName("");
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await updateCategory(id, { name: editName.trim() });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const count = countByCategory(id);
    if (count > 0) {
      setError(`该分类下还有 ${count} 个工具，请先移动或删除这些工具。`);
      return;
    }
    setError(null);
    await deleteCategory(id);
  };

  const moveCategory = async (id: string, direction: -1 | 1) => {
    const index = categories.findIndex((category) => category.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    const ids = categories.map((category) => category.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderCategories(ids);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-2xl">
      <div className="mb-7 flex items-start justify-between">
        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-400">Organization</p><h1 className="text-xl font-semibold text-gray-100">分类管理</h1><p className="mt-1 text-sm text-gray-500">调整分类名称、色彩与展示顺序。</p></div>
        <button
          type="button"
          onClick={() => backToCatalog()}
          className="rounded-lg border border-gray-750 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-850 hover:text-gray-100"
        >
          关闭
        </button>
      </div>

      <div className="space-y-2.5">
        {error && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{error}</div>}
        {categories.map((cat, index) => (
          <div
            key={cat.id}
            className="flex items-center gap-3 rounded-xl border border-gray-750 bg-gray-850/70 px-4 py-3"
          >
            <label className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full ring-2 ring-gray-200/10" style={{ backgroundColor: cat.color || "#64748b" }} title="修改分类颜色">
              <input type="color" value={cat.color || "#64748b"} onChange={(event) => updateCategory(cat.id, { color: event.target.value })} className="absolute inset-0 h-8 w-8 cursor-pointer opacity-0" aria-label={`修改 ${cat.name} 的颜色`} />
            </label>
            {editingId === cat.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRename(cat.id)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-750 bg-gray-925 px-2.5 py-1.5 text-sm text-gray-100 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                  autoFocus
                />
                <button
                  onClick={() => handleRename(cat.id)}
                  className="text-xs text-brand-400 hover:text-brand-300"
                >
                  保存
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{cat.name}</span>
                <span className="rounded-md bg-gray-925 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500">{countByCategory(cat.id)}</span>
                <div className="flex items-center rounded-md border border-gray-750">
                  <button type="button" disabled={index === 0} onClick={() => moveCategory(cat.id, -1)} className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-25" aria-label="上移">↑</button>
                  <button type="button" disabled={index === categories.length - 1} onClick={() => moveCategory(cat.id, 1)} className="border-l border-gray-750 px-1.5 py-1 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-25" aria-label="下移">↓</button>
                </div>
                <button
                  onClick={() => {
                    setEditingId(cat.id);
                    setEditName(cat.name);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  删除
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-2 rounded-xl border border-dashed border-gray-750 bg-gray-925/50 p-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="min-w-0 flex-1 rounded-lg border border-gray-750 bg-gray-925 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
          placeholder="新分类名称"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          添加
        </button>
      </div>
      </div>
    </div>
  );
}
