import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayController } from "../../motion";
import { useStore } from "../../store";
import { pickCommandText } from "../../utils/command";
import { fuzzyScore } from "../../utils/fuzzy";
import { AppIconImg } from "../AppIcon/AppIcon";

const RECENTS_KEY = "commanddeck-palette-recents";

type Hit = {
  key: string;
  kind: "tool" | "command";
  toolId: string;
  commandId?: string;
  title: string;
  subtitle: string;
  score: number;
};

function readRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string) {
  const next = [key, ...readRecents().filter((id) => id !== key)].slice(0, 12);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const tools = useStore((s) => s.tools);
  const categories = useStore((s) => s.categories);
  const openTool = useStore((s) => s.openTool);
  const runCommand = useStore((s) => s.runCommand);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const { overlayRef, panelRef, close } = useOverlayController(onClose);

  const items = useMemo(() => {
    const recents = readRecents();
    const catName = (id: string) => categories.find((c) => c.id === id)?.name || "";
    const list: Hit[] = [];
    for (const tool of tools) {
      if (tool.trashed) continue;
      const hay = `${tool.name} ${tool.description || ""} ${catName(tool.category_id)}`;
      const score = fuzzyScore(hay, query);
      if (score > 0) {
        list.push({
          key: `t-${tool.id}`,
          kind: "tool",
          toolId: tool.id,
          title: tool.name,
          subtitle: catName(tool.category_id) || "打开工具",
          score: score + (recents.includes(`t-${tool.id}`) ? 80 : 0),
        });
      }
      for (const command of tool.commands) {
        const text = pickCommandText(command);
        const chay = `${tool.name} ${command.label} ${text}`;
        const cscore = fuzzyScore(chay, query);
        if (query.trim() ? cscore > 0 : recents.includes(`c-${tool.id}-${command.id}`)) {
          list.push({
            key: `c-${tool.id}-${command.id}`,
            kind: "command",
            toolId: tool.id,
            commandId: command.id,
            title: command.label || "运行",
            subtitle: `${tool.name} · ${text}`,
            score: (query.trim() ? cscore : 40) + (recents.includes(`c-${tool.id}-${command.id}`) ? 90 : 0),
          });
        }
      }
    }
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, 40);
  }, [tools, categories, query]);

  useEffect(() => {
    setIndex(0);
    setExtra("");
    setError(null);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  const active = items[index];

  const run = async (openOnly = false) => {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      pushRecent(active.key);
      if (openOnly || active.kind === "tool") {
        openTool(active.toolId);
      } else if (active.commandId) {
        openTool(active.toolId);
        await runCommand(active.toolId, active.commandId, extra);
      }
      close();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  return (
    <div ref={overlayRef} className="cd-overlay z-[80] items-start pt-[12vh]" onMouseDown={close}>
      <div
        ref={panelRef}
        className="cd-dialog max-w-xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
            if (e.key === "Tab" && active?.kind === "command") {
              e.preventDefault();
              extraRef.current?.focus();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(items.length - 1, i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              void run(e.metaKey || e.ctrlKey);
            }
          }}
          placeholder="搜索工具或命令…"
          className="w-full border-b border-gray-800 bg-transparent px-4 py-3.5 text-[15px] text-gray-50 outline-none placeholder:text-gray-500"
        />
        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {items.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-gray-500">没有匹配项</p>}
          {items.map((item, i) => {
            const tool = tools.find((entry) => entry.id === item.toolId);
            return (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setIndex(i)}
              onClick={() => void run(false)}
              className={`cd-palette-row ${i === index ? "is-active" : ""}`}
            >
              <span className={`cd-mini-icon ${tool?.icon ? "" : "is-letter"}`}>
                {tool?.icon ? <AppIconImg src={tool.icon} /> : item.title.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-gray-50">{item.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-gray-500">{item.subtitle}</span>
              </span>
              <span className="cd-keycap shrink-0">
                {item.kind === "command" ? "↵" : "⌘ ↵"}
              </span>
            </button>
            );
          })}
        </div>
        {active?.kind === "command" && (
          <input
            ref={extraRef}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run(false);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
            placeholder="附加参数（Tab 聚焦，可选）"
            className="w-full border-t border-gray-800 bg-gray-950 px-4 py-2 font-mono text-xs text-gray-200 outline-none placeholder:text-gray-600"
          />
        )}
        {error && <p className="border-t border-red-400/20 px-4 py-2 text-xs text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-800 px-4 py-2 text-[12px] text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="cd-keycap">↵</span>打开/运行</span>
          <span className="inline-flex items-center gap-1.5"><span className="cd-keycap">⌘ ↵</span>只打开</span>
          <span className="inline-flex items-center gap-1.5"><span className="cd-keycap">Tab</span>参数</span>
          <span className="inline-flex items-center gap-1.5"><span className="cd-keycap">esc</span>关闭</span>
        </div>
      </div>
    </div>
  );
}
