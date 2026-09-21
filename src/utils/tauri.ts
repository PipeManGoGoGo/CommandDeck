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

export function createPty(
  command: string,
  cwd?: string,
  meta?: { toolId: string; commandId: string; commandLabel: string; num: number }
): Promise<string> {
  return invoke("create_pty", {
    command,
    cwd: cwd || undefined,
    toolId: meta?.toolId,
    commandId: meta?.commandId,
    commandLabel: meta?.commandLabel,
    num: meta?.num,
  });
}

export function listPtys(): Promise<{
  id: string;
  toolId: string;
  commandId: string;
  commandLabel: string;
  command: string;
  num: number;
  alive: boolean;
}[]> {
  return invoke("list_ptys");
}

export type PtyReplay = { seq: number; data: number[] };
export type PtyChunk = { seq: number; data: number[] };

export function startPty(ptyId: string): Promise<PtyReplay> {
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

export function debugApiStatus(): Promise<boolean> {
  return invoke("debug_api_status");
}

export function debugSetEnabled(enabled: boolean): Promise<boolean> {
  return invoke("debug_set_enabled", { enabled });
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

export function pathExists(path: string): Promise<boolean> {
  return invoke("path_exists", { path });
}

export function openExternal(target: string): Promise<void> {
  return invoke("open_external", { target });
}

export function convertIcon(bytes: number[], filename: string): Promise<number[]> {
  return invoke("convert_icon", { bytes, filename });
}

export function exportPack(
  dest: string,
  manifest: string,
  sources: { src: string; dest: string }[]
): Promise<void> {
  return invoke("export_pack", { dest, manifest, sources });
}

export function extractPack(
  src: string,
  dest: string
): Promise<{ manifest: string; root: string }> {
  return invoke("extract_pack", { src, dest });
}

export function copyDir(src: string, dest: string): Promise<void> {
  return invoke("copy_dir", { src, dest });
}

export function removeImportTemp(path: string): Promise<void> {
  return invoke("remove_import_temp", { path });
}
