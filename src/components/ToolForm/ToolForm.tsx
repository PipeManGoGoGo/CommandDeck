import { useState } from "react";
import { useStore } from "../../store";
import type { Command } from "../../types";
import { confirm } from "@tauri-apps/plugin-dialog";

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
  const deleteTool = useStore((s) => s.deleteTool);
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isWindows = navigator.userAgent.includes("Windows");

  const isEdit = !!tool;

  const handleSave = async () => {
    if (!name.trim() || !catId || saving) return;

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      category_id: catId,
      commands: commands
        .filter((command) => command.command.trim())
        .map((command) => ({
          ...command,
          label: command.label.trim() || "默认",
          command: command.command.trim(),
        })),
      note: note.trim() || undefined,
      install_command: installCommand.trim() || undefined,
      download_url: downloadUrl.trim() || undefined,
      verify_command: verifyCommand.trim() || undefined,
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

  const updateCommand = (id: string, field: "label" | "command", value: string) => {
    setCommands(commands.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeCommand = (id: string) => {
    setCommands(commands.filter((c) => c.id !== id));
  };

  const handleDelete = async () => {
    if (!tool || deleting) return;
    const accepted = await confirm(`确定删除“${tool.name}”吗？此操作不会删除磁盘上的工具文件。`, {
      title: "删除工具",
      kind: "warning",
    });
    if (!accepted) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await deleteTool(tool.id);
      backToCatalog();
    } catch (error) {
      setSaveError(String(error));
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 flex items-start justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-400">Tool profile</p>
            <h1 className="text-xl font-semibold text-gray-100">
              {isEdit ? `编辑 ${tool.name}` : "添加新工具"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">配置工具信息、启动方式与随手笔记。</p>
          </div>
          <button type="button" onClick={backToCatalog} className="rounded-lg border border-gray-750 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-850 hover:text-gray-100">取消</button>
        </div>

      <div className="space-y-5 rounded-2xl border border-gray-750 bg-gray-850/60 p-6 shadow-panel">
        <Field label="工具名称" hint="必填">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="如 sqlmap" />
        </Field>

        <Field label="描述">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="简要说明" />
        </Field>

        <Field label="图标 URL" hint="可选，支持 HTTPS 或 data URL">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-750 bg-gray-925 text-xs text-gray-600">
              {icon ? <img src={icon} alt="图标预览" className="h-6 w-6 object-contain" /> : "ICON"}
            </div>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={`${inputCls} min-w-0`} placeholder="https://example.com/icon.png" />
          </div>
        </Field>

        <Field label="分类">
          <select value={catId} onChange={(e) => setCatId(e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="启动命令" hint="macOS 使用默认 Shell，Windows 使用 PowerShell">
          <div className="space-y-2">
            {commands.map((cmd) => (
              <div key={cmd.id} className="flex gap-2">
                <input
                  value={cmd.label}
                  onChange={(e) => updateCommand(cmd.id, "label", e.target.value)}
                  className={`${inputCls} !w-24 shrink-0`}
                  placeholder="标签"
                />
                <input
                  value={cmd.command}
                  onChange={(e) => updateCommand(cmd.id, "command", e.target.value)}
                  className={`${inputCls} flex-1 font-mono text-xs`}
                  placeholder={isWindows ? "cd C:\\Tools\\tool; .\\tool.exe -h" : "cd /opt/tool && ./tool -h"}
                />
                {commands.length > 1 && (
                  <button type="button" onClick={() => removeCommand(cmd.id)} className="rounded-lg px-2 text-red-400 hover:bg-red-400/10 hover:text-red-300" aria-label="删除命令">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addCommand} className="text-xs font-medium text-brand-400 hover:text-brand-300">+ 添加命令</button>
          </div>
        </Field>

        <Field label="下载地址 (可选)">
          <input value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder="https://github.com/..." />
        </Field>

        <Field label="安装命令 (可选)">
          <textarea value={installCommand} onChange={(e) => setInstallCommand(e.target.value)} className={`${inputCls} font-mono text-xs min-h-[60px]`} placeholder={isWindows ? "cd {{TOOL_DIR}}; git clone ..." : "cd {{TOOL_DIR}} && git clone ..."} />
        </Field>

        <Field label="验证命令 (可选)">
          <input value={verifyCommand} onChange={(e) => setVerifyCommand(e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder="tool --version" />
        </Field>

        <Field label="笔记 (Markdown)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} font-mono text-xs min-h-[150px]`} placeholder="使用技巧、参数备忘..." />
        </Field>

        {saveError && <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">保存失败：{saveError}</div>}

        <div className="flex gap-2 border-t border-gray-750 pt-5">
          <button type="button" onClick={handleSave} disabled={!name.trim() || !catId || saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "保存中…" : isEdit ? "保存修改" : "创建工具"}
          </button>
          <button type="button" onClick={backToCatalog} className="rounded-lg border border-gray-750 bg-gray-850 px-4 py-2 text-sm text-gray-400 hover:bg-gray-750 hover:text-gray-100">
            取消
          </button>
          {isEdit && <button type="button" onClick={handleDelete} disabled={deleting || saving} className="ml-auto rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40">{deleting ? "删除中…" : "删除工具"}</button>}
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

const inputCls = "w-full rounded-lg border border-gray-750 bg-gray-925 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/15";
