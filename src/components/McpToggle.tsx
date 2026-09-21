import { useStore } from "../store";

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("zh-CN", { hour12: false });
}

export function McpToggle({ compact = false }: { compact?: boolean }) {
  const on = useStore((s) => s.mcpEnabled);
  const busy = useStore((s) => s.mcpBusy);
  const setMcpEnabled = useStore((s) => s.setMcpEnabled);
  const last = useStore((s) => s.mcpLastAction);
  const log = useStore((s) => s.mcpLog);

  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => void setMcpEnabled(!on)}
      className="cd-switch"
      title={
        last
          ? `${last.ok ? "ok" : "失败"} ${last.summary}`
          : on
            ? "本机调试接口已开 127.0.0.1:19527"
            : "打开本机调试接口"
      }
    >
      <span />
    </button>
  );

  if (compact) {
    return (
      <label className="flex cursor-pointer items-center gap-2 px-1 text-[10px] text-gray-500">
        <span className="font-mono tracking-wide">调试口</span>
        {switchEl}
        {on && last && (
          <span className="max-w-[220px] truncate font-mono text-[10px] text-gray-500" title={last.error || last.summary}>
            {last.ok ? last.summary : `失败 ${last.summary}`}
          </span>
        )}
      </label>
    );
  }

  return (
    <div className="mb-5">
      <label className="mb-1.5 block text-xs font-medium text-gray-300">本机调试接口</label>
      <div className="cd-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="mr-3 text-[11px] leading-5 text-gray-500">
            仅 127.0.0.1:19527。Agent 可通过 MCP 新建工具、添加并运行命令；调用会出现在下面。
          </p>
          {switchEl}
        </div>
        {on && (
          <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto border-t border-gray-800 pt-2 font-mono text-[10px] leading-4 text-gray-500">
            {log.length === 0 && <li>还没有 Agent 调用。</li>}
            {log.map((entry, index) => (
              <li key={`${entry.requestId}-${entry.at}-${index}`} className={entry.ok ? "" : "text-red-300"}>
                {formatTime(entry.at)} {entry.ok ? "ok" : "err"} {entry.summary}
                {entry.error ? ` · ${entry.error}` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
