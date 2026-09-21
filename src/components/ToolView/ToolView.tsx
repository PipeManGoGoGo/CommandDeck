import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { moveInk } from "../../motion";
import { useStore } from "../../store";
import { ToolDetail } from "../ToolDetail";
import { Terminal } from "../Terminal";
import { NotesPanel } from "../NotesPanel";
import { message } from "@tauri-apps/plugin-dialog";
import { AppIconImg } from "../AppIcon/AppIcon";

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
  const closeTool = useStore((s) => s.closeTool);
  const restartTerminal = useStore((s) => s.restartTerminal);
  const [showNotes, setShowNotes] = useState(false);
  const [terminalActionId, setTerminalActionId] = useState<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabInkRef = useRef<HTMLSpanElement>(null);

  const terminals = tv?.terminals || [];
  const activeSubTab = tv?.activeSubTab || "detail";
  const runningCount = terminals.filter((t) => t.alive).length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e" && activeSubTab !== "detail") {
        event.preventDefault();
        setShowNotes((visible) => !visible);
        return;
      }
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "t") {
        event.preventDefault();
        if (tool?.commands[0]) void runCommand(toolId, tool.commands[0].id);
        return;
      }
      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        const tabs = ["detail", ...terminals.map((t) => t.id)];
        const at = Math.max(0, tabs.indexOf(activeSubTab));
        const next = event.shiftKey ? (at - 1 + tabs.length) % tabs.length : (at + 1) % tabs.length;
        setToolSubTab(toolId, tabs[next]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSubTab, toolId, terminals, tool]);

  useLayoutEffect(() => {
    const bar = tabBarRef.current;
    const ink = tabInkRef.current;
    const active = bar?.querySelector<HTMLElement>('[data-active="true"]');
    moveInk(ink, active ?? null, bar);
  }, [activeSubTab, terminals.length]);

  if (!tool) return <div className="p-4 text-gray-400">工具未找到</div>;

  const handleCloseTerminal = async (termId: string) => {
    if (terminalActionId) return;
    setTerminalActionId(termId);
    try {
      await closeTerminal(toolId, termId);
    } catch (error) {
      await message(`关闭失败，终端仍保留，可重试：${String(error)}`, {
        title: tool.name,
        kind: "error",
      });
    } finally {
      setTerminalActionId(null);
    }
  };

  const handleRestartTerminal = async (termId: string) => {
    if (terminalActionId) return;
    setTerminalActionId(termId);
    try {
      await restartTerminal(toolId, termId);
    } catch (error) {
      await message(`重启失败，原终端仍保留：${String(error)}`, {
        title: tool.name,
        kind: "error",
      });
    } finally {
      setTerminalActionId(null);
    }
  };

  const handleAddTerminal = async () => {
    if (tool && tool.commands.length > 0) {
      await runCommand(toolId, tool.commands[0].id);
    }
  };

  if (!tool || !tv) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-gray-800 bg-gray-950 px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={backToCatalog}
            className="cd-btn h-7 w-7 p-0"
            aria-label="返回工具库"
            title={category?.name || "返回工具库"}
          >
            &larr;
          </button>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[22%] ${tool.icon ? "" : "bg-gray-850"}`}>
            {tool.icon ? (
              <span className="block h-full w-full [&>img]:h-full [&>img]:w-full [&>img]:object-contain">
                <AppIconImg src={tool.icon} />
              </span>
            ) : (
              <span className="text-xs font-bold text-brand-300">{tool.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-gray-100">{tool.name}</span>
            <span className="block truncate text-[11px] text-gray-500">{category?.name || "未分类"}</span>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {runningCount > 0 && (
            <span className="cd-chip border-emerald-400/25 text-emerald-300">
              <span data-pulse className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {runningCount} 个进程运行中
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              void closeTool(toolId).catch((error) => {
                void message(`关闭工具失败：${String(error)}`, { title: "CommandDeck", kind: "error" });
              });
            }}
            className="cd-btn cd-btn-danger"
          >
            关闭工具
          </button>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div ref={tabBarRef} className="relative flex min-h-[38px] items-end border-b border-gray-800 bg-gray-925 shrink-0 overflow-x-auto px-2">
        <span ref={tabInkRef} className="cd-tab-ink" />
        <button
          onClick={() => setToolSubTab(toolId, "detail")}
          data-active={activeSubTab === "detail" ? "true" : undefined}
          className={`relative shrink-0 px-3 py-2 text-xs ${
            activeSubTab === "detail"
              ? "text-brand-300"
              : "text-gray-500 hover:text-gray-200"
          }`}
        >
          详情
        </button>

        {terminals.map((t) => (
          <div
            key={t.id}
            data-active={activeSubTab === t.id ? "true" : undefined}
            className={`relative flex shrink-0 cursor-pointer items-center px-3 py-2 text-xs ${
              activeSubTab === t.id
                ? "text-brand-300"
                : "text-gray-500 hover:text-gray-200"
            }`}
            onClick={() => setToolSubTab(toolId, t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void handleCloseTerminal(t.id);
              }
            }}
          >
            <span className={`flex items-center gap-1.5 ${t.alive ? "" : "text-gray-600"}`}>
              {t.alive ? (
                <span data-pulse className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-gray-600" />
              )}
              #{t.num} {t.commandLabel}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleCloseTerminal(t.id);
              }}
              disabled={terminalActionId !== null}
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
            className={`cd-btn mb-1 ml-auto h-6 shrink-0 ${
              showNotes ? "border-brand-400/40 text-brand-300" : ""
            }`}
            title="快速查看笔记（Cmd/Ctrl+E）"
          >
            笔记
          </button>
        )}
      </div>

      {/* Content — all panels always mounted, inactive ones hidden */}
      <div className="flex-1 flex min-h-0">
        <div className="keep-alive-host min-w-0">
        <div className={`keep-alive-panel ${activeSubTab === "detail" ? "" : "is-parked"}`}>
          <ToolDetail toolId={toolId} />
        </div>
        {terminals.map((term) => (
          <div
            key={term.id}
            className={`keep-alive-panel ${activeSubTab === term.id ? "" : "is-parked"}`}
          >
            <div className="flex min-h-[28px] items-center gap-2 border-b border-gray-800 bg-gray-925 px-3 shrink-0">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-400" title={term.command}>
                {term.command}
              </span>
              <span className={`shrink-0 text-[10px] ${term.alive ? "text-emerald-400" : "text-gray-600"}`}>
                {term.alive ? "运行中" : "已退出"}
              </span>
              <button
                onClick={() => { void handleRestartTerminal(term.id); }}
                disabled={terminalActionId !== null}
                className="cd-btn h-6 px-2 text-[11px]"
                title="重启终端"
              >
                重启
              </button>
              <button
                onClick={() => { void handleCloseTerminal(term.id); }}
                disabled={terminalActionId !== null}
                className="cd-btn cd-btn-danger h-6 px-2 text-[11px]"
                title="停止终端"
              >
                停止
              </button>
            </div>
            <div className="terminal-stage">
              <div className="terminal-well">
                <Terminal terminalId={term.id} />
              </div>
            </div>
          </div>
        ))}
        </div>
        {showNotes && activeSubTab !== "detail" && <NotesPanel toolId={toolId} onClose={() => setShowNotes(false)} />}
      </div>
    </div>
  );
}
