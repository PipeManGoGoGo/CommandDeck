import { lazy, Suspense, useEffect, useLayoutEffect, useState, useRef } from "react";
import { bootShell, bootSplash, enterPage, enterView } from "./motion";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { DragLayer } from "./components/DragLayer";
import { FilterBar } from "./components/FilterBar";
import { ToolCatalog } from "./components/ToolCatalog";
import { SettingsView } from "./components/SettingsView";
import { ResourceMonitor } from "./components/ResourceMonitor";
import { confirmClose, countPtys } from "./utils/tauri";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PalettePicker } from "./components/PalettePicker";
import { FontPicker } from "./components/FontPicker";
import { CommandPalette } from "./components/CommandPalette";
import { DebugBridge } from "./components/DebugBridge";
import { McpToggle } from "./components/McpToggle";
import { applyPalette, PALETTES, readStoredPalette, skinMode, type PaletteId } from "./theme/palettes";
import { applyTermFont, readStoredTermFont, type TermFontId } from "./theme/fonts";

const ToolView = lazy(() => import("./components/ToolView").then((module) => ({ default: module.ToolView })));
const ToolForm = lazy(() => import("./components/ToolForm").then((module) => ({ default: module.ToolForm })));
const CategoryManager = lazy(() => import("./components/CategoryManager").then((module) => ({ default: module.CategoryManager })));
const ImportModal = lazy(() => import("./components/ImportModal").then((module) => ({ default: module.ImportModal })));
const ExportModal = lazy(() => import("./components/ExportModal").then((module) => ({ default: module.ExportModal })));

function App() {
  const init = useStore((s) => s.init);
  const view = useStore((s) => s.view);
  const activeToolId = useStore((s) => s.activeToolId);
  const activeToolFormId = useStore((s) => s.activeToolFormId);
  const pendingToolCategoryId = useStore((s) => s.pendingToolCategoryId);
  const toolViews = useStore((s) => s.toolViews);
  const theme = useStore((s) => s.settings?.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [palette, setPalette] = useState<PaletteId>(() => readStoredPalette());
  const [termFont, setTermFont] = useState<TermFontId>(() => readStoredTermFont());
  const [showPalette, setShowPalette] = useState(false);
  const catalogScrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewKey = `${view}:${activeToolId || ""}`;
  const firstViewRef = useRef(true);
  const showPaletteRef = useRef(false);
  showPaletteRef.current = showPalette;

  useEffect(() => {
    applyTermFont(termFont);
  }, [termFont]);

  useEffect(() => {
    applyPalette(palette);
    const mode = skinMode(palette);
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const chrome = PALETTES.find((item) => item.id === palette)?.chrome;
    if (themeColor) themeColor.content = (chrome ?? PALETTES[0].chrome)[mode];
    void getCurrentWindow().setTheme(mode).catch(() => {});
    if (theme && theme !== mode) void setTheme(mode).catch(() => {});
  }, [palette, theme, setTheme]);

  useEffect(() => {
    let cmdWClosesTab = false;

    const closeActiveTab = () => {
      const state = useStore.getState();
      if (!state.activeToolId) return;
      const tv = state.toolViews[state.activeToolId];
      if (!tv || tv.activeSubTab === "detail") return;
      void state.closeTerminal(state.activeToolId, tv.activeSubTab).catch(async (error) => {
        await message(`关闭终端失败，仍保留：${String(error)}`, { title: "CommandDeck", kind: "error" });
      });
    };

    const onWindowClose = () => {
      if (cmdWClosesTab) {
        closeActiveTab();
        return;
      }
      void askQuit();
    };

    let askingQuit = false;
    const askQuit = async () => {
      if (askingQuit) return;
      askingQuit = true;
      try {
      const running = await countPtys().catch(() => 0);
      if (running > 0) {
        const yes = await confirm("有进程正在运行，确定退出吗？", {
          title: "CommandDeck",
          kind: "warning",
        });
        if (!yes) return;
      }
      try {
        await confirmClose();
      } catch (closeError) {
        await message(`退出失败，终端仍保留，可重试：${String(closeError)}`, {
          title: "CommandDeck",
          kind: "error",
        });
      }
      } finally {
        askingQuit = false;
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowPalette(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        event.stopPropagation();
        cmdWClosesTab = true;
        window.setTimeout(() => {
          cmdWClosesTab = false;
        }, 400);
        closeActiveTab();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "q") {
        event.preventDefault();
        void askQuit();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (showPaletteRef.current || typing) return;
        if (target?.closest(".xterm, .terminal-well")) return;
        const state = useStore.getState();
        if (state.view !== "catalog") {
          event.preventDefault();
          state.backToCatalog();
        }
        return;
      }
      if (!typing && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        document.getElementById("tool-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const unlistenQuit = listen("request-quit-confirm", () => {
      void askQuit();
    });
    const unlistenWindowEvent = listen("request-window-close", () => {
      onWindowClose();
    });
    const unlistenWindow = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      onWindowClose();
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      unlistenQuit.then((fn) => fn());
      unlistenWindowEvent.then((fn) => fn());
      unlistenWindow.then((fn) => fn());
    };
  }, []);

  const readyRef = useRef(false);
  const boot = () => {
    setError(null);
    if (!readyRef.current) setLoading(true);
    init()
      .then((hasSettings) => {
        readyRef.current = true;
        setLoading(false);
        void useStore.getState().hydrateMcp();
        if (!hasSettings) {
          useStore.getState().setView("settings");
        }
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  };

  useEffect(() => {
    boot();
  }, [init]);

  useLayoutEffect(() => {
    if (loading) return;
    const tween = bootShell(shellRef.current);
    return () => {
      tween?.kill();
    };
  }, [loading]);

  useLayoutEffect(() => {
    if (loading) return;
    if (firstViewRef.current) {
      firstViewRef.current = false;
      return;
    }
    const incoming = hostRef.current?.querySelector(".keep-alive-panel:not(.is-parked), :scope > :not(.keep-alive-panel)") as HTMLElement | null;
    if (!incoming) return;
    const kind = view === "catalog" ? "catalog" : view === "tool" ? "tool" : "page";
    const tween = enterView(incoming, kind);
    return () => {
      tween?.kill();
    };
  }, [loading, viewKey, view]);

  if (loading) {
    return <BootScreen />;
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center app-backdrop p-6 text-sm">
        <ErrorPanel
          error={error}
          onPickWorkspace={() => {
            setError(null);
            useStore.getState().setView("settings");
          }}
          onRetry={boot}
        />
      </div>
    );
  }

  return (
    <div ref={shellRef} className="h-screen flex flex-col app-backdrop text-gray-100">
      <DebugBridge />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <DragLayer />
        <main className="flex-1 flex flex-col min-w-0">
          {view === "catalog" && <FilterBar />}
          <div ref={hostRef} className="keep-alive-host">
            <div className={`keep-alive-panel ${view === "catalog" ? "" : "is-parked"}`}>
              <ToolCatalog scrollRef={catalogScrollRef} />
            </div>
            {Object.keys(toolViews).map((tid) => (
              <div
                key={tid}
                className={`keep-alive-panel ${view === "tool" && activeToolId === tid ? "" : "is-parked"}`}
              >
                <Suspense fallback={<PanelLoader />}><ToolView toolId={tid} /></Suspense>
              </div>
            ))}

            {/* Category manager — only when active */}
            {view === "category_manager" && <Suspense fallback={<PanelLoader />}><CategoryManager /></Suspense>}

            {/* Tool form — only when active */}
            {view === "tool_form" && (
              <Suspense fallback={<PanelLoader />}><ToolForm
                toolId={activeToolFormId || undefined}
                categoryId={pendingToolCategoryId || undefined}
              /></Suspense>
            )}

            {/* Settings — only when active */}
            <div className={`keep-alive-panel ${view === "settings" ? "" : "is-parked"}`}>
              <SettingsView
                palette={palette}
                onPaletteChange={setPalette}
                termFont={termFont}
                onTermFontChange={setTermFont}
              />
            </div>
          </div>
        </main>
      </div>

      <footer className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-t border-gray-800 bg-gray-950 px-3 py-1 font-mono text-[10px] tracking-wide text-gray-500">
        <span className="shrink-0 text-gray-600">WS</span>
        <ResourceMonitor />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PalettePicker value={palette} onChange={setPalette} />
          <FontPicker value={termFont} onChange={setTermFont} />
          <McpToggle compact />
          <FooterBtn onClick={() => setShowImport(true)}>导入</FooterBtn>
          <FooterBtn onClick={() => setShowExport(true)}>导出</FooterBtn>
          <FooterBtn onClick={() => useStore.getState().setView("settings")}>
            设置
          </FooterBtn>
        </div>
      </footer>

      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      <Suspense fallback={null}>
        {showImport && <ImportModal onClose={() => setShowImport(false)} />}
        {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      </Suspense>
    </div>
  );
}

function BootScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tween = bootSplash(ref.current);
    return () => {
      tween?.kill();
    };
  }, []);
  return (
    <div ref={ref} className="flex h-screen flex-col items-center justify-center gap-3 app-backdrop">
      <span className="cd-mark" aria-hidden="true">C</span>
      <p className="text-[13px] font-medium text-gray-50">CommandDeck</p>
      <p className="text-xs text-gray-500">加载工作区</p>
      <span className="cd-boot-bar mt-1 h-px w-24 bg-brand-400/70" />
    </div>
  );
}

function ErrorPanel({
  error,
  onPickWorkspace,
  onRetry,
}: {
  error: string;
  onPickWorkspace: () => void;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tween = enterPage(ref.current);
    return () => {
      tween?.kill();
    };
  }, []);
  return (
    <div ref={ref} className="cd-panel w-full max-w-md p-6">
          <p className="font-display text-[11px] text-red-300">初始化失败</p>
          <p className="mt-2 break-words text-sm text-gray-400">{error}</p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={onPickWorkspace}
              className="cd-btn cd-btn-primary"
            >
              重新选择工作区
            </button>
            <button onClick={onRetry} className="cd-btn">
              重新加载
            </button>
          </div>
        </div>
  );
}

function PanelLoader() {
  return <div className="flex flex-1 items-center justify-center text-xs text-gray-500"><span className="cd-spin mr-2 h-3 w-3 rounded-full border border-gray-600 border-t-brand-400" />加载界面…</div>;
}

function FooterBtn({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button onClick={onClick} title={title} className="cd-btn h-7 border-0 px-2 text-[11px]">
      {children}
    </button>
  );
}

export default App;
