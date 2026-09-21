#!/usr/bin/env node
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

const BASE = process.env.COMMANDDECK_DEBUG_URL || "http://127.0.0.1:19527";

const TOOLS = [
  {
    name: "get_state",
    description: "Read CommandDeck UI + PTY state, recent MCP actions, tools and running terminals. Use this to inspect agent tool calls.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tools",
    description: "List catalog tools (id, name, category, commands with command text) and recent MCP log.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_tool",
    description: "Create a CommandDeck tool (optionally with commands). If a command is provided it is run by default so the user can watch it in the app.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        category: { type: "string", description: "Category name; created if missing. Defaults to AI 与自动化." },
        categoryId: { type: "string" },
        description: { type: "string" },
        note: { type: "string" },
        command: { type: "string", description: "Single shell command to add (and run by default)." },
        commandLabel: { type: "string" },
        commands: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              command: { type: "string" },
              windows_command: { type: "string" },
            },
          },
        },
        run: { type: "boolean", description: "Run the first command after create. Default true if a command is provided." },
        open: { type: "boolean", description: "Open the tool view. Default true." },
      },
    },
  },
  {
    name: "add_command",
    description: "Add a saved command to an existing tool. Set run=true to start it immediately.",
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        toolId: { type: "string" },
        name: { type: "string" },
        label: { type: "string" },
        command: { type: "string" },
        windows_command: { type: "string" },
        run: { type: "boolean" },
      },
    },
  },
  {
    name: "open_tool",
    description: "Open a tool by id or exact name.",
    inputSchema: {
      type: "object",
      properties: { toolId: { type: "string" }, name: { type: "string" } },
    },
  },
  {
    name: "back_to_catalog",
    description: "Leave the current tool view without killing PTYs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "select_category",
    description: "Select a sidebar category (also returns to catalog).",
    inputSchema: {
      type: "object",
      properties: { categoryId: { type: "string" }, name: { type: "string" } },
    },
  },
  {
    name: "run_command",
    description: "Run a saved tool command (defaults to the first command) and open the tool so the user can watch.",
    inputSchema: {
      type: "object",
      properties: {
        toolId: { type: "string" },
        name: { type: "string" },
        commandId: { type: "string" },
        extraArgs: { type: "string" },
      },
    },
  },
  {
    name: "run_raw",
    description: "Run an ad-hoc shell command in a tool terminal (does not save it). Opens the tool so the user can inspect output.",
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        toolId: { type: "string" },
        name: { type: "string" },
        command: { type: "string" },
        label: { type: "string" },
      },
    },
  },
  {
    name: "close_tool",
    description: "Close a tool and kill its terminals.",
    inputSchema: { type: "object", properties: { toolId: { type: "string" } } },
  },
  {
    name: "close_all",
    description: "Kill all PTYs and return to catalog.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function http(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`debug API ${response.status}: ${text}`);
  }
  return json;
}

async function getState() {
  return http("GET", "/state");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function action(body) {
  const requestId = randomUUID();
  await http("POST", "/action", { ...body, requestId });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const state = await getState();
    if (state.mcpLastAction?.requestId === requestId) {
      if (!state.mcpLastAction.ok) {
        throw new Error(state.mcpLastAction.error || "CommandDeck action failed");
      }
      return state;
    }
    await sleep(80);
  }
  throw new Error("action timed out waiting for CommandDeck");
}

function findTool(state, toolId, name) {
  const tools = state.tools || [];
  if (toolId) return tools.find((tool) => tool.id === toolId);
  if (name) {
    const needle = name.toLowerCase();
    return tools.find((tool) => String(tool.name).toLowerCase() === needle)
      || tools.find((tool) => String(tool.name).toLowerCase().includes(needle));
  }
  return null;
}

function findCategory(state, categoryId, name) {
  const categories = state.categories || [];
  if (categoryId) return categories.find((category) => category.id === categoryId);
  if (name) {
    const needle = name.toLowerCase();
    return categories.find((category) => String(category.name).toLowerCase() === needle)
      || categories.find((category) => String(category.name).toLowerCase().includes(needle));
  }
  return null;
}

async function callTool(name, args = {}) {
  if (name === "get_state") return getState();
  if (name === "list_tools") {
    const state = await getState();
    return {
      categories: state.categories,
      tools: state.tools,
      ptyCount: state.ptyCount,
      view: state.view,
      mcpLog: state.mcpLog,
    };
  }
  if (name === "back_to_catalog") return action({ op: "back_to_catalog" });
  if (name === "close_all") return action({ op: "close_all" });
  if (name === "create_tool") {
    return action({
      op: "create_tool",
      name: args.name,
      category: args.category,
      categoryId: args.categoryId,
      description: args.description,
      note: args.note,
      command: args.command,
      commandLabel: args.commandLabel,
      commands: args.commands,
      run: args.run,
      open: args.open,
    });
  }
  if (name === "open_tool" || name === "run_command" || name === "close_tool" || name === "run_raw" || name === "add_command") {
    const state = await getState();
    const tool = findTool(state, args.toolId, args.name) || (args.toolId ? { id: args.toolId } : null);
    if (!tool) throw new Error("tool not found");
    if (name === "open_tool") return action({ op: "open_tool", toolId: tool.id });
    if (name === "close_tool") return action({ op: "close_tool", toolId: tool.id });
    if (name === "run_raw") {
      return action({ op: "run_raw", toolId: tool.id, command: args.command, label: args.label });
    }
    if (name === "add_command") {
      return action({
        op: "add_command",
        toolId: tool.id,
        label: args.label,
        command: args.command,
        windows_command: args.windows_command,
        run: args.run,
      });
    }
    const commandId = args.commandId || tool.commands?.[0]?.id;
    if (!commandId) throw new Error("command not found");
    return action({ op: "run_command", toolId: tool.id, commandId, extraArgs: args.extraArgs });
  }
  if (name === "select_category") {
    const state = await getState();
    const category = findCategory(state, args.categoryId, args.name);
    if (!category) throw new Error("category not found");
    return action({ op: "select_category", categoryId: category.id });
  }
  throw new Error(`unknown tool: ${name}`);
}

function reply(id, result, error) {
  const message = error
    ? { jsonrpc: "2.0", id, error: { code: -32000, message: String(error) } }
    : { jsonrpc: "2.0", id, result };
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "commanddeck", version: "0.1.3" },
      });
      return;
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") return;
    if (method === "tools/list") {
      reply(id, { tools: TOOLS });
      return;
    }
    if (method === "tools/call") {
      const result = await callTool(params?.name, params?.arguments || {});
      reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      return;
    }
    if (id !== undefined) reply(id, null, `unsupported method: ${method}`);
  } catch (error) {
    if (id !== undefined) reply(id, null, error);
  }
});
