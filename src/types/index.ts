export interface Category {
  id: string;
  name: string;
  sort_order: number;
  color?: string;
}

export interface Command {
  id: string;
  label: string;
  command: string;
}

export interface Tool {
  id: string;
  name: string;
  category_id: string;
  description?: string;
  icon?: string;
  commands: Command[];
  note?: string;
  install_command?: string;
  download_url?: string;
  verify_command?: string;
}

export interface ToolTerminal {
  id: string;
  ptyId: string;
  commandId: string;
  commandLabel: string;
  command: string;
  num: number;
  alive: boolean;
}

export interface ToolViewState {
  activeSubTab: string;
  terminals: ToolTerminal[];
  nextNum: number;
}

export type AppView = "catalog" | "tool" | "category_manager" | "tool_form" | "settings";
export type ThemeMode = "dark" | "light";

export interface Settings {
  baseDir: string;
  theme: ThemeMode;
}

export interface ResourceSnapshot {
  systemCpuPercent: number;
  systemMemoryUsedBytes: number;
  systemMemoryTotalBytes: number;
  managedCpuPercent: number;
  managedMemoryBytes: number;
  managedProcesses: number;
  managedThreads: number;
  terminalInstances: number;
}

export interface ExportedTool {
  name: string;
  category: string;
  description?: string;
  icon?: string;
  download_url: string;
  install_type: "git" | "binary" | "python" | "custom";
  install_command: string;
  verify_command?: string;
  commands: { label: string; command: string }[];
  note?: string;
}
