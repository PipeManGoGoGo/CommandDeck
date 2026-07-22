import { create } from "zustand";
import type { Category, Tool, ToolTerminal, ToolViewState, AppView, Settings, ThemeMode } from "../types";
import * as tauri from "../utils/tauri";

const DEFAULT_CATEGORIES: Omit<Category, "id">[] = [
  { name: "信息收集", sort_order: 0, color: "#3b82f6" },
  { name: "漏洞利用", sort_order: 1, color: "#ef4444" },
  { name: "后渗透", sort_order: 2, color: "#f59e0b" },
  { name: "权限提升", sort_order: 3, color: "#8b5cf6" },
  { name: "辅助工具", sort_order: 4, color: "#10b981" },
];

function generateId(): string {
  return crypto.randomUUID();
}

interface AppState {
  categories: Category[];
  tools: Tool[];
  view: AppView;
  activeToolId: string | null;
  activeToolFormId: string | null;
  toolViews: Record<string, ToolViewState>;
  settings: Settings | null;
  dragToolId: string | null;
  activeCategoryId: string | null;
  filterRunning: boolean;
  searchQuery: string;

  init: () => Promise<boolean>;
  setSearchQuery: (q: string) => void;
  setFilterRunning: (v: boolean) => void;
  setDragToolId: (id: string | null) => void;
  setActiveCategoryId: (id: string | null) => void;
  updateSettings: (s: Settings) => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  loadWorkspace: () => Promise<void>;
  moveTool: (toolId: string, targetCatId: string) => Promise<void>;

  addCategory: (name: string) => Promise<void>;
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (ids: string[]) => Promise<void>;

  addTool: (tool: Omit<Tool, "id">) => Promise<void>;
  updateTool: (id: string, data: Partial<Tool>) => Promise<void>;
  deleteTool: (id: string) => Promise<void>;

  openTool: (toolId: string) => void;
  backToCatalog: () => void;
  openToolForm: (toolId?: string) => void;
  setView: (view: AppView) => void;

  setToolSubTab: (toolId: string, subTabId: string) => void;
  runCommand: (toolId: string, commandId: string) => Promise<void>;
  closeTerminal: (toolId: string, termId: string) => Promise<void>;
  restartTerminal: (toolId: string, termId: string) => Promise<void>;
  markTerminalExited: (termId: string) => void;
  addTerminalToView: (toolId: string, terminal: ToolTerminal) => void;
}

let toolsMutationQueue: Promise<void> = Promise.resolve();
let categoriesMutationQueue: Promise<void> = Promise.resolve();

function serializeToolsMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = toolsMutationQueue.then(operation, operation);
  toolsMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function serializeCategoriesMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = categoriesMutationQueue.then(operation, operation);
  categoriesMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  return value;
}

function parseCategories(json: string): Category[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("顶层内容必须是数组");
  return parsed
    .map((value, index): Category => {
      if (!isRecord(value)) throw new Error(`第 ${index + 1} 个分类不是对象`);
      if (typeof value.id !== "string" || !value.id) throw new Error(`第 ${index + 1} 个分类缺少 id`);
      if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`第 ${index + 1} 个分类缺少名称`);
      if (value.sort_order !== undefined && typeof value.sort_order !== "number") {
        throw new Error(`分类“${value.name}”的 sort_order 必须是数字`);
      }
      return {
        id: value.id,
        name: value.name,
        sort_order: value.sort_order ?? index,
        color: optionalString(value.color, `分类“${value.name}”的 color`),
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

function parseTools(json: string, categories: Category[]): Tool[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("顶层内容必须是数组");
  const categoryIds = new Set(categories.map((category) => category.id));

  return parsed.map((value, index): Tool => {
    if (!isRecord(value)) throw new Error(`第 ${index + 1} 个工具不是对象`);
    if (typeof value.id !== "string" || !value.id) throw new Error(`第 ${index + 1} 个工具缺少 id`);
    if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`第 ${index + 1} 个工具缺少名称`);
    if (typeof value.category_id !== "string" || !categoryIds.has(value.category_id)) {
      throw new Error(`工具“${value.name}”引用了不存在的分类`);
    }
    if (!Array.isArray(value.commands)) throw new Error(`工具“${value.name}”的 commands 必须是数组`);

    const commands = value.commands.map((command, commandIndex) => {
      if (!isRecord(command)) throw new Error(`工具“${value.name}”的第 ${commandIndex + 1} 条命令不是对象`);
      if (typeof command.id !== "string" || !command.id) throw new Error(`工具“${value.name}”的第 ${commandIndex + 1} 条命令缺少 id`);
      if (typeof command.label !== "string" || typeof command.command !== "string") {
        throw new Error(`工具“${value.name}”的第 ${commandIndex + 1} 条命令格式无效`);
      }
      return { id: command.id, label: command.label, command: command.command };
    });

    return {
      id: value.id,
      name: value.name,
      category_id: value.category_id,
      commands,
      description: optionalString(value.description, `工具“${value.name}”的 description`),
      icon: optionalString(value.icon, `工具“${value.name}”的 icon`),
      note: optionalString(value.note, `工具“${value.name}”的 note`),
      install_command: optionalString(value.install_command, `工具“${value.name}”的 install_command`),
      download_url: optionalString(value.download_url, `工具“${value.name}”的 download_url`),
      verify_command: optionalString(value.verify_command, `工具“${value.name}”的 verify_command`),
    };
  });
}

async function readWorkspaceData(dir: string): Promise<{ categories: Category[]; tools: Tool[] }> {
  const [toolsJson, categoriesJson] = await Promise.all([
    tauri.readTools(dir),
    tauri.readCategories(dir),
  ]);

  let categories: Category[];
  try {
    categories = parseCategories(categoriesJson);
  } catch (error) {
    throw new Error(`categories.json 格式无效：${String(error)}`);
  }

  if (categories.length === 0) {
    categories = DEFAULT_CATEGORIES.map((category) => ({ ...category, id: generateId() }));
    await tauri.writeCategories(dir, JSON.stringify(categories));
  }

  try {
    return { categories, tools: parseTools(toolsJson, categories) };
  } catch (error) {
    throw new Error(`tools.json 格式无效：${String(error)}`);
  }
}

export const useStore = create<AppState>((set, get) => ({
  categories: [],
  tools: [],
  view: "catalog",
  activeToolId: null,
  activeToolFormId: null,
  toolViews: {},
  settings: null,
  dragToolId: null,
  activeCategoryId: null,
  filterRunning: false,
  searchQuery: "",

  init: async () => {
    const settingsJson = await tauri.readSettings();
    let settings: Settings | null = null;
    try {
      const parsed = JSON.parse(settingsJson);
      if (isRecord(parsed) && typeof parsed.baseDir === "string" && parsed.baseDir.trim()) {
        settings = {
          baseDir: parsed.baseDir,
          theme: parsed.theme === "light" ? "light" : "dark",
        };
      }
    } catch {
      settings = null;
    }

    if (settings) {
      set({ settings });
      const workspace = await readWorkspaceData(settings.baseDir);
      set({ settings, ...workspace, activeCategoryId: workspace.categories[0]?.id ?? null });
      return true;
    }
    set({ settings: null });
    return false;
  },

  loadWorkspace: async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;

    const workspace = await readWorkspaceData(dir);
    set({ ...workspace, activeCategoryId: workspace.categories[0]?.id ?? null });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterRunning: (v) => set({ filterRunning: v }),
  setDragToolId: (id) => set({ dragToolId: id }),
  setActiveCategoryId: (id) => set({ activeCategoryId: id }),
  updateSettings: async (s) => {
    await Promise.all([toolsMutationQueue, categoriesMutationQueue]);
    const previous = get().settings;
    const workspaceChanged = previous?.baseDir !== s.baseDir;
    if (workspaceChanged && (await tauri.countPtys()) > 0) {
      throw new Error("仍有终端正在运行，请先关闭所有终端再切换工作目录");
    }
    const workspace = await readWorkspaceData(s.baseDir);
    await tauri.writeSettings(JSON.stringify(s));
    set({
      settings: s,
      ...workspace,
      activeCategoryId: workspace.categories[0]?.id ?? null,
      ...(workspaceChanged
        ? { toolViews: {}, activeToolId: null, activeToolFormId: null }
        : {}),
    });
  },
  setTheme: async (theme) => {
    const settings = get().settings;
    if (!settings) return;
    const nextSettings = { ...settings, theme };
    await tauri.writeSettings(JSON.stringify(nextSettings));
    set({ settings: nextSettings });
  },
  moveTool: (toolId, targetCatId) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const tools = get().tools.map((t) =>
      t.id === toolId ? { ...t, category_id: targetCatId } : t
    );
    await tauri.writeTools(dir, JSON.stringify(tools));
    set({ tools });
  }),

  addCategory: (name) => serializeCategoriesMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const state = get();
    const cat: Category = {
      id: generateId(),
      name,
      sort_order: state.categories.length,
    };
    const categories = [...state.categories, cat];
    await tauri.writeCategories(dir, JSON.stringify(categories));
    set((current) => ({
      categories,
      activeCategoryId: current.activeCategoryId ?? cat.id,
    }));
  }),

  updateCategory: (id, data) => serializeCategoriesMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const categories = get().categories.map((c) =>
      c.id === id ? { ...c, ...data } : c
    );
    await tauri.writeCategories(dir, JSON.stringify(categories));
    set({ categories });
  }),

  deleteCategory: (id) => serializeCategoriesMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const state = get();
    if (state.tools.some((tool) => tool.category_id === id)) {
      throw new Error("分类中仍有工具，无法删除");
    }
    const categories = state.categories.filter((c) => c.id !== id);
    await tauri.writeCategories(dir, JSON.stringify(categories));
    set((current) => ({
      categories,
      activeCategoryId: current.activeCategoryId === id
        ? categories[0]?.id ?? null
        : current.activeCategoryId,
    }));
  }),

  reorderCategories: (ids) => serializeCategoriesMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const state = get();
    const map = new Map(state.categories.map((c) => [c.id, c]));
    const categories = ids
      .map((id, i) => {
        const cat = map.get(id);
        return cat ? { ...cat, sort_order: i } : null;
      })
      .filter(Boolean) as Category[];
    await tauri.writeCategories(dir, JSON.stringify(categories));
    set({ categories });
  }),

  addTool: (tool) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const newTool: Tool = { ...tool, id: generateId() };
    const tools = [...get().tools, newTool];
    await tauri.writeTools(dir, JSON.stringify(tools));
    set({ tools });
  }),

  updateTool: (id, data) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const tools = get().tools.map((t) =>
      t.id === id ? { ...t, ...data } : t
    );
    await tauri.writeTools(dir, JSON.stringify(tools));
    set({ tools });
  }),

  deleteTool: (id) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const toolView = get().toolViews[id];
    if (toolView) {
      await Promise.all(
        toolView.terminals
          .filter((terminal) => terminal.alive)
          .map((terminal) => tauri.killPty(terminal.ptyId).catch(() => {}))
      );
    }
    const tools = get().tools.filter((t) => t.id !== id);
    await tauri.writeTools(dir, JSON.stringify(tools));
    set((state) => {
      const toolViews = { ...state.toolViews };
      delete toolViews[id];
      return { tools, toolViews };
    });
  }),

  // Navigation
  openTool: (toolId) => {
    set((s) => {
      const existing = s.toolViews[toolId];
      const toolViews = existing
        ? s.toolViews
        : {
            ...s.toolViews,
            [toolId]: { activeSubTab: "detail", terminals: [], nextNum: 1 },
          };
      return { view: "tool", activeToolId: toolId, toolViews };
    });
  },

  backToCatalog: () => set({ view: "catalog", activeToolId: null }),

  openToolForm: (toolId) =>
    set({ view: "tool_form", activeToolFormId: toolId || null }),

  setView: (view) => set({ view }),

  // Sub-tab management
  setToolSubTab: (toolId, subTabId) => {
    set((s) => {
      const tv = s.toolViews[toolId];
      if (!tv) return s;
      return {
        toolViews: {
          ...s.toolViews,
          [toolId]: { ...tv, activeSubTab: subTabId },
        },
      };
    });
  },

  addTerminalToView: (toolId, terminal) => {
    set((s) => {
      const tv = s.toolViews[toolId] || {
        activeSubTab: "detail",
        terminals: [],
        nextNum: 1,
      };
      return {
        toolViews: {
          ...s.toolViews,
          [toolId]: {
            ...tv,
            terminals: [...tv.terminals, { ...terminal, num: tv.nextNum }],
            activeSubTab: terminal.id,
            nextNum: tv.nextNum + 1,
          },
        },
      };
    });
  },

  runCommand: async (toolId, commandId) => {
    const tool = get().tools.find((t) => t.id === toolId);
    if (!tool) return;
    const cmd = tool.commands.find((c) => c.id === commandId);
    if (!cmd) return;

    const cwd = get().settings?.baseDir || undefined;
    const ptyId = await tauri.createPty(cmd.command, cwd);
    const terminal: ToolTerminal = {
      id: `term-${ptyId}`,
      ptyId,
      commandId: cmd.id,
      commandLabel: cmd.label,
      command: cmd.command,
      num: 0,
      alive: true,
    };

    if (!get().tools.some((candidate) => candidate.id === toolId)) {
      await tauri.killPty(ptyId).catch(() => {});
      return;
    }
    get().addTerminalToView(toolId, terminal);
  },

  closeTerminal: async (toolId, termId) => {
    const tv = get().toolViews[toolId];
    if (!tv) return;
    const term = tv.terminals.find((t) => t.id === termId);
    if (!term) return;

    if (term.alive) {
      await tauri.killPty(term.ptyId).catch(() => {});
    }

    set((s) => {
      const current = s.toolViews[toolId];
      if (!current) return s;
      const remaining = current.terminals.filter((t) => t.id !== termId);
      const activeSubTab = current.activeSubTab === termId
        ? remaining[remaining.length - 1]?.id ?? "detail"
        : current.activeSubTab;
      return {
        toolViews: {
          ...s.toolViews,
          [toolId]: { ...current, terminals: remaining, activeSubTab },
        },
      };
    });
  },

  restartTerminal: async (toolId, termId) => {
    const tv = get().toolViews[toolId];
    if (!tv) return;
    const term = tv.terminals.find((t) => t.id === termId);
    if (!term) return;

    if (term.alive) {
      await tauri.killPty(term.ptyId).catch(() => {});
    }

    const cwd = get().settings?.baseDir || undefined;
    const ptyId = await tauri.createPty(term.command, cwd);

    const newTerm: ToolTerminal = {
      ...term,
      id: `term-${ptyId}`,
      ptyId,
      alive: true,
    };

    set((s) => {
      const tv = s.toolViews[toolId];
      if (!tv) return s;
      const terminals = tv.terminals.map((t) =>
        t.id === termId ? newTerm : t
      );
      return {
        toolViews: {
          ...s.toolViews,
          [toolId]: { ...tv, terminals, activeSubTab: newTerm.id },
        },
      };
    });
  },

  markTerminalExited: (termId) => {
    set((s) => {
      const newToolViews = { ...s.toolViews };
      for (const toolId of Object.keys(newToolViews)) {
        const tv = newToolViews[toolId];
        if (!tv.terminals.some((t) => t.id === termId)) continue;
        const terminals = tv.terminals.map((t) =>
          t.id === termId ? { ...t, alive: false } : t
        );
        newToolViews[toolId] = { ...tv, terminals };
        break;
      }
      return { toolViews: newToolViews };
    });
  },
}));
