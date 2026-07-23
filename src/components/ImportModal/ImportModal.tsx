import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { ExportedTool } from "../../types";

interface Props {
  onClose: () => void;
}

interface ImportToolState extends ExportedTool {
  selected: boolean;
}

function isExportedTool(value: unknown): value is ExportedTool {
  if (!value || typeof value !== "object") return false;
  const tool = value as Partial<ExportedTool>;
  return (
    typeof tool.name === "string" &&
    tool.name.trim().length > 0 &&
    typeof tool.category === "string" &&
    (tool.icon === undefined || typeof tool.icon === "string") &&
    Array.isArray(tool.commands) &&
    tool.commands.every(
      (command) =>
        command &&
        typeof command.label === "string" &&
        typeof command.command === "string"
    )
  );
}

export function ImportModal({ onClose }: Props) {
  const categories = useStore((s) => s.categories);
  const addCategory = useStore((s) => s.addCategory);
  const addTool = useStore((s) => s.addTool);
  const tools = useStore((s) => s.tools) ?? [];
  const settings = useStore((s) => s.settings);

  const [importTools, setImportTools] = useState<ImportToolState[]>([]);
  const [step, setStep] = useState<"select" | "preview" | "importing">("select");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && step !== "importing") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, step]);

  const handleSelectFile = async () => {
    setError(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "CommandDeck 工具包", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;

      const content = await readTextFile(path);
      const data: unknown = JSON.parse(content);
      const rawTools =
        data && typeof data === "object" && Array.isArray((data as { tools?: unknown }).tools)
          ? (data as { tools: unknown[] }).tools
          : [];
      const exported = rawTools.filter(isExportedTool);
      if (exported.length === 0) {
        throw new Error("文件中没有可导入的有效工具");
      }

      const existingNames = new Set(tools.map((tool) => tool.name.toLocaleLowerCase()));
      setImportTools(
        exported.map((tool) => ({
          ...tool,
          selected: !existingNames.has(tool.name.toLocaleLowerCase()),
        }))
      );
      setStep("preview");
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : String(selectError));
    }
  };

  const toggleTool = (index: number) => {
    setImportTools((prev) =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    );
  };

  const handleImport = async () => {
    const selectedTools = importTools.filter((tool) => tool.selected);
    if (selectedTools.length === 0) return;
    setStep("importing");
    setError(null);
    try {
      const catMap = new Map(categories.map((category) => [category.name, category.id]));
      const separator = navigator.userAgent.includes("Windows") ? "\\" : "/";
      const root = settings?.baseDir.replace(/[\\/]+$/, "") || "";

      for (const categoryName of new Set(selectedTools.map((tool) => tool.category.trim()).filter(Boolean))) {
        if (catMap.has(categoryName)) continue;
        await addCategory(categoryName);
        const created = useStore.getState().categories.find((category) => category.name === categoryName);
        if (created) catMap.set(categoryName, created.id);
      }

      for (const importedTool of selectedTools) {
        const catId = catMap.get(importedTool.category) || categories[0]?.id;
        if (!catId) throw new Error("请先创建至少一个工具分类");

        setProgress(`正在添加 ${importedTool.name}…`);
        const safeName = importedTool.name.replace(/[\\/:*?"<>|]/g, "-");
        const toolDir = [root, "tools", safeName].filter(Boolean).join(separator);
        const replaceVariables = (value: string) =>
          value
            .replace(/\{\{TOOL_DIR\}\}/g, toolDir)
            .replace(/\{\{DOWNLOAD_URL\}\}/g, importedTool.download_url || "");

        await addTool({
          name: importedTool.name.trim(),
          category_id: catId,
          description: importedTool.description,
          icon: importedTool.icon,
          commands: importedTool.commands.map((command) => ({
            id: crypto.randomUUID(),
            label: command.label,
            command: replaceVariables(command.command),
          })),
          note: importedTool.note,
          install_command: importedTool.install_command
            ? replaceVariables(importedTool.install_command)
            : undefined,
          download_url: importedTool.download_url,
          verify_command: importedTool.verify_command,
        });
      }

      setProgress(`已导入 ${selectedTools.length} 个工具`);
      window.setTimeout(onClose, 650);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
      setStep("preview");
    }
  };

  const selectedCount = importTools.filter((tool) => tool.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-750 bg-gray-850 shadow-panel">
        <div className="flex items-center justify-between border-b border-gray-750 px-5 py-4">
          <div><h2 id="import-title" className="text-sm font-semibold text-gray-100">导入工具包</h2><p className="mt-0.5 text-[11px] text-gray-500">读取 CommandDeck JSON 配置（兼容 SecBox）</p></div>
          <button type="button" onClick={onClose} disabled={step === "importing"} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-750 hover:text-gray-200 disabled:opacity-40" aria-label="关闭">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === "select" && (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-500/10 text-brand-300">⇧</div>
              <button
                type="button"
                onClick={handleSelectFile}
                className="rounded-xl border border-dashed border-gray-600 bg-gray-925 px-6 py-3 text-sm text-gray-200 transition hover:border-brand-400/40 hover:bg-gray-950"
              >
                选择 .json 工具包
              </button>
              <p className="mt-3 text-xs text-gray-600">导入只添加工具配置，不会自动执行安装命令。</p>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="text-xs text-gray-400 mb-2">
                共 {importTools.length} 个有效工具；同名工具默认不选中
              </div>
              {importTools.map((t, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-gray-925 px-3 py-2.5 hover:border-gray-700 hover:bg-gray-950"
                >
                  <input
                    type="checkbox"
                    checked={t.selected}
                    onChange={() => toggleTool(i)}
                  />
                  {t.icon && <img src={t.icon} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{t.name}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {t.category}
                    </span>
                  </div>
                </label>
              ))}

            </div>
          )}

          {step === "importing" && (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-brand-400" />
              <div className="text-sm text-gray-300">{progress}</div>
            </div>
          )}
          {error && <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-750 px-5 py-3.5">
          <span className="text-xs text-gray-500">{step === "preview" ? `已选 ${selectedCount} 个` : "本地导入"}</span>
          <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={step === "importing"}
            className="rounded-lg border border-gray-750 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-750 hover:text-gray-100 disabled:opacity-40"
          >
            取消
          </button>
          {step === "preview" && (
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              导入
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
