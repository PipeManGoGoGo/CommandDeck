import { useRef, useCallback, useState } from "react";
import { useStore } from "../../store";
import type { Tool } from "../../types";
import { ContextMenu } from "../ContextMenu";
import { message } from "@tauri-apps/plugin-dialog";
import { AppIconImg } from "../AppIcon/AppIcon";
import { dragPointer, endToolDrag, followDragIcon } from "../../utils/drag";
import { TRASH_ID } from "../../utils/tree";

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
  const trashTool = useStore((s) => s.trashTool);
  const closeTool = useStore((s) => s.closeTool);
  const runningCount = tv?.terminals.filter((t) => t.alive).length || 0;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(tool.name);
  const updateTool = useStore((s) => s.updateTool);

  const originRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const firstCommand = tool.commands[0];

  const startFirstCommand = useCallback(async () => {
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
  }, [firstCommand, openTool, runCommand, starting, tool.id, tool.name]);

  const activateTool = useCallback(() => {
    const live = useStore.getState().toolViews[tool.id];
    const running = live?.terminals.filter((t) => t.alive).length || 0;
    if (running > 0) {
      openTool(tool.id);
      return;
    }
    if (firstCommand) {
      void startFirstCommand();
      return;
    }
    openTool(tool.id);
  }, [firstCommand, openTool, startFirstCommand, tool.id]);

  const commitRename = async () => {
    const next = renameDraft.trim();
    setRenaming(false);
    if (!next || next === tool.name) return;
    try {
      await updateTool(tool.id, { name: next });
    } catch (error) {
      await message(`无法重命名：${String(error)}`, { title: tool.name, kind: "error" });
    }
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || renaming) return;
    const pointerId = e.pointerId;
    originRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      dragPointer.x = event.clientX;
      dragPointer.y = event.clientY;
      if (movedRef.current) {
        if (useStore.getState().dropTargetCatId === TRASH_ID) return;
        followDragIcon(tool.id, event.clientX, event.clientY);
        return;
      }
      const origin = originRef.current;
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx * dx + dy * dy < 36) return;
      movedRef.current = true;
      originRef.current = null;
      setDragToolId(tool.id);
    };

    const blockNativeDrag = (event: Event) => event.preventDefault();

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("dragstart", blockNativeDrag, true);
      const dragged = movedRef.current;
      const shouldOpen = Boolean(originRef.current) && !dragged && !renaming;
      originRef.current = null;
      if (shouldOpen) {
        void activateTool();
        return;
      }
      if (dragged) endToolDrag();
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("dragstart", blockNativeDrag, true);
  }, [activateTool, renaming, setDragToolId, tool.id]);

  const isDragging = dragToolId === tool.id;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${runningCount ? "打开" : "启动"} ${tool.name}${runningCount ? `，${runningCount} 个进程运行中` : ""}`}
      onPointerDown={handlePointerDown}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void activateTool();
        }
      }}
      title={tool.description || tool.name}
      id={`tool-${tool.id}`}
      className={`cd-app ${isDragging ? "is-dragging-source" : ""}`}
    >
      <span className="cd-app-icon-slot">
        {!isDragging && (
          <span className={`cd-app-icon ${tool.icon ? "" : "is-letter"}`}>
            {tool.icon ? (
              <AppIconImg src={tool.icon} />
            ) : (
              <span className="leading-none">
                {tool.name.charAt(0).toUpperCase()}
              </span>
            )}
            {runningCount > 0 && <span className="cd-app-dot" />}
          </span>
        )}
      </span>
      {renaming ? (
        <input
          autoFocus
          value={renameDraft}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setRenameDraft(event.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") void commitRename();
            if (event.key === "Escape") setRenaming(false);
          }}
          className="rename-field w-full text-center text-[11px]"
        />
      ) : (
        <span
          className="cd-app-name"
          onDoubleClick={(event) => {
            event.stopPropagation();
            setRenameDraft(tool.name);
            setRenaming(true);
          }}
        >
          {tool.name}
        </span>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(runningCount > 0
              ? [{ label: "打开", onClick: () => openTool(tool.id) }]
              : firstCommand
                ? [{ label: starting ? "启动中…" : "启动", onClick: () => { void startFirstCommand(); } }]
                : [{ label: "打开", onClick: () => openTool(tool.id) }]),
            {
              label: "重命名",
              onClick: () => {
                setRenameDraft(tool.name);
                setRenaming(true);
              },
            },
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
            ...(runningCount > 0
              ? [{
                  label: "关闭运行中的终端",
                  onClick: () => {
                    void closeTool(tool.id).catch((error) =>
                      message(`关闭失败：${String(error)}`, { title: tool.name, kind: "error" })
                    );
                  },
                }]
              : []),
            {
              label: "移到回收站",
              danger: true,
              onClick: () => {
                void trashTool(tool.id).catch((error) =>
                  message(`无法移到回收站：${String(error)}`, { title: tool.name, kind: "error" })
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}
