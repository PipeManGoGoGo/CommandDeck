import { create } from "zustand";
import type {
  Category,
  Tool,
  ToolTerminal,
  ToolViewState,
  AppView,
  Settings,
  ThemeMode,
  ImportToolInput,
  ImportResult,
  McpActionRecord,
  NameConflictPolicy,
} from "../types";
import * as tauri from "../utils/tauri";
import { readUiSession, restoreSession, writeUiSession } from "./session";
import {
  appendArgs,
  expandVariables,
  pickCommandText,
  resolveToolDir,
  uniqueToolName,
} from "../utils/command";

const DEFAULT_CATEGORIES: Omit<Category, "id">[] = [
  { name: "开发工具", sort_order: 0, color: "#3b82f6" },
  { name: "运维管理", sort_order: 1, color: "#10b981" },
  { name: "数据处理", sort_order: 2, color: "#f59e0b" },
  { name: "AI 与自动化", sort_order: 3, color: "#8b5cf6" },
  { name: "安全测试", sort_order: 4, color: "#ef4444" },
  { name: "其他工具", sort_order: 5, color: "#64748b" },
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
  pendingToolCategoryId: string | null;
  toolViews: Record<string, ToolViewState>;
  settings: Settings | null;
  dragToolId: string | null;
  dropTargetCatId: string | null;
  activeCategoryId: string | null;
  lastToolId: string | null;
  catalogScrollTop: number;
  filterRunning: boolean;
  searchQuery: string;
  mcpEnabled: boolean;
  mcpBusy: boolean;
  mcpLog: McpActionRecord[];
  mcpLastAction: McpActionRecord | null;

  init: () => Promise<boolean>;
  setSearchQuery: (q: string) => void;
  hydrateMcp: () => Promise<void>;
  setMcpEnabled: (enabled: boolean) => Promise<void>;
  recordMcpAction: (entry: McpActionRecord) => void;
  setFilterRunning: (v: boolean) => void;
  setDragToolId: (id: string | null) => void;
  setDropTargetCatId: (id: string | null) => void;
  setActiveCategoryId: (id: string | null) => void;
  setCatalogScrollTop: (top: number) => void;
  updateSettings: (s: Settings) => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  loadWorkspace: () => Promise<void>;
  moveTool: (toolId: string, targetCatId: string) => Promise<void>;

  addCategory: (name: string) => Promise<Category>;
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (ids: string[]) => Promise<void>;

  addTool: (tool: Omit<Tool, "id">) => Promise<Tool>;
  updateTool: (id: string, data: Partial<Tool>) => Promise<void>;
  deleteTool: (id: string) => Promise<void>;
  trashTool: (id: string) => Promise<void>;
  restoreTool: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  importTools: (items: ImportToolInput[], policy: NameConflictPolicy) => Promise<ImportResult>;

  openTool: (toolId: string) => void;
  backToCatalog: () => void;
  openToolForm: (toolId?: string, categoryId?: string) => void;
  setView: (view: AppView) => void;

  setToolSubTab: (toolId: string, subTabId: string) => void;
  runCommand: (toolId: string, commandId: string, extraArgs?: string) => Promise<void>;
  runRawCommand: (toolId: string, command: string, label?: string) => Promise<void>;
  closeTerminal: (toolId: string, termId: string) => Promise<void>;
  closeTool: (toolId: string) => Promise<void>;
  closeAllTools: () => Promise<void>;
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
  const categories = parsed
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
  return categories;
}

function parseTools(json: string, categories: Category[]): Tool[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("顶层内容必须是数组");
  const categoryIds = new Set(categories.map((category) => category.id));

  return parsed.map((value, index): Tool => {
    if (!isRecord(value)) throw new Error(`第 ${index + 1} 个工具不是对象`);
    if (typeof value.id !== "string" || !value.id) throw new Error(`第 ${index + 1} 个工具缺少 id`);
    if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`第 ${index + 1} 个工具缺少名称`);
    const trashed = value.trashed === true;
    if (typeof value.category_id !== "string" || (!trashed && !categoryIds.has(value.category_id))) {
      throw new Error(`工具“${value.name}”引用了不存在的分类`);
    }
    if (!Array.isArray(value.commands)) throw new Error(`工具“${value.name}”的 commands 必须是数组`);

    const commands = value.commands.map((command, commandIndex) => {
      if (!isRecord(command)) throw new Error(`工具“${value.name}”的第 ${commandIndex + 1} 条命令不是对象`);
      if (typeof command.id !== "string" || !command.id) throw new Error(`工具“${value.name}”的第 ${commandIndex + 1} 条命令缺少 id`);
        if (typeof command.label !== "string" || typeof command.command !== "string") {
          throw new Error(`工具“${value.name}”的第 ${commandIndex + 1} 条命令格式无效`);
        }
        return {
          id: command.id,
          label: command.label,
          command: command.command,
          windows_command: optionalString(
            command.windows_command,
            `工具“${value.name}”的第 ${commandIndex + 1} 条命令的 windows_command`
          ),
        };
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
        working_dir: optionalString(value.working_dir, `工具“${value.name}”的 working_dir`),
        trashed: trashed || undefined,
      };
    });
  }

function workspaceVars(tool: Pick<Tool, "name" | "working_dir" | "download_url">, workspace: string) {
  return {
    TOOL_DIR: resolveToolDir(tool, workspace),
    DOWNLOAD_URL: tool.download_url || "",
    WORKSPACE: workspace,
  };
}

function expandForRun(
  tool: Tool,
  template: string,
  workspace: string,
  extraArgs?: string
): string {
  return appendArgs(expandVariables(template, workspaceVars(tool, workspace)), extraArgs);
}

async function commandCwd(tool: Tool, workspace: string): Promise<string> {
  const workingDir = tool.working_dir?.trim();
  if (workingDir && (await tauri.pathExists(workingDir))) return workingDir;
  return workspace;
}

async function persistWorkspace(
  dir: string,
  categories: Category[],
  tools: Tool[]
): Promise<void> {
  await tauri.writeCategories(dir, JSON.stringify(categories));
  try {
    await tauri.writeTools(dir, JSON.stringify(tools));
  } catch (error) {
    await tauri.writeCategories(dir, JSON.stringify(getSnapshotCategories()));
    throw error;
  }
}

let lastPersistedCategories: Category[] = [];

function getSnapshotCategories(): Category[] {
  return lastPersistedCategories;
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
    const tools = parseTools(toolsJson, categories);
    lastPersistedCategories = categories;
    return { categories, tools };
  } catch (error) {
    throw new Error(`tools.json 格式无效：${String(error)}`);
  }
}

function applyToolRemoval(state: AppState, id: string, tools: Tool[]): Partial<AppState> {
  const toolViews = { ...state.toolViews };
  delete toolViews[id];
  const leavingTool = state.activeToolId === id;
  const leavingForm = state.activeToolFormId === id;
  return {
    tools,
    toolViews,
    activeToolId: leavingTool ? null : state.activeToolId,
    activeToolFormId: leavingForm ? null : state.activeToolFormId,
    view: leavingTool || leavingForm ? "catalog" : state.view,
  };
}

export const useStore = create<AppState>((set, get) => ({
  categories: [],
  tools: [],
  view: "catalog",
  activeToolId: null,
  activeToolFormId: null,
  pendingToolCategoryId: null,
  toolViews: {},
  settings: null,
  dragToolId: null,
  dropTargetCatId: null,
  activeCategoryId: null,
  lastToolId: null,
  catalogScrollTop: 0,
  filterRunning: false,
  searchQuery: "",
  mcpEnabled: false,
  mcpBusy: false,
  mcpLog: [],
  mcpLastAction: null,

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
      const previous = get();
      const workspace = await readWorkspaceData(settings.baseDir);
      const sameDir = previous.settings?.baseDir === settings.baseDir;
      const warm = sameDir && Object.keys(previous.toolViews).length > 0;
      if (warm) {
        const known = new Set(workspace.tools.filter((tool) => !tool.trashed).map((tool) => tool.id));
        const toolViews = { ...previous.toolViews };
        for (const id of Object.keys(toolViews)) {
          if (!known.has(id)) delete toolViews[id];
        }
        const activeToolId =
          previous.activeToolId && known.has(previous.activeToolId) ? previous.activeToolId : previous.view === "tool" ? null : previous.activeToolId;
        const view = previous.view === "tool" && !activeToolId ? "catalog" : previous.view;
        const catOk = workspace.categories.some((category) => category.id === previous.activeCategoryId);
        set({
          settings,
          ...workspace,
          toolViews,
          view,
          activeToolId,
          lastToolId: previous.lastToolId,
          catalogScrollTop: previous.catalogScrollTop,
          activeCategoryId: catOk ? previous.activeCategoryId : workspace.categories[0]?.id ?? null,
        });
        return true;
      }

      set({ settings });
      let live: Awaited<ReturnType<typeof tauri.listPtys>> = [];
      try {
        live = await tauri.listPtys();
      } catch {
        live = [];
      }
      const restored = restoreSession(
        settings.baseDir,
        workspace.tools,
        workspace.categories.map((category) => category.id),
        live,
        readUiSession()
      );
      set({
        settings,
        ...workspace,
        ...restored,
        activeCategoryId: restored.activeCategoryId ?? workspace.categories[0]?.id ?? null,
      });
      writeUiSession({
        baseDir: settings.baseDir,
        view: restored.view,
        activeToolId: restored.activeToolId,
        lastToolId: restored.lastToolId,
        activeCategoryId: restored.activeCategoryId ?? workspace.categories[0]?.id ?? null,
        catalogScrollTop: restored.catalogScrollTop,
        toolViews: restored.toolViews,
      });
      return true;
    }
    set({ settings: null });
    return false;
  },

  loadWorkspace: async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;

    const workspace = await readWorkspaceData(dir);
    const current = get().activeCategoryId;
    const keep =
      current && workspace.categories.some((category) => category.id === current)
        ? current
        : workspace.categories[0]?.id ?? null;
    set({ categories: workspace.categories, tools: workspace.tools, activeCategoryId: keep });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  hydrateMcp: async () => {
    const wanted = localStorage.getItem("commanddeck.mcp.enabled") === "1";
    try {
      let enabled = await tauri.debugApiStatus();
      if (wanted && !enabled) enabled = await tauri.debugSetEnabled(true);
      set({ mcpEnabled: enabled });
    } catch {
      set({ mcpEnabled: false });
    }
  },
  setMcpEnabled: async (enabled) => {
    if (get().mcpBusy) return;
    set({ mcpBusy: true });
    try {
      const next = await tauri.debugSetEnabled(enabled);
      localStorage.setItem("commanddeck.mcp.enabled", next ? "1" : "0");
      set({ mcpEnabled: next, mcpBusy: false });
    } catch {
      set({ mcpEnabled: false, mcpBusy: false });
    }
  },
  recordMcpAction: (entry) =>
    set((state) => ({
      mcpLastAction: entry,
      mcpLog: [entry, ...state.mcpLog].slice(0, 40),
    })),
  setFilterRunning: (v) => set({ filterRunning: v }),
  setDragToolId: (id) => set({ dragToolId: id, ...(id ? {} : { dropTargetCatId: null }) }),
  setDropTargetCatId: (id) => set({ dropTargetCatId: id }),
  setActiveCategoryId: (id) => set({ activeCategoryId: id }),
  setCatalogScrollTop: (top) => set({ catalogScrollTop: top }),
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
    const previous = get().tools;
    const tools = previous.map((t) =>
      t.id === toolId ? { ...t, category_id: targetCatId } : t
    );
    set({ tools });
    try {
      await tauri.writeTools(dir, JSON.stringify(tools));
    } catch (error) {
      set({ tools: previous });
      throw error;
    }
  }),

  addCategory: (name) => serializeCategoriesMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) throw new Error("请先选择工作目录");
    const state = get();
    const cat: Category = {
      id: generateId(),
      name,
      sort_order: state.categories.length,
    };
    const categories = [...state.categories, cat];
    await tauri.writeCategories(dir, JSON.stringify(categories));
    lastPersistedCategories = categories;
    set((current) => ({
      categories,
      activeCategoryId: current.activeCategoryId ?? cat.id,
    }));
    return cat;
  }),

  updateCategory: (id, data) => serializeCategoriesMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const categories = get().categories.map((c) =>
      c.id === id ? { ...c, ...data } : c
    );
    await tauri.writeCategories(dir, JSON.stringify(categories));
    lastPersistedCategories = categories;
    set({ categories });
  }),

  deleteCategory: (id) => serializeCategoriesMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const state = get();
    if (state.tools.some((tool) => !tool.trashed && tool.category_id === id)) {
      throw new Error("分类中仍有工具，无法删除");
    }
    const categories = state.categories.filter((c) => c.id !== id);
    await tauri.writeCategories(dir, JSON.stringify(categories));
    lastPersistedCategories = categories;
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
    const previous = state.categories;
    const categories = ids
      .map((id, i) => {
        const cat = map.get(id);
        return cat ? { ...cat, sort_order: i } : null;
      })
      .filter(Boolean) as Category[];
    set({ categories });
    try {
      await tauri.writeCategories(dir, JSON.stringify(categories));
      lastPersistedCategories = categories;
    } catch (error) {
      set({ categories: previous });
      throw error;
    }
  }),

  addTool: (tool) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) throw new Error("请先选择工作目录");
    const newTool: Tool = { ...tool, id: generateId() };
    const tools = [...get().tools, newTool];
    await tauri.writeTools(dir, JSON.stringify(tools));
    set({ tools });
    return newTool;
  }),

  importTools: (items, policy) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) throw new Error("请先选择工作目录");
    await categoriesMutationQueue;

    const previousCategories = get().categories;
    const previousTools = get().tools;
    const categories = [...previousCategories];
    const tools = [...previousTools];
    const catMap = new Map(categories.map((category) => [category.name, category.id]));
    const existingLower = new Set(tools.map((tool) => tool.name.toLocaleLowerCase()));
    const result: ImportResult = { imported: 0, skipped: 0, renamed: 0, overwritten: 0 };

    try {
      for (const item of items) {
        const categoryName = item.category.trim() || "其他工具";
        let catId = catMap.get(categoryName);
        if (!catId) {
          const cat: Category = {
            id: generateId(),
            name: categoryName,
            sort_order: categories.length,
          };
          categories.push(cat);
          catMap.set(categoryName, cat.id);
          catId = cat.id;
        }

        const originalName = item.name.trim();
        const key = originalName.toLocaleLowerCase();
        const existingIndex = tools.findIndex((tool) => tool.name.toLocaleLowerCase() === key);
        if (existingIndex >= 0) {
          if (policy === "skip") {
            result.skipped += 1;
            continue;
          }
          if (policy === "overwrite") {
            const existing = tools[existingIndex];
            tools[existingIndex] = {
              ...existing,
              description: item.description,
              icon: item.icon,
              commands: item.commands.map((command) => ({
                id: generateId(),
                label: command.label,
                command: command.command,
                windows_command: command.windows_command,
              })),
              note: item.note,
              install_command: item.install_command,
              download_url: item.download_url,
              verify_command: item.verify_command,
            };
            result.overwritten += 1;
            result.imported += 1;
            continue;
          }
        }

        const name = existingIndex >= 0 ? uniqueToolName(originalName, existingLower) : originalName;
        if (name !== originalName) result.renamed += 1;
        existingLower.add(name.toLocaleLowerCase());
        tools.push({
          id: generateId(),
          name,
          category_id: catId,
          description: item.description,
          icon: item.icon,
          commands: item.commands.map((command) => ({
            id: generateId(),
            label: command.label,
            command: command.command,
            windows_command: command.windows_command,
          })),
          note: item.note,
          install_command: item.install_command,
          download_url: item.download_url,
          verify_command: item.verify_command,
        });
        result.imported += 1;
      }

      await persistWorkspace(dir, categories, tools);
      lastPersistedCategories = categories;
      set((current) => ({
        categories,
        tools,
        activeCategoryId: current.activeCategoryId ?? categories[0]?.id ?? null,
      }));
      return result;
    } catch (error) {
      set({ categories: previousCategories, tools: previousTools });
      lastPersistedCategories = previousCategories;
      try {
        await persistWorkspace(dir, previousCategories, previousTools);
      } catch {
        // Keep in-memory snapshot even if restoring files fails.
      }
      throw error;
    }
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

  trashTool: (id) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const toolView = get().toolViews[id];
    if (toolView) {
      await Promise.all(toolView.terminals.map((terminal) => tauri.killPty(terminal.ptyId)));
    }
    const previous = get().tools;
    const tools = previous.map((tool) => (tool.id === id ? { ...tool, trashed: true } : tool));
    set((state) => applyToolRemoval(state, id, tools));
    try {
      await tauri.writeTools(dir, JSON.stringify(tools));
    } catch (error) {
      set({ tools: previous });
      throw error;
    }
  }),

  restoreTool: (id) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const previous = get().tools;
    const categories = get().categories;
    const tools = previous.map((tool) => {
      if (tool.id !== id) return tool;
      const categoryId = categories.some((category) => category.id === tool.category_id)
        ? tool.category_id
        : categories[0]?.id;
      if (!categoryId) throw new Error("没有可用分类，无法还原");
      return { ...tool, trashed: undefined, category_id: categoryId };
    });
    set({ tools });
    try {
      await tauri.writeTools(dir, JSON.stringify(tools));
    } catch (error) {
      set({ tools: previous });
      throw error;
    }
  }),

  emptyTrash: () => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const previous = get().tools;
    const tools = previous.filter((tool) => !tool.trashed);
    set({ tools });
    try {
      await tauri.writeTools(dir, JSON.stringify(tools));
    } catch (error) {
      set({ tools: previous });
      throw error;
    }
  }),

  deleteTool: (id) => serializeToolsMutation(async () => {
    const dir = get().settings?.baseDir;
    if (!dir) return;
    const toolView = get().toolViews[id];
    if (toolView) {
      await Promise.all(
        toolView.terminals.map((terminal) => tauri.killPty(terminal.ptyId))
      );
    }
    const tools = get().tools.filter((t) => t.id !== id);
    await tauri.writeTools(dir, JSON.stringify(tools));
    set((state) => applyToolRemoval(state, id, tools));
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
      return { view: "tool", activeToolId: toolId, lastToolId: toolId, toolViews };
    });
  },

  backToCatalog: () =>
    set((s) => ({
      view: "catalog",
      activeToolId: null,
      lastToolId: s.activeToolId ?? s.lastToolId,
    })),

  openToolForm: (toolId, categoryId) =>
    set({
      view: "tool_form",
      activeToolFormId: toolId || null,
      pendingToolCategoryId: toolId ? null : categoryId || null,
    }),

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

  runCommand: async (toolId, commandId, extraArgs) => {
    const tool = get().tools.find((t) => t.id === toolId);
    if (!tool) return;
    const cmd = tool.commands.find((c) => c.id === commandId);
    if (!cmd) return;
    const workspace = get().settings?.baseDir;
    if (!workspace) throw new Error("请先选择工作目录");

    const template = pickCommandText(cmd);
    const expanded = expandForRun(tool, template, workspace, extraArgs);
    const cwd = await commandCwd(tool, workspace);
    const commandLabel = extraArgs?.trim() ? `${cmd.label} +参数` : cmd.label;
    const num = get().toolViews[toolId]?.nextNum ?? 1;
    const ptyId = await tauri.createPty(expanded, cwd, {
      toolId,
      commandId: cmd.id,
      commandLabel,
      num,
    });
    const terminal: ToolTerminal = {
      id: `term-${ptyId}`,
      ptyId,
      commandId: cmd.id,
      commandLabel,
      command: expanded,
      num: 0,
      alive: true,
    };

    if (!get().tools.some((candidate) => candidate.id === toolId)) {
      await tauri.killPty(ptyId);
      return;
    }
    get().addTerminalToView(toolId, terminal);
  },

  runRawCommand: async (toolId, command, label) => {
    const tool = get().tools.find((t) => t.id === toolId);
    if (!tool) return;
    const workspace = get().settings?.baseDir;
    if (!workspace) throw new Error("请先选择工作目录");
    const trimmed = command.trim();
    if (!trimmed) return;

    const expanded = expandForRun(tool, trimmed, workspace);
    const cwd = await commandCwd(tool, workspace);
    const commandLabel = label?.trim() || "笔记命令";
    const num = get().toolViews[toolId]?.nextNum ?? 1;
    const ptyId = await tauri.createPty(expanded, cwd, {
      toolId,
      commandId: "note",
      commandLabel,
      num,
    });
    const terminal: ToolTerminal = {
      id: `term-${ptyId}`,
      ptyId,
      commandId: "note",
      commandLabel,
      command: expanded,
      num: 0,
      alive: true,
    };

    if (!get().tools.some((candidate) => candidate.id === toolId)) {
      await tauri.killPty(ptyId);
      return;
    }
    get().addTerminalToView(toolId, terminal);
  },

  closeTool: async (toolId) => {
    const tv = get().toolViews[toolId];
    if (tv) {
      await Promise.all(tv.terminals.map((terminal) => tauri.killPty(terminal.ptyId)));
    }
    set((state) => {
      const toolViews = { ...state.toolViews };
      delete toolViews[toolId];
      const leaving = state.activeToolId === toolId;
      return {
        toolViews,
        activeToolId: leaving ? null : state.activeToolId,
        view: leaving ? "catalog" : state.view,
      };
    });
  },

  closeAllTools: async () => {
    await tauri.killAllPtys();
    set({ toolViews: {}, activeToolId: null, view: "catalog" });
  },

  closeTerminal: async (toolId, termId) => {
    const tv = get().toolViews[toolId];
    if (!tv) return;
    const term = tv.terminals.find((t) => t.id === termId);
    if (!term) return;

    await tauri.killPty(term.ptyId);

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

    await tauri.killPty(term.ptyId);

    const tool = get().tools.find((t) => t.id === toolId);
    const workspace = get().settings?.baseDir;
    if (!workspace) throw new Error("请先选择工作目录");
    const cwd = tool ? await commandCwd(tool, workspace) : workspace;
    const ptyId = await tauri.createPty(term.command, cwd, {
      toolId,
      commandId: term.commandId,
      commandLabel: term.commandLabel,
      num: term.num,
    });

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

let persistTimer = 0;
function persistSession(state: ReturnType<typeof useStore.getState>) {
  const dir = state.settings?.baseDir;
  if (!dir) return;
  writeUiSession({
    baseDir: dir,
    view: state.view === "tool" ? "tool" : "catalog",
    activeToolId: state.activeToolId,
    lastToolId: state.lastToolId,
    activeCategoryId: state.activeCategoryId,
    catalogScrollTop: state.catalogScrollTop,
    toolViews: state.toolViews,
  });
}

useStore.subscribe((state, prev) => {
  if (!state.settings?.baseDir) return;
  const scrollOnly =
    state.catalogScrollTop !== prev.catalogScrollTop &&
    state.toolViews === prev.toolViews &&
    state.view === prev.view &&
    state.activeToolId === prev.activeToolId &&
    state.lastToolId === prev.lastToolId &&
    state.activeCategoryId === prev.activeCategoryId;
  if (
    !scrollOnly &&
    state.toolViews === prev.toolViews &&
    state.view === prev.view &&
    state.activeToolId === prev.activeToolId &&
    state.lastToolId === prev.lastToolId &&
    state.activeCategoryId === prev.activeCategoryId &&
    state.catalogScrollTop === prev.catalogScrollTop
  ) {
    return;
  }
  if (scrollOnly) {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => persistSession(useStore.getState()), 160);
    return;
  }
  persistSession(state);
});
