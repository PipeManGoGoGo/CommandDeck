import { useState, useEffect } from "react";
import { useStore } from "../../store";
import { NoteEditor } from "../NoteEditor";
import { openExternal, pathExists } from "../../utils/tauri";
import { defaultToolDir, pickCommandText } from "../../utils/command";
import type { PathStatus } from "../../types";

interface Props {
  toolId: string;
}

export function ToolDetail({ toolId }: Props) {
  const tool = useStore((s) => s.tools.find((t) => t.id === toolId));
  const workspace = useStore((s) => s.settings?.baseDir);
  const runCommand = useStore((s) => s.runCommand);
  const openToolForm = useStore((s) => s.openToolForm);

  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [extraArgs, setExtraArgs] = useState<Record<string, string>>({});
  const [pathStatus, setPathStatus] = useState<PathStatus>("unlocated");

  const explicitDir = tool?.working_dir?.trim() || "";
  const toolDir = explicitDir || (tool && workspace ? defaultToolDir(workspace, tool.name) : "");

  useEffect(() => {
    if (!toolDir) {
      setPathStatus("unlocated");
      return;
    }
    let cancelled = false;
    pathExists(toolDir)
      .then((exists) => {
        if (!cancelled) setPathStatus(exists ? "ready" : explicitDir ? "missing" : "unlocated");
      })
      .catch(() => {
        if (!cancelled) setPathStatus(explicitDir ? "missing" : "unlocated");
      });
    return () => {
      cancelled = true;
    };
  }, [toolDir, explicitDir]);

  if (!tool) return <div className="p-4 text-gray-400">工具未找到</div>;

  const handleRun = async (commandId: string) => {
    setRunningCommandId(commandId);
    setRunError(null);
    try {
      await runCommand(toolId, commandId, extraArgs[commandId]);
    } catch (error) {
      setRunError(String(error));
    } finally {
      setRunningCommandId(null);
    }
  };

  const pathLabel =
    pathStatus === "ready" ? "已定位" : pathStatus === "missing" ? "路径不存在" : "未定位";
  const pathClass =
    pathStatus === "ready"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : pathStatus === "missing"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
        : "border-gray-700 bg-gray-850 text-gray-400";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-4xl">
      <section className="cd-panel mb-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">本地工作目录</p>
            <p className="mt-1 truncate font-mono text-xs text-gray-300">{toolDir || "尚未选择工作区"}</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${pathClass}`}>{pathLabel}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openToolForm(tool.id)}
            className="cd-btn"
          >
            {tool.working_dir ? "更改路径" : "定位本地目录"}
          </button>
          {tool.download_url && (
            <button
              type="button"
              onClick={() => { void openExternal(tool.download_url!).catch((error) => setRunError(String(error))); }}
              className="cd-btn"
            >
              打开参考链接
            </button>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-200">工作笔记</h2>
        <div className="cd-panel p-4">
          <NoteEditor toolId={toolId} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">启动命令</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">在工具本地目录打开独立终端，变量运行时展开</p>
          </div>
          <button
            onClick={() => openToolForm(tool.id)}
            className="cd-btn"
          >
            编辑工具
          </button>
        </div>
        {runError && <div className="mb-3 border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">启动失败：{runError}</div>}
        <div className="space-y-2.5">
          {tool.commands.map((cmd) => (
            <div
              key={cmd.id}
              className="cd-panel p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{cmd.label}</div>
                  <div className="mt-1 truncate font-mono text-xs text-gray-500">
                    {pickCommandText(cmd)}
                  </div>
                </div>
                <button
                  onClick={() => handleRun(cmd.id)}
                  disabled={runningCommandId !== null}
                  className="cd-btn cd-btn-primary ml-3 shrink-0"
                >
                  {runningCommandId === cmd.id ? "启动中…" : "▶ 运行"}
                </button>
              </div>
              <input
                value={extraArgs[cmd.id] || ""}
                onChange={(event) => setExtraArgs((current) => ({ ...current, [cmd.id]: event.target.value }))}
                className="cd-field mt-2 font-mono text-xs"
                placeholder="可选附加参数，例如 --help 或目标路径"
              />
            </div>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
