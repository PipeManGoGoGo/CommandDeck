export function isWindowsPlatform(): boolean {
  return navigator.userAgent.includes("Windows");
}

export function pathSeparator(): "\\" | "/" {
  return isWindowsPlatform() ? "\\" : "/";
}

export function joinPath(...parts: string[]): string {
  const sep = pathSeparator();
  return parts
    .map((part, index) => {
      if (index === 0) return part.replace(/[\\/]+$/, "");
      return part.replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
    })
    .filter((part, index) => part.length > 0 || index === 0)
    .join(sep);
}

export function safeToolName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

export function defaultToolDir(workspace: string, toolName: string): string {
  return joinPath(workspace, "tools", safeToolName(toolName));
}

export function resolveToolDir(
  tool: { name: string; working_dir?: string },
  workspace: string
): string {
  const workingDir = tool.working_dir?.trim();
  return workingDir || defaultToolDir(workspace, tool.name);
}

export function pickCommandText(command: {
  command: string;
  windows_command?: string;
}): string {
  if (isWindowsPlatform()) {
    return command.windows_command?.trim() || command.command;
  }
  return command.command.trim() || command.windows_command || command.command;
}

export function expandVariables(
  template: string,
  vars: { TOOL_DIR: string; DOWNLOAD_URL: string; WORKSPACE: string }
): string {
  return template
    .replace(/\{\{TOOL_DIR\}\}/g, vars.TOOL_DIR)
    .replace(/\{\{DOWNLOAD_URL\}\}/g, vars.DOWNLOAD_URL)
    .replace(/\{\{WORKSPACE\}\}/g, vars.WORKSPACE);
}

export function appendArgs(command: string, extraArgs?: string): string {
  const extra = extraArgs?.trim();
  if (!extra) return command;
  return `${command} ${extra}`;
}

export function uniqueToolName(base: string, existingLower: Set<string>): string {
  const trimmed = base.trim();
  if (!existingLower.has(trimmed.toLocaleLowerCase())) return trimmed;
  let index = 2;
  while (existingLower.has(`${trimmed} (${index})`.toLocaleLowerCase())) {
    index += 1;
  }
  return `${trimmed} (${index})`;
}
