import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { MarkdownContent } from "../MarkdownContent";

interface Props {
  toolId: string;
  compact?: boolean;
}

export function NoteEditor({ toolId, compact }: Props) {
  const tool = useStore((s) => s.tools.find((t) => t.id === toolId));
  const updateTool = useStore((s) => s.updateTool);
  const runRawCommand = useStore((s) => s.runRawCommand);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tool?.note || "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setDraft(tool?.note || "");
    dirtyRef.current = false;
    setStatus("idle");
    setEditing(false);
  }, [toolId]);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  if (!tool) return null;

  const saveNote = async (value: string, revision: number) => {
    setStatus("saving");
    try {
      await updateTool(toolId, { note: value });
      if (revisionRef.current === revision) {
        dirtyRef.current = false;
        setStatus("saved");
      }
      return true;
    } catch {
      if (revisionRef.current === revision) setStatus("error");
      return false;
    }
  };

  const handleChange = (value: string) => {
    if (!editing) return;
    setDraft(value);
    dirtyRef.current = true;
    const revision = ++revisionRef.current;
    setStatus("idle");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (dirtyRef.current) void saveNote(value, revision);
    }, 400);
  };

  const lockAfterSave = async () => {
    clearTimeout(saveTimerRef.current);
    if (dirtyRef.current) {
      const ok = await saveNote(draft, revisionRef.current);
      if (!ok) return;
    }
    setEditing(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[11px] ${status === "error" ? "text-red-300" : "text-gray-500"}`}>
          {editing
            ? status === "saving"
              ? "正在保存…"
              : status === "saved"
                ? "已自动保存"
                : status === "error"
                  ? "自动保存失败，请检查工作目录"
                  : "编辑中，自动保存。关掉开关后锁定，防止误改"
            : "已锁定，打开编辑才能修改"}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
          <span>{editing ? "编辑中" : "编辑"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={editing}
            onClick={() => {
              if (editing) {
                void lockAfterSave();
                return;
              }
              setDraft(tool.note || draft);
              setEditing(true);
            }}
            className={`relative h-5 w-9 rounded-full transition ${editing ? "bg-brand-500" : "bg-gray-700"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${editing ? "left-4" : "left-0.5"}`}
            />
          </button>
        </label>
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            if (dirtyRef.current) {
              clearTimeout(saveTimerRef.current);
              void saveNote(draft, revisionRef.current);
            }
          }}
          className={`cd-field resize-y font-mono leading-6 ${
            compact ? "min-h-[140px] text-xs" : "min-h-[220px] text-sm"
          }`}
          placeholder="写笔记（Markdown）…"
          autoFocus
        />
      ) : (
        <div className="cd-panel p-3">
          {draft.trim() ? (
            <MarkdownContent onRun={(command) => { void runRawCommand(toolId, command); }}>
              {draft}
            </MarkdownContent>
          ) : (
            <p className="text-xs text-gray-600">暂无笔记，打开编辑开始写</p>
          )}
        </div>
      )}
    </div>
  );
}
