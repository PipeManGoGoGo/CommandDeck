import { useEffect, useState } from "react";
import { useOverlayController } from "../../motion";
import { useStore } from "../../store";
import { save } from "@tauri-apps/plugin-dialog";
import { exportPack, pathExists } from "../../utils/tauri";
import { resolveToolDir, safeToolName } from "../../utils/command";

interface Props {
  onClose: () => void;
}

export function ExportModal({ onClose }: Props) {
  const tools = (useStore((s) => s.tools) ?? []).filter((tool) => !tool.trashed);
  const categories = useStore((s) => s.categories);
  const workspace = useStore((s) => s.settings?.baseDir);
  const [selected, setSelected] = useState<Set<string>>(new Set(tools.map((t) => t.id)));
  const { overlayRef, panelRef, close } = useOverlayController(onClose);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exporting, close]);

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
    if (!workspace) throw new Error("请先选择工作目录");
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const sources: { src: string; dest: string }[] = [];
    const used = new Set<string>();
    const exportTools = [];
    for (const t of tools.filter((tool) => selected.has(tool.id))) {
      let dest: string | undefined;
      const dir = resolveToolDir(t, workspace);
      if (await pathExists(dir)) {
        let folder = safeToolName(t.name) || "tool";
        let n = 2;
        while (used.has(folder)) {
          folder = `${safeToolName(t.name)}-${n}`;
          n += 1;
        }
        used.add(folder);
        dest = `files/${folder}`;
        sources.push({ src: dir, dest });
      }
      exportTools.push({
        name: t.name,
        category: catMap.get(t.category_id) || "未分类",
        description: t.description,
        icon: t.icon,
        download_url: t.download_url,
        install_type: "custom" as const,
        install_command: t.install_command,
        verify_command: t.verify_command,
        commands: t.commands.map((c) => ({
          label: c.label,
          command: c.command,
          windows_command: c.windows_command,
        })),
        note: t.note,
        files: dest,
      });
    }

    const data = {
      version: "1.1",
      exported_at: new Date().toISOString().slice(0, 10),
      tools: exportTools,
    };

    const path = await save({
      defaultPath: "commanddeck-tools.zip",
      filters: [{ name: "CommandDeck 工具包", extensions: ["zip"] }],
    });

    if (path) {
      await exportPack(path, JSON.stringify(data, null, 2), sources);
      close();
    }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={overlayRef} className="cd-overlay z-50">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="export-title" className="cd-dialog max-w-lg">
        <div className="flex items-center justify-between border-b border-gray-750 px-5 py-4">
          <div><h2 id="export-title" className="text-sm font-semibold text-gray-100">导出工具</h2><p className="mt-0.5 text-[11px] text-gray-500">打包 JSON 配置和工具目录里的文件</p></div>
          <button type="button" onClick={close} disabled={exporting} className="cd-btn h-7 w-7 p-0" aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tools.map((tool) => (
            <label
              key={tool.id}
              className="cd-row flex cursor-pointer items-center gap-3 px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={selected.has(tool.id)}
                onChange={() => toggle(tool.id)}
                className="rounded"
              />
              {tool.icon && <img src={tool.icon} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />}
              <span className="text-sm">{tool.name}</span>
            </label>
          ))}
          {tools.length === 0 && <div className="py-10 text-center text-sm text-gray-500">当前没有可导出的工具</div>}
          {error && <div className="border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
          <span className="text-xs text-gray-400">
            已选 {selected.size} 个工具
          </span>
          <div className="flex gap-2">
            <button type="button"
              onClick={close}
              disabled={exporting}
              className="cd-btn"
            >
              取消
            </button>
            <button type="button"
              onClick={handleExport}
              disabled={selected.size === 0 || exporting}
              className="cd-btn cd-btn-primary"
            >
              {exporting ? "导出中…" : "导出"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
