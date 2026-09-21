import { useEffect, useState } from "react";
import { useOverlayController } from "../../motion";
import { useStore } from "../../store";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { ExportedTool, ImportToolInput, NameConflictPolicy } from "../../types";
import { copyDir, extractPack, removeImportTemp } from "../../utils/tauri";
import { defaultToolDir, joinPath, uniqueToolName } from "../../utils/command";

interface Props {
  onClose: () => void;
}

interface ImportToolState extends ImportToolInput {
  selected: boolean;
  conflict: boolean;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
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
        typeof command.command === "string" &&
        (command.windows_command === undefined || typeof command.windows_command === "string")
    )
  );
}

function toImportInput(tool: ExportedTool): ImportToolInput {
  return {
    name: tool.name.trim(),
    category: tool.category.trim() || "其他工具",
    description: optionalString(tool.description),
    icon: optionalString(tool.icon),
    download_url: optionalString(tool.download_url),
    install_command: optionalString(tool.install_command),
    verify_command: optionalString(tool.verify_command),
    commands: tool.commands.map((command) => ({
      label: command.label,
      command: command.command,
      windows_command: optionalString(command.windows_command),
    })),
    note: optionalString(tool.note),
    files: optionalString(tool.files),
  };
}

export function ImportModal({ onClose }: Props) {
  const tools = useStore((s) => s.tools) ?? [];
  const workspace = useStore((s) => s.settings?.baseDir);
  const importToolsBatch = useStore((s) => s.importTools);
  const [packRoot, setPackRoot] = useState<string | null>(null);
  const [importTools, setImportTools] = useState<ImportToolState[]>([]);
  const [policy, setPolicy] = useState<NameConflictPolicy>("skip");
  const [step, setStep] = useState<"select" | "preview" | "importing">("select");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const cleanTemp = () => {
    if (!workspace) return;
    void removeImportTemp(joinPath(workspace, ".commanddeck-import")).catch(() => {});
  };

  const { overlayRef, panelRef, close: motionClose } = useOverlayController(() => {
    cleanTemp();
    onClose();
  });

  const close = () => {
    if (step === "importing") return;
    motionClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && step !== "importing") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, workspace]);

  const handleSelectFile = async () => {
    setError(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "CommandDeck 工具包", extensions: ["zip", "json"] }],
      });
      if (!path || Array.isArray(path)) return;

      let content: string;
      if (path.toLowerCase().endsWith(".zip")) {
        if (!workspace) throw new Error("请先选择工作目录");
        const dest = joinPath(workspace, ".commanddeck-import");
        const extracted = await extractPack(path, dest);
        content = extracted.manifest;
        setPackRoot(extracted.root);
      } else {
        setPackRoot(null);
        content = await readTextFile(path);
      }
      const data: unknown = JSON.parse(content);
      const rawTools =
        data && typeof data === "object" && Array.isArray((data as { tools?: unknown }).tools)
          ? (data as { tools: unknown[] }).tools
          : [];
      const exported = rawTools.filter(isExportedTool);
      if (exported.length === 0) {
        cleanTemp();
        throw new Error("文件中没有可导入的有效工具");
      }

      const existingNames = new Set(tools.map((tool) => tool.name.toLocaleLowerCase()));
      setImportTools(
        exported.map((tool) => {
          const item = toImportInput(tool);
          const conflict = existingNames.has(item.name.toLocaleLowerCase());
          return { ...item, selected: !conflict, conflict };
        })
      );
      setStep("preview");
    } catch (selectError) {
      cleanTemp();
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
      setProgress("正在写入工具配置…");
      const result = await importToolsBatch(
        selectedTools.map(({ selected: _selected, conflict: _conflict, ...item }) => item),
        policy
      );
      if (packRoot && workspace) {
        const existingLower = new Set(tools.map((tool) => tool.name.toLocaleLowerCase()));
        for (const item of selectedTools) {
          if (!item.files) continue;
          if (item.conflict && policy === "skip") continue;
          const name =
            item.conflict && policy === "rename"
              ? uniqueToolName(item.name.trim(), existingLower)
              : item.name.trim();
          existingLower.add(name.toLocaleLowerCase());
          await copyDir(joinPath(packRoot, item.files), defaultToolDir(workspace, name));
        }
      }
      if (workspace) {
        await removeImportTemp(joinPath(workspace, ".commanddeck-import")).catch(() => {});
      }
      setProgress(
        `已导入 ${result.imported} 个；跳过 ${result.skipped}，重命名 ${result.renamed}，覆盖 ${result.overwritten}`
      );
      window.setTimeout(onClose, 800);
    } catch (importError) {
      cleanTemp();
      setError(importError instanceof Error ? importError.message : String(importError));
      setStep("preview");
    }
  };

  const selectedCount = importTools.filter((tool) => tool.selected).length;
  const conflictCount = importTools.filter((tool) => tool.selected && tool.conflict).length;

  return (
    <div ref={overlayRef} className="cd-overlay z-50" role="presentation">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="import-title" className="cd-dialog max-w-xl">
        <div className="flex items-center justify-between border-b border-gray-750 px-5 py-4">
          <div><h2 id="import-title" className="text-sm font-semibold text-gray-100">导入工具包</h2><p className="mt-0.5 text-[11px] text-gray-500">支持 zip（配置+文件）或旧版 json</p></div>
          <button type="button" onClick={close} disabled={step === "importing"} className="cd-btn h-7 w-7 p-0" aria-label="关闭">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === "select" && (
            <div className="py-6">
              <button
                type="button"
                onClick={handleSelectFile}
                className="cd-btn h-auto border-dashed px-6 py-3 text-sm"
              >
                选择 .zip 或 .json 工具包
              </button>
              <p className="mt-3 text-xs text-gray-600">zip 会带上工具目录文件；纯 json 仍可导入配置。</p>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="text-xs text-gray-400">
                共 {importTools.length} 个有效工具；同名工具已标记冲突
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {([
                  ["skip", "跳过同名"],
                  ["rename", "重命名导入"],
                  ["overwrite", "覆盖同名"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPolicy(value)}
                    className={`rounded-full border px-2.5 py-1 ${
                      policy === value
                        ? "border-brand-400/40 bg-brand-500/10 text-brand-300"
                        : "border-gray-750 text-gray-500 hover:text-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {importTools.map((t, i) => (
                <label
                  key={`${t.name}-${i}`}
                  className="cd-row flex cursor-pointer items-start gap-3 border border-transparent px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={t.selected}
                    onChange={() => toggleTool(i)}
                    className="mt-1"
                  />
                  {t.icon && <img src={t.icon} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t.name}</span>
                      <span className="text-xs text-gray-500">{t.category}</span>
                      {t.conflict && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">同名</span>}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-gray-600">
                      {t.commands[0]?.command || "无启动命令"}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === "importing" && (
            <div className="text-center py-8">
              <div className="cd-spin mx-auto mb-4 h-6 w-6 rounded-full border-2 border-gray-700 border-t-brand-400" />
              <div className="text-sm text-gray-300">{progress}</div>
            </div>
          )}
          {error && <div className="mt-4 border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-750 px-5 py-3.5">
          <span className="text-xs text-gray-500">
            {step === "preview" ? `已选 ${selectedCount} 个${conflictCount ? `，其中 ${conflictCount} 个同名` : ""}` : "本地导入"}
          </span>
          <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            disabled={step === "importing"}
            className="cd-btn"
          >
            取消
          </button>
          {step === "preview" && (
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="cd-btn cd-btn-primary"
            >
              导入配置
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
