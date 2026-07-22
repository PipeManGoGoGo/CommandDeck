import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { save } from "@tauri-apps/plugin-dialog";

interface Props {
  onClose: () => void;
}

export function ExportModal({ onClose }: Props) {
  const tools = useStore((s) => s.tools) ?? [];
  const categories = useStore((s) => s.categories);
  const [selected, setSelected] = useState<Set<string>>(new Set(tools.map((t) => t.id)));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exporting, onClose]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleExport = async () => {
    if (selected.size === 0 || exporting) return;
    setExporting(true);
    setError(null);
    try {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const exportTools = tools
      .filter((t) => selected.has(t.id))
      .map((t) => ({
        name: t.name,
        category: catMap.get(t.category_id) || "未分类",
        description: t.description,
        download_url: t.download_url || "",
        install_type: "custom" as const,
        install_command: t.install_command || "",
        verify_command: t.verify_command,
        commands: t.commands.map((c) => ({ label: c.label, command: c.command })),
        note: t.note,
      }));

    const data = {
      version: "1.0",
      exported_at: new Date().toISOString().slice(0, 10),
      tools: exportTools,
    };

    const path = await save({
      defaultPath: "secbox-tools.secbox.json",
      filters: [{ name: "SecBox", extensions: ["json"] }],
    });

    if (path) {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const text = await blob.text();
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(path, text);
    }
      if (path) onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-750 bg-gray-850 shadow-panel">
        <div className="flex items-center justify-between border-b border-gray-750 px-5 py-4">
          <div><h2 id="export-title" className="text-sm font-semibold text-gray-100">导出工具</h2><p className="mt-0.5 text-[11px] text-gray-500">创建可分享的 SecBox 工具包</p></div>
          <button type="button" onClick={onClose} disabled={exporting} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-750 hover:text-gray-200 disabled:opacity-40" aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tools.map((tool) => (
            <label
              key={tool.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-gray-925 px-3 py-2.5 hover:border-gray-700 hover:bg-gray-950"
            >
              <input
                type="checkbox"
                checked={selected.has(tool.id)}
                onChange={() => toggle(tool.id)}
                className="rounded"
              />
              <span className="text-sm">{tool.name}</span>
            </label>
          ))}
          {tools.length === 0 && <div className="py-10 text-center text-sm text-gray-500">当前没有可导出的工具</div>}
          {error && <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
          <span className="text-xs text-gray-400">
            已选 {selected.size} 个工具
          </span>
          <div className="flex gap-2">
            <button type="button"
              onClick={onClose}
              disabled={exporting}
              className="rounded-lg border border-gray-750 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-750 hover:text-gray-100 disabled:opacity-40"
            >
              取消
            </button>
            <button type="button"
              onClick={handleExport}
              disabled={selected.size === 0 || exporting}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? "导出中…" : "导出"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
