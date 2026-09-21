import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { gsap, motionReduced, scrollElementInto, staggerList } from "../../motion";
import { createPortal } from "react-dom";
import { useStore } from "../../store";
import type { Category } from "../../types";
import { TRASH_ID } from "../../utils/tree";
import { ContextMenu } from "../ContextMenu";
import { confirm, message } from "@tauri-apps/plugin-dialog";

export function Sidebar() {
  const categories = useStore((s) => s.categories);
  const view = useStore((s) => s.view);
  const backToCatalog = useStore((s) => s.backToCatalog);
  const activeCategoryId = useStore((s) => s.activeCategoryId);
  const setActiveCategoryId = useStore((s) => s.setActiveCategoryId);
  const dragToolId = useStore((s) => s.dragToolId);
  const dropTargetCatId = useStore((s) => s.dropTargetCatId);
  const setDropTargetCatId = useStore((s) => s.setDropTargetCatId);
  const openToolForm = useStore((s) => s.openToolForm);
  const addCategory = useStore((s) => s.addCategory);
  const updateCategory = useStore((s) => s.updateCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const reorderCategories = useStore((s) => s.reorderCategories);
  const tools = useStore((s) => s.tools);
  const restoreTool = useStore((s) => s.restoreTool);
  const emptyTrash = useStore((s) => s.emptyTrash);
  const deleteTool = useStore((s) => s.deleteTool);
  const [trashOpen, setTrashOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; cat: Category } | null>(null);
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [ghost, setGhost] = useState({ x: 0, y: 0 });
  const originRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const movedRef = useRef(false);
  const insertIndexRef = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const introRef = useRef(false);
  const dragCat = categories.find((category) => category.id === dragCatId);

  useLayoutEffect(() => {
    if (introRef.current || !navRef.current) return;
    const rows = navRef.current.querySelectorAll("[data-cat-id]");
    if (!rows.length) return;
    introRef.current = true;
    staggerList(rows);
  }, [categories]);

  const scrollToCategory = (catId: string) => {
    setActiveCategoryId(catId);
    const jump = () => {
      const section = document.getElementById(`cat-${catId}`);
      const scroller = section?.closest(".overflow-y-auto") as HTMLElement | null;
      if (section && scroller) scrollElementInto(scroller, section);
      else section?.scrollIntoView({ block: "start" });
    };
    if (view !== "catalog") {
      backToCatalog();
      requestAnimationFrame(() => requestAnimationFrame(jump));
    } else {
      jump();
    }
  };

  useEffect(() => {
    if (!dragCatId) return;
    document.body.classList.add("is-dragging");
    document.documentElement.style.cursor = "grabbing";
    const pickIndex = (clientY: number) => {
      const rows = navRef.current?.querySelectorAll<HTMLElement>("[data-cat-id]");
      if (!rows?.length) return 0;
      for (let i = 0; i < rows.length; i += 1) {
        const box = rows[i].getBoundingClientRect();
        if (clientY < box.top + box.height / 2) return i;
      }
      return rows.length;
    };
    const onMove = (event: PointerEvent) => {
      setGhost({ x: event.clientX, y: event.clientY });
      const next = pickIndex(event.clientY);
      insertIndexRef.current = next;
      setInsertIndex(next);
    };
    const finish = () => {
      const fromId = dragCatId;
      const rawTo = insertIndexRef.current;
      originRef.current = null;
      insertIndexRef.current = null;
      setDragCatId(null);
      setInsertIndex(null);
      document.body.classList.remove("is-dragging");
      document.documentElement.style.cursor = "";
      if (!fromId || rawTo == null) return;
      const ids = categories.map((category) => category.id);
      const from = ids.indexOf(fromId);
      if (from < 0) return;
      let to = rawTo;
      if (from < to) to -= 1;
      to = Math.max(0, Math.min(ids.length - 1, to));
      if (from === to) return;
      ids.splice(from, 1);
      ids.splice(to, 0, fromId);
      void reorderCategories(ids).catch((error) =>
        message(`排序失败：${String(error)}`, { title: "CommandDeck", kind: "error" })
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      document.body.classList.remove("is-dragging");
      document.documentElement.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragCatId, categories, reorderCategories]);

  const commitRename = async () => {
    const id = renamingId;
    const next = renameDraft.trim();
    const current = categories.find((category) => category.id === id);
    setRenamingId(null);
    if (!id || !next || next === current?.name) return;
    try {
      await updateCategory(id, { name: next });
    } catch (error) {
      await message(`无法重命名分类：${String(error)}`, { title: "CommandDeck", kind: "error" });
    }
  };

  const submitFolder = async () => {
    const name = draft.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    try {
      await addCategory(name);
      setDraft("");
      setCreating(false);
    } catch (error) {
      await message(`无法创建分类：${String(error)}`, { title: "CommandDeck", kind: "error" });
    }
  };

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
      <div className="flex h-12 items-center gap-2 border-b border-gray-800 px-4">
        <span className="cd-mark" aria-hidden="true">C</span>
        <div className="text-[13px] font-medium tracking-[0.2px] text-gray-50">CommandDeck</div>
      </div>
      <div className="flex items-center justify-between px-3 pb-1 pt-4">
        <span className="text-[12px] font-medium text-gray-400">分类</span>
        <span className="flex gap-1">
          <TinyBtn title="新建分类" onClick={() => { setCreating(true); setDraft(""); }}>分类</TinyBtn>
          <TinyBtn title="添加工具" onClick={() => openToolForm(undefined, activeCategoryId || categories[0]?.id)}>工具</TinyBtn>
        </span>
      </div>
      <nav ref={navRef} className="flex-1 overflow-y-auto px-2 pb-3" aria-label="分类">
        {categories.map((cat, index) => {
          const dropHot = Boolean(dragToolId && dropTargetCatId === cat.id);
          const dragging = dragCatId === cat.id;
          return (
            <div
              key={cat.id}
              className="cat-row"
              onPointerEnter={() => {
                if (dragToolId) setDropTargetCatId(cat.id);
              }}
            >
              {dragCatId && insertIndex === index && (
                <div className="mx-2 mb-0.5 h-0.5 rounded-full bg-brand-400" />
              )}
              <div
                data-cat-id={cat.id}
                className={`cd-row group relative mb-0.5 flex w-full cursor-grab items-center px-2 text-sm ${
                  dragging
                    ? "opacity-40"
                    : dropHot
                      ? "drop-hot bg-brand-500/12 text-brand-200"
                      : activeCategoryId === cat.id
                        ? "bg-brand-500/10 text-brand-300"
                        : dragToolId
                          ? "text-gray-400 ring-1 ring-dashed ring-gray-800"
                          : "text-gray-300"
                }`}
                onPointerDown={(event) => {
                  if (event.button !== 0 || dragToolId || renamingId === cat.id) return;
                  originRef.current = { x: event.clientX, y: event.clientY, id: cat.id };
                  movedRef.current = false;
                  setGhost({ x: event.clientX, y: event.clientY });
                }}
                onPointerMove={(event) => {
                  const origin = originRef.current;
                  if (!origin || origin.id !== cat.id || dragToolId || dragCatId) return;
                  const dx = event.clientX - origin.x;
                  const dy = event.clientY - origin.y;
                  if (dx * dx + dy * dy < 36) return;
                  movedRef.current = true;
                  setGhost({ x: event.clientX, y: event.clientY });
                  insertIndexRef.current = index;
                  setInsertIndex(index);
                  setDragCatId(cat.id);
                }}
                onPointerUp={() => {
                  if (
                    !movedRef.current &&
                    originRef.current?.id === cat.id &&
                    !dragCatId &&
                    renamingId !== cat.id
                  ) {
                    scrollToCategory(cat.id);
                  }
                  originRef.current = null;
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, cat });
                }}
              >
                <span className="mr-1 w-2 text-center text-[9px] text-gray-700 opacity-0 group-hover:opacity-100">⋮</span>
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: cat.color || "#64748b" }} />
                {renamingId === cat.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void commitRename();
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    className="rename-field mx-2 flex-1 text-xs"
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 truncate py-1.5 pl-2"
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setRenamingId(cat.id);
                      setRenameDraft(cat.name);
                    }}
                  >
                    {cat.name}
                  </span>
                )}
                <span className="hidden group-hover:flex">
                  <TinyBtn title="在此分类下添加工具" onClick={() => openToolForm(undefined, cat.id)}>工具</TinyBtn>
                </span>
              </div>
              {dragCatId && insertIndex === categories.length && index === categories.length - 1 && (
                <div className="mx-2 mt-0.5 h-0.5 rounded-full bg-brand-400" />
              )}
            </div>
          );
        })}
        {creating && (
          <input
            autoFocus
            value={draft}
            placeholder="分类名称"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void submitFolder()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submitFolder();
              if (event.key === "Escape") setCreating(false);
            }}
            className="rename-field mb-2 px-2 text-xs"
          />
        )}
      </nav>
      <TrashDock
        tools={tools}
        dragging={Boolean(dragToolId)}
        hot={dropTargetCatId === TRASH_ID}
        open={trashOpen}
        onToggle={() => setTrashOpen((value) => !value)}
        onHover={() => {
          if (dragToolId) setDropTargetCatId(TRASH_ID);
        }}
        onLeave={() => {
          if (useStore.getState().dropTargetCatId === TRASH_ID) setDropTargetCatId(null);
        }}
        onRestore={(id) => {
          void restoreTool(id).catch((error) => message(String(error), { title: "CommandDeck", kind: "error" }));
        }}
        onPurge={(id) => {
          void deleteTool(id).catch((error) => message(String(error), { title: "CommandDeck", kind: "error" }));
        }}
        onEmpty={() => {
          void confirm("清空回收站？将永久删除其中的工具配置（不会删磁盘文件）。", {
            title: "清空回收站",
            kind: "warning",
          }).then((ok) => {
            if (ok) return emptyTrash().catch((error) => message(String(error), { title: "CommandDeck", kind: "error" }));
          });
        }}
      />
      {dragCat && createPortal(
        <DragGhost x={ghost.x} y={ghost.y}>
          <div className="cd-panel flex min-w-[160px] items-center gap-2 px-3 py-2">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: dragCat.color || "#64748b" }} />
            <span className="text-sm text-gray-100">{dragCat.name}</span>
          </div>
        </DragGhost>,
        document.body
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "在此添加工具", onClick: () => openToolForm(undefined, menu.cat.id) },
            {
              label: "重命名",
              onClick: () => {
                setRenamingId(menu.cat.id);
                setRenameDraft(menu.cat.name);
              },
            },
            {
              label: "删除分类",
              danger: true,
              onClick: () => {
                void confirm(`删除分类“${menu.cat.name}”？`, { title: "删除分类", kind: "warning" }).then((ok) => {
                  if (ok) return deleteCategory(menu.cat.id).catch((error) => message(String(error), { title: "CommandDeck", kind: "error" }));
                });
              },
            },
          ]}
        />
      )}
    </aside>
  );
}

function TrashDock({
  tools,
  dragging,
  hot,
  open,
  onToggle,
  onHover,
  onLeave,
  onRestore,
  onPurge,
  onEmpty,
}: {
  tools: { id: string; name: string; icon?: string; trashed?: boolean }[];
  dragging: boolean;
  hot: boolean;
  open: boolean;
  onToggle: () => void;
  onHover: () => void;
  onLeave: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onEmpty: () => void;
}) {
  const trashed = tools.filter((tool) => tool.trashed);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || dragging) return;
    const items = listRef.current?.children;
    if (items?.length) staggerList(items);
  }, [open, dragging]);

  return (
    <div
      className={`m-2 overflow-hidden border ${
        hot
          ? "drop-hot border-red-400/50 bg-red-500/10"
          : dragging
            ? "border-dashed border-red-400/35 bg-gray-925"
            : "border-gray-800"
      }`}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            data-trash-slot
            className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[22%] ${
              hot ? "bg-red-500/25" : dragging ? "bg-gray-850" : "bg-gray-925"
            }`}
          />
          <span className={`text-xs font-medium ${hot ? "text-red-300" : "text-gray-200"}`}>回收站</span>
        </span>
        <span className="rounded-md bg-gray-925 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500">{trashed.length}</span>
      </button>
      {hot && <p className="px-3 pb-2 text-[10px] text-red-200">松手即可删除</p>}
      {open && !dragging && (
        <div ref={listRef} className="max-h-48 overflow-y-auto border-t border-gray-800 px-2 py-2">
          {trashed.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-gray-500">把工具拖到这里，或从菜单移入</p>
          ) : (
            <>
              {trashed.map((tool) => (
                <div key={tool.id} className="mb-1 flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-gray-800">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-gray-300">{tool.name}</span>
                  <TinyBtn title="还原" onClick={() => onRestore(tool.id)}>还原</TinyBtn>
                  <TinyBtn title="永久删除" onClick={() => onPurge(tool.id)}>删</TinyBtn>
                </div>
              ))}
              <button type="button" onClick={onEmpty} className="mt-1 w-full rounded-md px-2 py-1 text-[10px] text-red-400 hover:bg-red-400/10">
                清空回收站
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DragGhost({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const xTo = useRef<((value: number) => gsap.core.Tween) | null>(null);
  const yTo = useRef<((value: number) => gsap.core.Tween) | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const duration = motionReduced ? 0.01 : 0.14;
    gsap.set(el, { x: x + 10, y: y - 18, rotate: 3, scale: 1.04, opacity: 1 });
    xTo.current = gsap.quickTo(el, "x", { duration, ease: "power3.out" });
    yTo.current = gsap.quickTo(el, "y", { duration, ease: "power3.out" });
  }, []);

  useLayoutEffect(() => {
    xTo.current?.(x + 10);
    yTo.current?.(y - 18);
  }, [x, y]);

  return (
    <div ref={ref} className="drag-ghost pointer-events-none fixed left-0 top-0 z-[300]" style={{ opacity: 0 }}>
      {children}
    </div>
  );
}

function TinyBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="cd-btn h-6 border-0 px-1.5 text-[10px]"
    >
      {children}
    </button>
  );
}
