import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { ToolDetail } from "../ToolDetail";
import { Terminal } from "../Terminal";
import { NotesPanel } from "../NotesPanel";

interface Props {
  toolId: string;
}

export function ToolView({ toolId }: Props) {
  const tool = useStore((s) => s.tools.find((t) => t.id === toolId));
  const category = useStore((s) =>
    s.categories.find((c) => c.id === tool?.category_id)
  );
  const tv = useStore((s) => s.toolViews[toolId]);
  const backToCatalog = useStore((s) => s.backToCatalog);
  const setToolSubTab = useStore((s) => s.setToolSubTab);
  const runCommand = useStore((s) => s.runCommand);
  const closeTerminal = useStore((s) => s.closeTerminal);
  const restartTerminal = useStore((s) => s.restartTerminal);
  const [showNotes, setShowNotes] = useState(false);

  const terminals = tv?.terminals || [];
  const activeSubTab = tv?.activeSubTab || "detail";
  const runningCount = terminals.filter((t) => t.alive).length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e" && activeSubTab !== "detail") {
        event.preventDefault();
        setShowNotes((visible) => !visible);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSubTab]);

  if (!tool) return <div className="p-4 text-gray-400">工具未找到</div>;

  const handleCloseTerminal = async (termId: string) => {
    await closeTerminal(toolId, termId);
  };

  const handleAddTerminal = async () => {
    if (tool.commands.length > 0) {
      await runCommand(toolId, tool.commands[0].id);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex min-h-[61px] items-center justify-between border-b border-gray-800 bg-gray-925/75 px-5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={backToCatalog}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-750 text-gray-400 transition hover:bg-gray-850 hover:text-gray-100"
            aria-label="返回工具库"
            title={category?.name || "返回工具库"}
          >
            &larr;
          </button>
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-gray-100">{tool.name}</span>
            <span className="block truncate text-[11px] text-gray-500">{category?.name || "未分类"}</span>
          </div>
        </div>
        {runningCount > 0 && (
          <span className="ml-2 flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {runningCount} 个进程运行中
          </span>
        )}
      </div>

      {/* Sub-tab bar */}
      <div className="flex min-h-[38px] items-end border-b border-gray-800 bg-gray-925 shrink-0 overflow-x-auto px-2">
        <button
          onClick={() => setToolSubTab(toolId, "detail")}
          className={`relative shrink-0 px-3 py-2 text-xs transition-colors ${
            activeSubTab === "detail"
              ? "text-brand-300 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-400"
              : "text-gray-500 hover:text-gray-200"
          }`}
        >
          详情
        </button>

        {terminals.map((t) => (
          <div
            key={t.id}
            className={`relative flex shrink-0 cursor-pointer items-center px-3 py-2 text-xs transition-colors ${
              activeSubTab === t.id
                ? "text-brand-300 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-400"
                : "text-gray-500 hover:text-gray-200"
            }`}
            onClick={() => setToolSubTab(toolId, t.id)}
          >
            <span className={t.alive ? "" : "text-gray-600"}>
              #{t.num} {t.commandLabel}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTerminal(t.id);
              }}
              className="ml-2 rounded p-0.5 text-gray-600 hover:bg-red-400/10 hover:text-red-300"
              title="关闭终端"
            >
              &times;
            </button>
          </div>
        ))}

        {tool.commands.length > 0 && (
          <button
            onClick={handleAddTerminal}
            className="mb-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs text-gray-500 hover:bg-gray-850 hover:text-brand-300"
            title="新建终端"
          >
            +
          </button>
        )}

        {terminals.length > 0 && (
          <button
            type="button"
            onClick={() => setShowNotes((visible) => !visible)}
            aria-pressed={showNotes}
            className={`mb-1 ml-auto shrink-0 rounded-md px-2 py-1 text-xs transition-colors ${
              showNotes ? "bg-brand-500/10 text-brand-300" : "text-gray-500 hover:bg-gray-850 hover:text-gray-200"
            }`}
            title="快速查看笔记（Cmd/Ctrl+E）"
          >
            📝 笔记
          </button>
        )}
      </div>

      {/* Content — all panels always mounted, inactive ones hidden */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Detail panel */}
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ display: activeSubTab === "detail" ? undefined : "none" }}
        >
          <ToolDetail toolId={toolId} />
        </div>

        {/* Terminal panels */}
        {terminals.map((term) => (
          <div
            key={term.id}
            className="flex-1 flex flex-col min-h-0"
            style={{ display: activeSubTab === term.id ? undefined : "none" }}
          >
            <div className="flex min-h-[40px] items-center gap-2 border-b border-gray-800 bg-gray-850 px-3 shrink-0">
              <button
                onClick={() => restartTerminal(toolId, term.id)}
                className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-750 hover:text-gray-100"
                title="重启终端"
              >
                重启
              </button>
              <button
                onClick={() => handleCloseTerminal(term.id)}
                className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 hover:text-red-300"
                title="停止终端"
              >
                停止
              </button>
              {!term.alive && (
                <span className="text-xs text-gray-500">进程已退出</span>
              )}
            </div>
            <Terminal terminalId={term.id} />
          </div>
        ))}
        </div>
        {showNotes && activeSubTab !== "detail" && <NotesPanel toolId={toolId} onClose={() => setShowNotes(false)} />}
      </div>
    </div>
  );
}
