import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";
import { useStore } from "../../store";
import { writePty, resizePty, startPty } from "../../utils/tauri";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  terminalId: string;
}

const DARK_TERMINAL_THEME = {
  background: "#070b12",
  foreground: "#d8e1ee",
  cursor: "#38bdf8",
  cursorAccent: "#070b12",
  selectionBackground: "#164e63",
  black: "#0c111b",
  brightBlack: "#64748b",
  blue: "#38bdf8",
  brightBlue: "#7dd3fc",
  green: "#34d399",
  brightGreen: "#6ee7b7",
};

const LIGHT_TERMINAL_THEME = {
  background: "#ffffff",
  foreground: "#1e293b",
  cursor: "#0284c7",
  cursorAccent: "#ffffff",
  selectionBackground: "#bae6fd",
  black: "#0f172a",
  brightBlack: "#64748b",
  blue: "#0284c7",
  brightBlue: "#0369a1",
  green: "#059669",
  brightGreen: "#047857",
};

function getTerminalTheme() {
  return document.documentElement.dataset.theme === "light"
    ? LIGHT_TERMINAL_THEME
    : DARK_TERMINAL_THEME;
}

export function Terminal({ terminalId }: Props) {
  const termRef = useStore((s) => {
    for (const tv of Object.values(s.toolViews)) {
      const t = tv.terminals.find((t) => t.id === terminalId);
      if (t) return t;
    }
    return null;
  });
  const markTerminalExited = useStore((s) => s.markTerminalExited);
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const ptyId = termRef?.ptyId;

  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !ptyId) return;

    const pending: Uint8Array[] = [];
    let xterm: XTerm | null = null;
    let disposed = false;

    const unlistenOutput = listen<number[]>(`pty_output_${ptyId}`, (e) => {
      const data = new Uint8Array(e.payload);
      if (xterm) {
        xterm.write(data, () => xterm!.scrollToBottom());
      } else {
        pending.push(data);
      }
    });

    const unlistenExit = listen(`pty_exit_${ptyId}`, () => {
      markTerminalExited(terminalId);
    });

    Promise.all([unlistenOutput, unlistenExit]).then(() => {
      if (!disposed) startPty(ptyId).catch(() => {});
    });

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text) {
        writePty(ptyId, text).catch(() => {});
      }
    };
    let cleanup: (() => void) | null = null;

    const tryInit = () => {
      if (el.offsetWidth < 10 || el.offsetHeight < 10) return;

      const cols = Math.max(40, Math.floor(el.offsetWidth / 9));
      const rows = Math.max(5, Math.floor(el.offsetHeight / 18));

      const term = new XTerm({
        cols,
        rows,
        fontSize: 14,
        fontFamily: '"Cascadia Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
        cursorBlink: true,
        scrollback: 10000,
        theme: getTerminalTheme(),
      });
      const fit = new FitAddon();
      const search = new SearchAddon();
      term.loadAddon(fit);
      term.loadAddon(search);
      term.open(el);
      fit.fit();

      for (const chunk of pending) {
        term.write(chunk);
      }
      pending.length = 0;
      term.scrollToBottom();

      term.onData((d) => {
        writePty(ptyId, d).catch(() => {});
      });

      // Ctrl+F / Cmd+F → show search bar
      term.attachCustomKeyEventHandler((e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "f" && e.type === "keydown") {
          e.preventDefault();
          setShowSearch(true);
          return false;
        }
        return true;
      });

      const syncSize = () => {
        fit.fit();
        resizePty(ptyId, term.cols, term.rows).catch(() => {});
      };
      syncSize();

      const ro = new ResizeObserver(syncSize);
      ro.observe(el);
      const themeObserver = new MutationObserver(() => {
        term.options.theme = getTerminalTheme();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      xterm = term;
      xtermRef.current = term;
      searchRef.current = search;

      cleanup = () => {
        ro.disconnect();
        themeObserver.disconnect();
        term.dispose();
        xterm = null;
        xtermRef.current = null;
        searchRef.current = null;
      };
    };

    const raf = requestAnimationFrame(tryInit);

    const visibilityRo = new ResizeObserver(() => {
      if (!xterm) tryInit();
    });
    visibilityRo.observe(el);

    const unlistenDrop = getCurrentWindow().onDragDropEvent(({ payload }) => {
      if (payload.type !== "drop") return;
      const scale = window.devicePixelRatio || 1;
      const point = { x: payload.position.x / scale, y: payload.position.y / scale };
      const rect = el.getBoundingClientRect();
      if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return;

      const isWindows = navigator.userAgent.includes("Windows");
      const quotePath = (path: string) =>
        isWindows
          ? `'${path.replace(/'/g, "''")}'`
          : `'${path.replace(/'/g, `'\\''`)}'`;
      if (payload.paths.length > 0) {
        writePty(ptyId, payload.paths.map(quotePath).join(" ")).catch(() => {});
      }
    });
    el.addEventListener("paste", onPaste, true);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      visibilityRo.disconnect();
      cleanup?.();
      el.removeEventListener("paste", onPaste, true);
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
    };
  }, [terminalId, ptyId, markTerminalExited]);

  if (!termRef) return <div className="p-4 text-gray-400">终端未找到</div>;

  return (
    <div ref={boxRef} className="flex-1 min-h-0 relative">
      {showSearch && (
        <div className="absolute top-2 right-2 z-50 flex items-center gap-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 shadow-lg">
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => {
              const v = e.target.value;
              setSearchTerm(v);
              searchRef.current?.findNext(v, { incremental: true });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                searchRef.current?.findNext(searchTerm);
              }
              if (e.key === "Enter" && e.shiftKey) {
                searchRef.current?.findPrevious(searchTerm);
              }
              if (e.key === "Escape") {
                setShowSearch(false);
                setSearchTerm("");
                xtermRef.current?.focus();
              }
            }}
            placeholder="搜索..."
            className="bg-transparent text-gray-100 text-sm outline-none w-48 placeholder-gray-500"
          />
          <button
            onClick={() => searchRef.current?.findPrevious(searchTerm)}
            className="text-gray-400 hover:text-gray-100 px-1"
          >
            ↑
          </button>
          <button
            onClick={() => searchRef.current?.findNext(searchTerm)}
            className="text-gray-400 hover:text-gray-100 px-1"
          >
            ↓
          </button>
          <button
            onClick={() => {
              setShowSearch(false);
              setSearchTerm("");
              xtermRef.current?.focus();
            }}
            className="text-gray-400 hover:text-gray-100 px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
