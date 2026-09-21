import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";
import { useStore } from "../../store";
import { killPty, writePty, resizePty, startPty, openExternal, type PtyChunk } from "../../utils/tauri";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getTerminalSearchDecorations, getTerminalTheme } from "../../theme/palettes";
import { getTermFontFamily } from "../../theme/fonts";

interface Props {
  terminalId: string;
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
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [termSize, setTermSize] = useState({ cols: 0, rows: 0 });
  const [searchHits, setSearchHits] = useState({ index: -1, count: 0 });
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [searchCase, setSearchCase] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !ptyId) return;

    const pending: { seq: number; data: Uint8Array }[] = [];
    let xterm: XTerm | null = null;
    let disposed = false;
    let replaySeq = 0;
    let replayReady = false;
    let history: Uint8Array | null = null;

    const writeLive = (seq: number, data: Uint8Array) => {
      if (seq <= replaySeq) return;
      if (xterm && replayReady) xterm.write(data);
      else pending.push({ seq, data });
    };

    const flushReplay = () => {
      if (!xterm || !replayReady) return;
      if (history && history.length) xterm.write(history);
      history = null;
      for (const chunk of pending) {
        if (chunk.seq > replaySeq) xterm.write(chunk.data);
      }
      pending.length = 0;
      xterm.scrollToBottom();
    };

    const unlistenOutput = listen<PtyChunk>(`pty_output_${ptyId}`, (e) => {
      const payload = e.payload;
      writeLive(payload.seq, new Uint8Array(payload.data));
    });

    const unlistenExit = listen(`pty_exit_${ptyId}`, () => {
      markTerminalExited(terminalId);
    });

    const unlistenCleanupError = listen<string>(`pty_cleanup_error_${ptyId}`, (event) => {
      setRuntimeError(`终端清理失败，可重试关闭：${event.payload}`);
    });

    void Promise.all([unlistenOutput, unlistenExit, unlistenCleanupError])
      .then(() => {
        if (!disposed) {
          startPty(ptyId)
            .then((replay) => {
              if (disposed) return;
              replaySeq = replay.seq ?? 0;
              history = new Uint8Array(replay.data || []);
              replayReady = true;
              flushReplay();
            })
            .catch((error) => {
              setRuntimeError(`终端启动握手失败：${String(error)}`);
            });
        }
      })
      .catch(async (error) => {
        const registrationError = `终端监听注册失败，无法启动：${String(error)}`;
        if (!disposed) {
          setRuntimeError(`${registrationError}；正在清理未启动的终端。`);
        }

        try {
          await killPty(ptyId);
          if (!disposed) {
            setRuntimeError(`${registrationError}；未启动的终端已清理。`);
          }
        } catch (cleanupError) {
          if (!disposed) {
            setRuntimeError(
              `${registrationError}；清理失败：${String(cleanupError)}。仍可重试或关闭终端。`
            );
          }
        } finally {
          markTerminalExited(terminalId);
        }
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

      const storedFont = Number(localStorage.getItem("commanddeck-term-font"));
      const fontSize = Number.isFinite(storedFont) && storedFont >= 11 && storedFont <= 22 ? storedFont : 13;
      const term = new XTerm({
        cols,
        rows,
        fontSize,
        fontFamily: getTermFontFamily(),
        lineHeight: 1.2,
        letterSpacing: 0,
        fontWeight: "normal",
        fontWeightBold: "bold",
        cursorBlink: false,
        cursorStyle: "block",
        drawBoldTextInBrightColors: true,
        allowTransparency: true,
        allowProposedApi: true,
        overviewRulerWidth: 8,
        scrollback: 20000,
        macOptionIsMeta: true,
        theme: getTerminalTheme(),
      });
      const fit = new FitAddon();
      const search = new SearchAddon();
      term.loadAddon(fit);
      term.loadAddon(search);
      term.loadAddon(
        new WebLinksAddon(
          (event, uri) => {
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) void openExternal(uri);
          },
          {
            hover: (_e, uri) => setHoveredLink(uri),
            leave: () => setHoveredLink(null),
          }
        )
      );
      term.open(el);
      fit.fit();
      term.focus();
      xterm = term;
      flushReplay();
      term.scrollToBottom();

      term.onData((d) => {
        writePty(ptyId, d).catch(() => {});
      });

      const selectedText = () =>
        term
          .getSelection()
          .split("\n")
          .map((line) => line.trimEnd())
          .join("\n");

      let resizeTimer = 0;
      const syncSize = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          if (el.offsetWidth < 10 || el.offsetHeight < 10) return;
          fit.fit();
          setTermSize({ cols: term.cols, rows: term.rows });
          resizePty(ptyId, term.cols, term.rows).catch(() => {});
        }, 40);
      };

      search.onDidChangeResults((ev) => {
        setSearchHits({ index: ev.resultIndex, count: ev.resultCount });
      });

      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          setShowSearch(true);
          return false;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
          const text = selectedText();
          if (text) {
            e.preventDefault();
            void navigator.clipboard.writeText(text).catch(() => {});
            return false;
          }
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+" || e.key === "-")) {
          e.preventDefault();
          const next = Math.min(22, Math.max(11, (term.options.fontSize || 13) + (e.key === "-" ? -1 : 1)));
          term.options.fontSize = next;
          localStorage.setItem("commanddeck-term-font", String(next));
          syncSize();
          return false;
        }
        return true;
      });
      syncSize();

      const ro = new ResizeObserver(syncSize);
      ro.observe(el);
      const themeObserver = new MutationObserver(() => {
        term.options.theme = { ...getTerminalTheme() };
        term.options.fontFamily = getTermFontFamily();
        term.refresh(0, term.rows - 1);
        fit.fit();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-palette", "data-term-font"],
      });

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

    const safelyUnlisten = (unlisten: Promise<() => void>) => {
      void unlisten.then((fn) => fn()).catch(() => {});
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      visibilityRo.disconnect();
      cleanup?.();
      el.removeEventListener("paste", onPaste, true);
      safelyUnlisten(unlistenOutput);
      safelyUnlisten(unlistenExit);
      safelyUnlisten(unlistenCleanupError);
      safelyUnlisten(unlistenDrop);
    };
  }, [terminalId, ptyId, markTerminalExited]);

  if (!termRef) return <div className="p-4 text-gray-400">终端未找到</div>;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
    <div
      ref={boxRef}
      className="relative min-h-0 flex-1"
      onMouseDown={() => xtermRef.current?.focus()}
      onContextMenu={(event) => {
        event.preventDefault();
        const selected = xtermRef.current
          ?.getSelection()
          .split("\n")
          .map((line) => line.trimEnd())
          .join("\n");
        if (selected) {
          void navigator.clipboard.writeText(selected).catch(() => {});
          return;
        }
        void navigator.clipboard.readText().then((text) => {
          if (text) writePty(ptyId!, text).catch(() => {});
        }).catch(() => {});
      }}
    >
      {runtimeError && (
        <div className="absolute inset-x-2 top-2 z-40 flex items-start justify-between gap-3 border border-red-400/30 bg-gray-950 px-3 py-2 text-xs text-red-200">
          <span className="break-words">{runtimeError}</span>
          <button type="button" onClick={() => setRuntimeError(null)} className="shrink-0 text-red-300 hover:text-white" aria-label="关闭错误提示">✕</button>
        </div>
      )}
      {showSearch && (
        <div className="cd-panel absolute right-2 top-2 z-50 flex items-center gap-1.5 px-2 py-1">
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => {
              const v = e.target.value;
              setSearchTerm(v);
              if (!v) {
                searchRef.current?.clearDecorations();
                setSearchHits({ index: -1, count: 0 });
                return;
              }
              searchRef.current?.findPrevious(v, { caseSensitive: searchCase, decorations: getTerminalSearchDecorations() });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                searchRef.current?.findNext(searchTerm, { caseSensitive: searchCase, decorations: getTerminalSearchDecorations() });
              }
              if (e.key === "Enter" && e.shiftKey) {
                searchRef.current?.findPrevious(searchTerm, { caseSensitive: searchCase, decorations: getTerminalSearchDecorations() });
              }
              if (e.key === "Escape") {
                searchRef.current?.clearDecorations();
                setShowSearch(false);
                setSearchTerm("");
                setSearchHits({ index: -1, count: 0 });
                xtermRef.current?.focus();
              }
            }}
            placeholder="搜索缓冲区…"
            className="w-44 bg-transparent text-sm text-gray-100 outline-none placeholder-gray-500"
          />
          <span className="min-w-[3.5rem] text-right font-mono text-[10px] text-gray-500">
            {searchTerm && searchHits.count > 0 ? `${searchHits.index + 1}/${searchHits.count}` : searchTerm ? "0" : ""}
          </span>
          <button
            type="button"
            onClick={() => setSearchCase((v) => !v)}
            className={`rounded px-1 text-[10px] ${searchCase ? "bg-brand-500/20 text-brand-300" : "text-gray-500"}`}
            title="区分大小写"
          >
            Aa
          </button>
          <button
            onClick={() => searchRef.current?.findPrevious(searchTerm, { caseSensitive: searchCase, decorations: getTerminalSearchDecorations() })}
            className="px-1 text-gray-400 hover:text-gray-100"
          >
            ↑
          </button>
          <button
            onClick={() => searchRef.current?.findNext(searchTerm, { caseSensitive: searchCase, decorations: getTerminalSearchDecorations() })}
            className="px-1 text-gray-400 hover:text-gray-100"
          >
            ↓
          </button>
          <button
            onClick={() => {
              searchRef.current?.clearDecorations();
              setShowSearch(false);
              setSearchTerm("");
              setSearchHits({ index: -1, count: 0 });
              xtermRef.current?.focus();
            }}
            className="px-1 text-gray-400 hover:text-gray-100"
          >
            ✕
          </button>
        </div>
      )}
      {hoveredLink && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 max-w-[80%] truncate rounded-md border border-gray-750 bg-gray-900/95 px-2 py-1 font-mono text-[10px] text-gray-300">
          ⌘/Ctrl+单击打开 {hoveredLink}
        </div>
      )}
    </div>
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-gray-800 bg-gray-925/80 px-2.5 font-mono text-[10px] text-gray-500">
      <span className="truncate">{hoveredLink ? "链接" : "⌘F 搜索 · 选中后 ⌘C 复制 · 右键粘贴"}</span>
      <span>{termSize.cols > 0 ? `${termSize.cols}×${termSize.rows}` : ""}</span>
    </div>
    </div>
  );
}
