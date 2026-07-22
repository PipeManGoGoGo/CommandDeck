import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store";
import { MarkdownContent } from "../MarkdownContent";

interface Props {
  toolId: string;
}

export function ToolDetail({ toolId }: Props) {
  const tool = useStore((s) => s.tools.find((t) => t.id === toolId));
  const updateTool = useStore((s) => s.updateTool);
  const runCommand = useStore((s) => s.runCommand);
  const openToolForm = useStore((s) => s.openToolForm);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!tool?.note) setEditing(true);
  }, [tool?.id]);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  if (!tool) return <div className="p-4 text-gray-400">工具未找到</div>;

  const saveNote = async (value: string, revision: number) => {
    setNoteStatus("saving");
    try {
      await updateTool(toolId, { note: value });
      if (revisionRef.current === revision) {
        dirtyRef.current = false;
        setNoteStatus("saved");
      }
      return true;
    } catch {
      if (revisionRef.current === revision) setNoteStatus("error");
      return false;
    }
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    dirtyRef.current = true;
    const revision = ++revisionRef.current;
    setNoteStatus("idle");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (dirtyRef.current) {
        void saveNote(val, revision);
      }
    }, 500);
  };

  const handleBlur = () => {
    if (dirtyRef.current) {
      clearTimeout(saveTimerRef.current);
      void saveNote(draft, revisionRef.current);
    }
  };

  const startEdit = () => {
    setDraft(tool.note || "");
    dirtyRef.current = false;
    setEditing(true);
  };

  const handleRun = async (commandId: string) => {
    setRunningCommandId(commandId);
    setRunError(null);
    try {
      await runCommand(toolId, commandId);
    } catch (error) {
      setRunError(String(error));
    } finally {
      setRunningCommandId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-7">
      <div className="mx-auto max-w-4xl">
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">工作笔记</h2>
            <p className={`mt-0.5 text-[11px] ${noteStatus === "error" ? "text-red-300" : "text-gray-500"}`}>
              {noteStatus === "saving" ? "正在保存…" : noteStatus === "saved" ? "已自动保存" : noteStatus === "error" ? "自动保存失败，请检查工作目录" : "自动保存，支持 Markdown"}
            </p>
          </div>
          {editing ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={async () => {
                clearTimeout(saveTimerRef.current);
                const saved = dirtyRef.current
                  ? await saveNote(draft, revisionRef.current)
                  : true;
                if (saved) setEditing(false);
              }}
              className="rounded-lg border border-gray-750 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-850 hover:text-gray-100"
            >
              预览
            </button>
          ) : !editing ? (
            <button
              onClick={startEdit}
              className="rounded-lg border border-gray-750 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-850 hover:text-gray-100"
            >
              编辑
            </button>
          ) : null}
        </div>
        <div className="rounded-xl border border-gray-750 bg-gray-850/70 p-4 shadow-sm">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onBlur={handleBlur}
              className="min-h-[220px] w-full resize-y rounded-lg border border-gray-800 bg-gray-950 p-3 font-mono text-sm leading-6 text-gray-100 placeholder-gray-600 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              placeholder="输入笔记... (Markdown)"
              autoFocus
            />
          ) : tool.note ? (
            <MarkdownContent>{tool.note}</MarkdownContent>
          ) : (
            <p className="text-sm text-gray-500">暂无笔记</p>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">启动命令</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">将在当前工作目录中打开独立终端</p>
          </div>
          <button
            onClick={() => openToolForm(tool.id)}
            className="rounded-lg border border-gray-750 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-850 hover:text-gray-100"
          >
            编辑工具
          </button>
        </div>
        {runError && <div className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">启动失败：{runError}</div>}
        <div className="space-y-2.5">
          {tool.commands.map((cmd) => (
            <div
              key={cmd.id}
              className="flex items-center justify-between rounded-xl border border-gray-750 bg-gray-850/70 p-3.5 transition hover:border-gray-600"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{cmd.label}</div>
                <div className="mt-1 truncate font-mono text-xs text-gray-500">
                  {cmd.command}
                </div>
              </div>
              <button
                onClick={() => handleRun(cmd.id)}
                disabled={runningCommandId !== null}
                className="ml-3 shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-500 disabled:cursor-wait disabled:opacity-60"
              >
                {runningCommandId === cmd.id ? "启动中…" : "▶ 运行"}
              </button>
            </div>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
