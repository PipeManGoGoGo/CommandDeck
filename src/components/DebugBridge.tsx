import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import type { Command, McpActionRecord } from "../types";

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function snapshot() {
  const state = useStore.getState();
  return {
    view: state.view,
    activeToolId: state.activeToolId,
    activeCategoryId: state.activeCategoryId,
    categories: state.categories.map((category) => ({ id: category.id, name: category.name })),
    tools: state.tools
      .filter((tool) => !tool.trashed)
      .map((tool) => ({
        id: tool.id,
        name: tool.name,
        categoryId: tool.category_id,
        commands: tool.commands.map((command) => ({
          id: command.id,
          label: command.label,
          command: command.command,
        })),
      })),
    toolViews: Object.fromEntries(
      Object.entries(state.toolViews).map(([id, view]) => [
        id,
        {
          activeSubTab: view.activeSubTab,
          nextNum: view.nextNum,
          terminals: view.terminals.map((terminal) => ({
            id: terminal.id,
            ptyId: terminal.ptyId,
            label: terminal.commandLabel,
            command: terminal.command,
            alive: terminal.alive,
          })),
        },
      ])
    ),
    mcpLastAction: state.mcpLastAction,
    mcpLog: state.mcpLog,
  };
}

function pushState() {
  void invoke("debug_push_state", { json: JSON.stringify(snapshot()) }).catch(() => {});
}

function parseCommands(action: Record<string, unknown>): Command[] {
  const out: Command[] = [];
  const list = Array.isArray(action.commands) ? action.commands : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const command = str(row.command).trim();
    if (!command) continue;
    out.push({
      id: crypto.randomUUID(),
      label: str(row.label).trim() || "默认",
      command,
      windows_command: str(row.windows_command).trim() || undefined,
    });
  }
  const single = str(action.command).trim();
  if (single) {
    out.push({
      id: crypto.randomUUID(),
      label: str(action.commandLabel).trim() || "默认",
      command: single,
    });
  }
  return out;
}

async function handleAction(action: Record<string, unknown>) {
  const store = useStore.getState();
  const op = str(action.op);
  const requestId = str(action.requestId);
  let toolId = "";
  let commandId = "";
  let summary = op;

  const finish = (ok: boolean, error?: string) => {
    const entry: McpActionRecord = {
      requestId,
      op,
      ok,
      error,
      summary,
      toolId: toolId || undefined,
      commandId: commandId || undefined,
      at: Date.now(),
    };
    useStore.getState().recordMcpAction(entry);
  };

  try {
    if (op === "back_to_catalog") {
      store.backToCatalog();
      summary = "返回目录";
    } else if (op === "open_tool") {
      toolId = str(action.toolId);
      if (!toolId) throw new Error("toolId required");
      store.openTool(toolId);
      summary = `打开 ${store.tools.find((tool) => tool.id === toolId)?.name || toolId}`;
    } else if (op === "select_category") {
      const id = str(action.categoryId);
      store.setActiveCategoryId(id);
      if (store.view !== "catalog") store.backToCatalog();
      summary = `选择分类 ${store.categories.find((category) => category.id === id)?.name || id}`;
    } else if (op === "run_command") {
      toolId = str(action.toolId);
      commandId = str(action.commandId);
      const extra = str(action.extraArgs).trim() || undefined;
      await store.runCommand(toolId, commandId, extra);
      store.openTool(toolId);
      const tool = useStore.getState().tools.find((item) => item.id === toolId);
      const command = tool?.commands.find((item) => item.id === commandId);
      summary = `运行 ${tool?.name || toolId} / ${command?.label || commandId}`;
    } else if (op === "run_raw") {
      toolId = str(action.toolId);
      const command = str(action.command).trim();
      if (!command) throw new Error("command required");
      const label = str(action.label).trim() || "MCP 命令";
      await store.runRawCommand(toolId, command, label);
      store.openTool(toolId);
      summary = `运行 ${command}`;
    } else if (op === "create_tool") {
      const name = str(action.name).trim();
      if (!name) throw new Error("name required");
      let categoryId = str(action.categoryId).trim();
      if (!categoryId) {
        const categoryName = str(action.category).trim();
        let category = categoryName
          ? store.categories.find((item) => item.name === categoryName)
            || store.categories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase())
          : store.categories.find((item) => item.id === store.activeCategoryId)
            || store.categories.find((item) => item.name === "AI 与自动化")
            || store.categories[0];
        if (!category && categoryName) {
          category = await store.addCategory(categoryName);
        }
        categoryId = category?.id || "";
      }
      if (!categoryId) throw new Error("category not found");
      const commands = parseCommands(action);
      const created = await store.addTool({
        name,
        category_id: categoryId,
        description: str(action.description).trim() || undefined,
        note: str(action.note).trim() || undefined,
        commands,
      });
      toolId = created.id;
      commandId = created.commands[0]?.id || "";
      summary = `新建 ${created.name}`;
      const shouldRun = action.run == null ? commands.length > 0 : Boolean(action.run);
      if (action.open !== false || shouldRun) store.openTool(created.id);
      if (shouldRun && commandId) await useStore.getState().runCommand(created.id, commandId);
    } else if (op === "add_command") {
      toolId = str(action.toolId);
      const tool = store.tools.find((item) => item.id === toolId);
      if (!tool) throw new Error("tool not found");
      const command = str(action.command).trim();
      if (!command) throw new Error("command required");
      const next: Command = {
        id: crypto.randomUUID(),
        label: str(action.label).trim() || "默认",
        command,
        windows_command: str(action.windows_command).trim() || undefined,
      };
      commandId = next.id;
      await store.updateTool(toolId, { commands: [...tool.commands, next] });
      summary = `给 ${tool.name} 添加 ${next.label}`;
      if (action.run) {
        await useStore.getState().runCommand(toolId, next.id);
        useStore.getState().openTool(toolId);
      }
    } else if (op === "close_tool") {
      toolId = str(action.toolId || store.activeToolId);
      await store.closeTool(toolId);
      summary = `关闭 ${toolId}`;
    } else if (op === "close_all") {
      await store.closeAllTools();
      summary = "关闭全部终端";
    } else {
      throw new Error(`unknown op: ${op || "(empty)"}`);
    }
    finish(true);
  } catch (error) {
    finish(false, String(error));
  }
}

export function DebugBridge() {
  useEffect(() => {
    pushState();
    const unsub = useStore.subscribe(pushState);
    const unlisten = listen<Record<string, unknown>>("debug-action", (event) => {
      void handleAction(event.payload || {}).finally(pushState);
    });
    return () => {
      unsub();
      void unlisten.then((fn) => fn());
    };
  }, []);
  return null;
}
