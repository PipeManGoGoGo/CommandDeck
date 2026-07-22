import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { FilterBar } from "./components/FilterBar";
import { ToolCatalog } from "./components/ToolCatalog";
import { SettingsView } from "./components/SettingsView";
import { ResourceMonitor } from "./components/ResourceMonitor";
import { confirmClose } from "./utils/tauri";
import { confirm } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
  const toolViews = useStore((s) => s.toolViews);
  const theme = useStore((s) => s.settings?.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const catalogScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("secbox-theme", theme);
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === "light" ? "#ffffff" : "#070b12";
    void getCurrentWindow().setTheme(theme).catch(() => {});
  }, [theme]);

  // Respond to Rust-side close confirmation request
  useEffect(() => {
    const unlisten = listen("request-close-confirm", async () => {
      const yes = await confirm("有进程正在运行，确定退出吗？", {
        title: "SecBox",
        kind: "warning",
      });
      if (yes) {
        await confirmClose();
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    init()
      .then((hasSettings) => {
        setLoading(false);
        if (!hasSettings) {
          useStore.getState().setView("settings");
        }
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [init]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 app-backdrop text-white">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-400/25 bg-brand-500/10 shadow-glow">
          <span className="text-lg font-bold tracking-tight text-brand-300">SB</span>
          <span className="absolute inset-0 animate-ping rounded-2xl border border-brand-400/15" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-200">正在打开 SecBox</p>
          <p className="mt-1 text-xs text-gray-500">加载你的工具工作区</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center app-backdrop p-6 text-sm">
        <div className="w-full max-w-lg rounded-2xl border border-red-400/20 bg-gray-850 p-6 text-center shadow-panel">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-400/10 text-red-300">!</div>
          <p className="text-lg font-semibold text-gray-100">初始化失败</p>
          <p className="mt-2 break-words text-gray-400">{error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => {
                setError(null);
                useStore.getState().setView("settings");
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-500"
            >
              重新选择工作区
            </button>
            <button onClick={() => window.location.reload()} className="rounded-lg bg-gray-750 px-4 py-2 text-xs font-medium text-gray-100 transition hover:bg-gray-700">
              重新加载
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col app-backdrop text-gray-100">
      <div className="flex flex-1 min-h-0">
        {view !== "settings" && <Sidebar />}
        <main className="flex-1 flex flex-col min-w-0">
          {view === "catalog" && <FilterBar />}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Catalog — always mounted, hidden when not active */}
            <div
              className="flex-1 flex flex-col min-h-0"
              style={{ display: view === "catalog" ? undefined : "none" }}
            >
              <ToolCatalog scrollRef={catalogScrollRef} />
            </div>

            {/* ToolViews — always mounted once opened, hidden when not active */}
            {Object.keys(toolViews).map((tid) => (
              <div
                key={tid}
                className="flex-1 flex flex-col min-h-0"
                style={{ display: view === "tool" && activeToolId === tid ? undefined : "none" }}
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
                categoryId={undefined}
              /></Suspense>
            )}

            {/* Settings — only when active */}
            {view === "settings" && <SettingsView />}
          </div>
        </main>
      </div>

      {view !== "settings" && <footer className="border-t border-gray-800/90 px-4 py-2 flex items-center justify-between text-xs text-gray-500 bg-gray-925/95">
        <span className="flex shrink-0 items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />本地工作区已连接</span>
        <ResourceMonitor />
        <div className="flex shrink-0 items-center gap-1">
          <FooterBtn
            onClick={() => useStore.getState().setView("category_manager")}
          >
            分类管理
          </FooterBtn>
          <FooterBtn onClick={() => useStore.getState().openToolForm()}>
            + 添加工具
          </FooterBtn>
          <FooterBtn onClick={() => setShowImport(true)}>导入</FooterBtn>
          <FooterBtn onClick={() => setShowExport(true)}>导出</FooterBtn>
          <FooterBtn
            onClick={() => {
              const nextTheme = theme === "light" ? "dark" : "light";
              void setTheme(nextTheme).catch(() => {});
            }}
            title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
          >
            {theme === "light" ? "☾ 深色" : "☀ 浅色"}
          </FooterBtn>
          <FooterBtn onClick={() => useStore.getState().setView("settings")}>
            设置
          </FooterBtn>
        </div>
      </footer>}

      <Suspense fallback={null}>
        {showImport && <ImportModal onClose={() => setShowImport(false)} />}
        {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      </Suspense>
    </div>
  );
}

function PanelLoader() {
  return <div className="flex flex-1 items-center justify-center text-xs text-gray-500"><span className="mr-2 h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-brand-400" />加载界面…</div>;
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
    <button onClick={onClick} title={title} className="rounded-md px-2 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100">
      {children}
    </button>
  );
}

export default App;
