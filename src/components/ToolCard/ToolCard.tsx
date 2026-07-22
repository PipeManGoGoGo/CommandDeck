import { useRef, useCallback, useState } from "react";
import { useStore } from "../../store";
import type { Tool } from "../../types";
import { ContextMenu } from "../ContextMenu";
import { confirm, message } from "@tauri-apps/plugin-dialog";

interface Props {
  tool: Tool;
}

export function ToolCard({ tool }: Props) {
  const openTool = useStore((s) => s.openTool);
  const setDragToolId = useStore((s) => s.setDragToolId);
  const dragToolId = useStore((s) => s.dragToolId);
  const tv = useStore((s) => s.toolViews[tool.id]);
  const categories = useStore((s) => s.categories);
  const openToolForm = useStore((s) => s.openToolForm);
  const runCommand = useStore((s) => s.runCommand);
  const moveTool = useStore((s) => s.moveTool);
  const deleteTool = useStore((s) => s.deleteTool);
  const runningCount = tv?.terminals.filter((t) => t.alive).length || 0;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [starting, setStarting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const pressedRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pressedRef.current = true;
    timerRef.current = setTimeout(() => {
      pressedRef.current = false;
      setDragToolId(tool.id);
    }, 500);
  }, [tool.id, setDragToolId]);

  const handleMouseUp = useCallback(() => {
    clearTimeout(timerRef.current);
    if (pressedRef.current) {
      // Short press → open tool
      pressedRef.current = false;
      openTool(tool.id);
    }
  }, [tool.id, openTool]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    pressedRef.current = false;
  }, []);

  const isDragging = dragToolId === tool.id;
  const firstCommand = tool.commands[0];

  const startFirstCommand = async () => {
    if (!firstCommand || starting) return;
    setStarting(true);
    try {
      await runCommand(tool.id, firstCommand.id);
      openTool(tool.id);
    } catch (error) {
      await message(`启动失败：${String(error)}`, { title: tool.name, kind: "error" });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`打开 ${tool.name}${runningCount ? `，${runningCount} 个进程运行中` : ""}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openTool(tool.id);
        }
      }}
      title="单击打开，长按可移动到其他分类"
      className={`relative overflow-hidden rounded-xl border bg-gray-850/80 transition-all duration-200 select-none ${
        isDragging
          ? "border-brand-400 opacity-50 scale-[0.98] shadow-xl"
          : "border-gray-750/90 hover:-translate-y-0.5 hover:border-brand-400/35 cursor-pointer hover:bg-gray-850 hover:shadow-glow group"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-700/70 bg-gray-750/70 text-lg transition-colors group-hover:border-brand-400/20 group-hover:bg-brand-500/10">
            {tool.icon ? (
              <img
                src={tool.icon}
                alt={tool.name}
                className="w-6 h-6 object-contain"
              />
            ) : (
              <span className="text-sm font-bold text-brand-300">
                {tool.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-100">
              {tool.name}
            </h3>
            {tool.description && (
              <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-[1.125rem] text-gray-500">
                {tool.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex min-h-[18px] items-center justify-between border-t border-gray-800 pt-3">
          {runningCount > 0 ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              运行中 ×{runningCount}
            </span>
          ) : (
            <span className="text-[10px] text-gray-600 transition-colors group-hover:text-gray-500">打开工具</span>
          )}
          {firstCommand ? (
            <button
              type="button"
              disabled={starting}
              onMouseDown={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void startFirstCommand();
              }}
              className="rounded-md bg-brand-600/15 px-2 py-1 text-[10px] font-medium text-brand-300 opacity-0 transition hover:bg-brand-600 hover:text-white group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
            >
              {starting ? "启动中…" : "▶ 启动"}
            </button>
          ) : (
            <span className="text-[10px] text-gray-600">未配置命令</span>
          )}
        </div>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(firstCommand ? [{ label: "启动", onClick: () => { void startFirstCommand(); } }] : []),
            { label: "编辑", onClick: () => openToolForm(tool.id) },
            ...categories
              .filter((category) => category.id !== tool.category_id)
              .map((category) => ({
                label: `移动到 ${category.name}`,
                onClick: () => {
                  void moveTool(tool.id, category.id).catch((error) =>
                    message(`移动失败：${String(error)}`, { title: tool.name, kind: "error" })
                  );
                },
              })),
            {
              label: "删除",
              danger: true,
              onClick: () => {
                void confirm(`确定删除“${tool.name}”吗？此操作不会删除磁盘上的工具文件。`, {
                  title: "删除工具",
                  kind: "warning",
                }).then((accepted) => {
                  if (accepted) {
                    return deleteTool(tool.id).catch((error) =>
                      message(`删除失败：${String(error)}`, { title: tool.name, kind: "error" })
                    );
                  }
                });
              },
            },
          ]}
        />
      )}
    </div>
  );
}
