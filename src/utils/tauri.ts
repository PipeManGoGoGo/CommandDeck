import { invoke } from "@tauri-apps/api/core";
import type { ResourceSnapshot } from "../types";

export function readTools(dir: string): Promise<string> {
  return invoke("read_tools", { dir });
}

export function writeTools(dir: string, data: string): Promise<void> {
  return invoke("write_tools", { dir, data });
}

export function readCategories(dir: string): Promise<string> {
  return invoke("read_categories", { dir });
}

export function writeCategories(dir: string, data: string): Promise<void> {
  return invoke("write_categories", { dir, data });
}

export function readSettings(): Promise<string> {
  return invoke("read_settings");
}

export function writeSettings(data: string): Promise<void> {
  return invoke("write_settings", { data });
}

export function createPty(command: string, cwd?: string): Promise<string> {
  return invoke("create_pty", { command, cwd: cwd || undefined });
}

export function startPty(ptyId: string): Promise<void> {
  return invoke("start_pty", { ptyId });
}

export function writePty(ptyId: string, data: string): Promise<void> {
  return invoke("write_pty", { ptyId, data });
}

export function resizePty(
  ptyId: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke("resize_pty", { ptyId, cols, rows });
}

export function killPty(ptyId: string): Promise<void> {
  return invoke("kill_pty", { ptyId });
}

export function countPtys(): Promise<number> {
  return invoke("count_ptys");
}

export function killAllPtys(): Promise<void> {
  return invoke("kill_all_ptys");
}

export function confirmClose(): Promise<void> {
  return invoke("confirm_close");
}

export function getResourceSnapshot(): Promise<ResourceSnapshot> {
  return invoke("get_resource_snapshot");
}
