import { useState } from "react";
import { usePageEnter } from "../../motion";
import { useStore } from "../../store";
import type { Command } from "../../types";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { defaultToolDir, isWindowsPlatform } from "../../utils/command";

import { ICON_ACCEPT, prepareIcon } from "../../utils/icon";

interface Props {
  toolId?: string;
  categoryId?: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

export function ToolForm({ toolId, categoryId }: Props) {
  const tool = useStore((s) => (s.tools ?? []).find((t) => t.id === toolId));
  const categories = useStore((s) => s.categories);
  const addTool = useStore((s) => s.addTool);
  const updateTool = useStore((s) => s.updateTool);
  const trashTool = useStore((s) => s.trashTool);
  const backToCatalog = useStore((s) => s.backToCatalog);

  const [name, setName] = useState(tool?.name || "");
  const [description, setDescription] = useState(tool?.description || "");
  const [icon, setIcon] = useState(tool?.icon || "");
  const [catId, setCatId] = useState(tool?.category_id || categoryId || categories[0]?.id || "");
  const [commands, setCommands] = useState<Command[]>(
    tool?.commands.length
      ? tool.commands
      : [{ id: generateId(), label: "默认", command: "" }]
  );
  const [note, setNote] = useState(tool?.note || "");
  const [installCommand, setInstallCommand] = useState(tool?.install_command || "");
  const [downloadUrl, setDownloadUrl] = useState(tool?.download_url || "");
  const [verifyCommand, setVerifyCommand] = useState(tool?.verify_command || "");
  const [workingDir, setWorkingDir] = useState(tool?.working_dir || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [processingIcon, setProcessingIcon] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isWindows = isWindowsPlatform();
  const workspace = useStore((s) => s.settings?.baseDir);
  const pageRef = usePageEnter<HTMLDivElement>();

  const isEdit = !!tool;

  const handleIconFile = async (file?: File) => {
    if (!file) return;
    setIconError(null);
    setProcessingIcon(true);
    try {
      setIcon(await prepareIcon(file));
    } catch (error) {
      setIconError(error instanceof Error ? error.message : String(error));
    } finally {
      setProcessingIcon(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !catId || saving) return;

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      category_id: catId,
      commands: commands
        .filter((command) => command.command.trim() || command.windows_command?.trim())
        .map((command) => ({
          ...command,
          label: command.label.trim() || "默认",
          command: command.command.trim(),
          windows_command: command.windows_command?.trim() || undefined,
        })),
      note: note.trim() || undefined,
      install_command: installCommand.trim() || undefined,
      download_url: downloadUrl.trim() || undefined,
      verify_command: verifyCommand.trim() || undefined,
      working_dir: workingDir.trim() || undefined,
    };

    setSaving(true);
    setSaveError(null);
    try {
      if (isEdit) {
        await updateTool(tool.id, data);
      } else {
        await addTool(data);
      }
      backToCatalog();
    } catch (error) {
      setSaveError(String(error));
    } finally {
      setSaving(false);
    }
  };

  const addCommand = () => {
    setCommands([...commands, { id: generateId(), label: "", command: "" }]);
  };

  const updateCommand = (id: string, field: "label" | "command" | "windows_command", value: string) => {
    setCommands(commands.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const chooseWorkingDir = async () => {
    const selected = await open({ directory: true });
    if (typeof selected === "string") setWorkingDir(selected);
  };

  const removeCommand = (id: string) => {
    setCommands(commands.filter((c) => c.id !== id));
  };

  const handleDelete = async () => {
    if (!tool || deleting) return;
    const accepted = await confirm(`把“${tool.name}”移到回收站？配置会保留，可从左下角还原。`, {
      title: "删除工具",
      kind: "warning",
    });
    if (!accepted) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await trashTool(tool.id);
    } catch (error) {
      setSaveError(String(error));
      setDeleting(false);
    }
  };

  return (
    <div ref={pageRef} className="flex-1 overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 flex items-start justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-400">工具</p>
            <h1 className="text-xl font-semibold text-gray-100">
              {isEdit ? `编辑 ${tool?.name || ""}` : "添加新工具"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">配置本地路径、启动命令与随手笔记。导入只保存配置，不会下载工具。</p>
          </div>
          <button type="button" onClick={backToCatalog} className="cd-btn">取消</button>
        </div>

      <div className="cd-panel space-y-5 p-6">
        <Field label="工具名称" hint="必填">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="如 sqlmap" />
        </Field>

        <Field label="描述">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="简要说明" />
        </Field>

        <Field label="工具图标" hint="可选。PNG / JPEG / WebP / SVG / ICO / ICNS 均可，会转成 PNG 预览">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-gray-800 bg-gray-950 text-xs text-gray-600">
              {icon ? (
                <img
                  src={icon}
                  alt="图标预览"
                  className="h-10 w-10 object-contain"
                  onLoad={() => setIconError(null)}
                  onError={() => setIconError("无法加载此图标，请检查 URL 或重新选择图片")}
                />
              ) : (
                <span className="text-lg font-bold text-brand-300">{name.trim().charAt(0).toUpperCase() || "?"}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <label className={`cd-btn cursor-pointer ${processingIcon ? "pointer-events-none opacity-50" : ""}`}>
                  {processingIcon ? "正在处理…" : "选择本地图片"}
                  <input
                    type="file"
                    accept={ICON_ACCEPT}
                    className="sr-only"
                    disabled={processingIcon}
                    onChange={(event) => {
                      void handleIconFile(event.currentTarget.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {icon && (
                  <button
                    type="button"
                    onClick={() => {
                      setIcon("");
                      setIconError(null);
                    }}
                    className="cd-btn cd-btn-danger"
                  >
                    移除图标
                  </button>
                )}
              </div>
              <input
                value={icon.startsWith("data:") ? "" : icon}
                onChange={(event) => {
                  setIcon(event.target.value);
                  setIconError(null);
                }}
                className={`${inputCls} min-w-0 font-mono text-xs`}
                placeholder={icon.startsWith("data:") ? "已选择本地图片；也可输入 URL 替换" : "或输入 https://example.com/icon.png"}
                aria-label="图标 URL"
              />
              {iconError && <p className="text-xs text-red-300">{iconError}</p>}
            </div>
          </div>
        </Field>

        <Field label="分类">
          <select value={catId} onChange={(e) => setCatId(e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="本地工作目录" hint="运行命令时的起始目录，可用 {{TOOL_DIR}}">
          <div className="flex gap-2">
            <input
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              className={`${inputCls} font-mono text-xs`}
              placeholder={workspace && name.trim() ? defaultToolDir(workspace, name.trim()) : "选择已有工具目录"}
            />
            <button type="button" onClick={() => { void chooseWorkingDir(); }} className="cd-btn shrink-0">
              定位
            </button>
          </div>
        </Field>

        <Field label="启动命令" hint="运行时展开 {{TOOL_DIR}} / {{WORKSPACE}} / {{DOWNLOAD_URL}}">
          <div className="space-y-3">
            {commands.map((cmd) => (
              <div key={cmd.id} className="cd-panel space-y-2 p-3">
                <div className="flex gap-2">
                  <input
                    value={cmd.label}
                    onChange={(e) => updateCommand(cmd.id, "label", e.target.value)}
                    className={`${inputCls} !w-24 shrink-0`}
                    placeholder="标签"
                  />
                  {commands.length > 1 && (
                    <button type="button" onClick={() => removeCommand(cmd.id)} className="cd-btn cd-btn-danger ml-auto h-6 px-2" aria-label="删除命令">✕</button>
                  )}
                </div>
                <input
                  value={cmd.command}
                  onChange={(e) => updateCommand(cmd.id, "command", e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                  placeholder="macOS / Linux：cd {{TOOL_DIR}} && ./tool -h"
                />
                <input
                  value={cmd.windows_command || ""}
                  onChange={(e) => updateCommand(cmd.id, "windows_command", e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                  placeholder="Windows PowerShell：cd {{TOOL_DIR}}; .\\tool.exe -h"
                />
              </div>
            ))}
            <button type="button" onClick={addCommand} className="text-xs font-medium text-brand-400 hover:text-brand-300">+ 添加命令</button>
            {isWindows && <p className="text-[11px] text-gray-600">当前系统会优先使用 Windows 命令；留空则回退到上方命令。</p>}
          </div>
        </Field>

        <Field label="参考链接 (可选)" hint="仅用于打开说明页，不会自动下载">
          <input value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder="https://github.com/..." />
        </Field>

        <Field label="安装备忘 (可选)" hint="不会自动执行，需要时在终端里自己运行">
          <textarea value={installCommand} onChange={(e) => setInstallCommand(e.target.value)} className={`${inputCls} font-mono text-xs min-h-[60px]`} placeholder={isWindows ? "cd {{TOOL_DIR}}; git clone ..." : "cd {{TOOL_DIR}} && git clone ..."} />
        </Field>

        <Field label="验证命令 (可选)" hint="用于确认本机路径可用，不会在导入时执行">
          <input value={verifyCommand} onChange={(e) => setVerifyCommand(e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder="tool --version" />
        </Field>

        <Field label="笔记 (Markdown)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} font-mono text-xs min-h-[150px]`} placeholder="使用技巧、参数备忘..." />
        </Field>

        {saveError && <div className="border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">保存失败：{saveError}</div>}

        <div className="flex gap-2 border-t border-gray-750 pt-5">
          <button type="button" onClick={handleSave} disabled={!name.trim() || !catId || saving || processingIcon || !!iconError} className="cd-btn cd-btn-primary h-9 px-5">
            {saving ? "保存中…" : isEdit ? "保存修改" : "创建工具"}
          </button>
          <button type="button" onClick={backToCatalog} className="cd-btn h-9 px-4">
            取消
          </button>
          {isEdit && <button type="button" onClick={handleDelete} disabled={deleting || saving} className="cd-btn cd-btn-danger ml-auto">{deleting ? "处理中…" : "移到回收站"}</button>}
        </div>
      </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="block text-xs font-medium text-gray-300">{label}</label>
        {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputCls = "cd-field";
