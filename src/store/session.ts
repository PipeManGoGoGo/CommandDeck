import type { AppView, Tool, ToolTerminal, ToolViewState } from "../types";

export type LivePty = {
  id: string;
  toolId: string;
  commandId: string;
  commandLabel: string;
  command: string;
  num: number;
  alive: boolean;
};

export type UiSession = {
  baseDir: string;
  view: AppView;
  activeToolId: string | null;
  lastToolId: string | null;
  activeCategoryId: string | null;
  catalogScrollTop: number;
  toolViews: Record<string, ToolViewState>;
};

const KEY = "commanddeck.ui-session";

export function readUiSession(): UiSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UiSession>;
    if (!parsed || typeof parsed.baseDir !== "string") return null;
    return {
      baseDir: parsed.baseDir,
      view: parsed.view === "tool" ? "tool" : "catalog",
      activeToolId: parsed.activeToolId ?? null,
      lastToolId: parsed.lastToolId ?? parsed.activeToolId ?? null,
      activeCategoryId: parsed.activeCategoryId ?? null,
      catalogScrollTop: typeof parsed.catalogScrollTop === "number" ? parsed.catalogScrollTop : 0,
      toolViews: parsed.toolViews && typeof parsed.toolViews === "object" ? parsed.toolViews : {},
    };
  } catch {
    return null;
  }
}

export function writeUiSession(session: UiSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function restoreSession(
  baseDir: string,
  tools: Tool[],
  categoryIds: string[],
  live: LivePty[],
  snap: UiSession | null
): Pick<UiSession, "view" | "activeToolId" | "lastToolId" | "activeCategoryId" | "catalogScrollTop" | "toolViews"> {
  const known = new Set(tools.filter((tool) => !tool.trashed).map((tool) => tool.id));
  const liveById = new Map(live.filter((pty) => pty.id).map((pty) => [pty.id, pty]));
  const views: Record<string, ToolViewState> = {};

  if (snap?.baseDir === baseDir) {
    for (const [toolId, tv] of Object.entries(snap.toolViews || {})) {
      if (!known.has(toolId)) continue;
      const terminals = (tv.terminals || []).filter((term) => liveById.has(term.ptyId)).map((term) => {
        const pty = liveById.get(term.ptyId)!;
        return { ...term, alive: pty.alive };
      });
      if (terminals.length === 0) continue;
      views[toolId] = {
        activeSubTab: tv.activeSubTab || "detail",
        terminals,
        nextNum: Math.max(tv.nextNum || 1, ...terminals.map((term) => term.num + 1), 1),
      };
    }
  }

  for (const pty of live) {
    if (!pty.toolId || !known.has(pty.toolId)) continue;
    const tv = views[pty.toolId] ?? { activeSubTab: "detail", terminals: [], nextNum: 1 };
    const existing = tv.terminals.find((term) => term.ptyId === pty.id);
    const term: ToolTerminal = existing
      ? { ...existing, alive: pty.alive, commandLabel: pty.commandLabel || existing.commandLabel, command: pty.command || existing.command }
      : {
          id: `term-${pty.id}`,
          ptyId: pty.id,
          commandId: pty.commandId || "restored",
          commandLabel: pty.commandLabel || "终端",
          command: pty.command,
          num: pty.num || tv.nextNum,
          alive: pty.alive,
        };
    const terminals = existing
      ? tv.terminals.map((item) => (item.ptyId === pty.id ? term : item))
      : [...tv.terminals, term];
    const nextNum = Math.max(tv.nextNum, ...terminals.map((item) => item.num + 1), 1);
    const activeSubTab =
      tv.activeSubTab && (tv.activeSubTab === "detail" || terminals.some((item) => item.id === tv.activeSubTab))
        ? tv.activeSubTab
        : terminals[terminals.length - 1]?.id ?? "detail";
    views[pty.toolId] = { activeSubTab, terminals, nextNum };
  }

  const knownCats = new Set(categoryIds);
  const activeCategoryId =
    snap?.baseDir === baseDir && snap.activeCategoryId && knownCats.has(snap.activeCategoryId)
      ? snap.activeCategoryId
      : null;

  let view: AppView = snap?.baseDir === baseDir ? snap.view : "catalog";
  let activeToolId = snap?.baseDir === baseDir ? snap.activeToolId : null;
  const lastCandidate = snap?.baseDir === baseDir ? snap.lastToolId || snap.activeToolId : null;
  const lastToolId = lastCandidate && known.has(lastCandidate) ? lastCandidate : null;
  const hasLiveTool = Boolean(activeToolId && live.some((pty) => pty.toolId === activeToolId));
  if (view === "tool" && (!activeToolId || !known.has(activeToolId) || !hasLiveTool)) {
    view = "catalog";
    activeToolId = null;
  }

  return {
    view,
    activeToolId,
    lastToolId,
    activeCategoryId,
    catalogScrollTop: snap?.baseDir === baseDir ? snap.catalogScrollTop || 0 : 0,
    toolViews: views,
  };
}
