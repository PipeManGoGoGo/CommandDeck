import { useEffect, useState } from "react";
import type { ResourceSnapshot } from "../../types";
import { getResourceSnapshot } from "../../utils/tauri";

type Level = "normal" | "warning" | "critical";

function levelFor(percent: number): Level {
  if (percent >= 80) return "critical";
  if (percent >= 60) return "warning";
  return "normal";
}

const levelClass: Record<Level, string> = {
  normal: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  critical: "border-red-400/30 bg-red-400/10 text-red-300",
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(gib >= 10 ? 1 : 2)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function percentage(used: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
}

function MetricPill({ label, value, title }: { label: string; value: number; title: string }) {
  const level = levelFor(value);
  return (
    <span
      title={title}
      className={`rounded-md border px-2 py-1 text-[10px] font-medium tabular-nums ${levelClass[level]}`}
    >
      {level === "critical" && <span className="mr-1" aria-hidden="true">!</span>}
      {label} {Math.round(value)}%
    </span>
  );
}

export function ResourceMonitor() {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.hidden) return;
      refreshing = true;
      try {
        const next = await getResourceSnapshot();
        if (!disposed) {
          setSnapshot(next);
          setError(false);
        }
      } catch {
        if (!disposed) setError(true);
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    const onVisibilityChange = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!snapshot) {
    return (
      <span className={`mx-3 text-[10px] ${error ? "text-red-300" : "text-gray-600"}`} title={error ? "无法读取系统资源" : "正在读取系统资源"}>
        {error ? "资源监控不可用" : "资源读取中…"}
      </span>
    );
  }

  const memoryPercent = percentage(snapshot.systemMemoryUsedBytes, snapshot.systemMemoryTotalBytes);
  const managedMemoryPercent = percentage(snapshot.managedMemoryBytes, snapshot.systemMemoryTotalBytes);
  const managedLevel = levelFor(Math.max(snapshot.managedCpuPercent, managedMemoryPercent));

  return (
    <div className="mx-3 flex min-w-0 items-center gap-1.5" title={error ? "最近一次刷新失败，当前显示上次采样值" : "每 3 秒刷新一次"}>
      <MetricPill
        label="CPU"
        value={snapshot.systemCpuPercent}
        title={`整机 CPU：${snapshot.systemCpuPercent.toFixed(1)}%`}
      />
      <MetricPill
        label="内存"
        value={memoryPercent}
        title={`整机内存：${formatBytes(snapshot.systemMemoryUsedBytes)} / ${formatBytes(snapshot.systemMemoryTotalBytes)}`}
      />
      <span
        className={`min-w-0 truncate rounded-md border px-2 py-1 text-[10px] tabular-nums ${
          snapshot.terminalInstances > 0 ? levelClass[managedLevel] : "border-gray-750 bg-gray-850 text-gray-500"
        }`}
        title={`CommandDeck 工具：${snapshot.terminalInstances} 个终端实例，CPU ${snapshot.managedCpuPercent.toFixed(1)}%，内存 ${formatBytes(snapshot.managedMemoryBytes)}，${snapshot.managedProcesses} 个进程，${snapshot.managedThreads} 个线程`}
      >
        工具 {snapshot.terminalInstances}
        {snapshot.terminalInstances > 0 && (
          <>
            <span className="hidden min-[1050px]:inline"> · CPU {snapshot.managedCpuPercent.toFixed(1)}% · {formatBytes(snapshot.managedMemoryBytes)}</span>
            <span className="hidden min-[1250px]:inline"> · {snapshot.managedProcesses}进程/{snapshot.managedThreads}线程</span>
          </>
        )}
      </span>
      {error && <span className="text-amber-300" title="资源数据刷新失败">•</span>}
    </div>
  );
}
