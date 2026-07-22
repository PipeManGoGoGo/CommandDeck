import { useState } from "react";
import { useStore } from "../../store";
import { open } from "@tauri-apps/plugin-dialog";
import type { ThemeMode } from "../../types";

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setView = useStore((s) => s.setView);
  const [baseDir, setBaseDir] = useState(settings?.baseDir || "");
  const [theme, setTheme] = useState<ThemeMode>(settings?.theme || "dark");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isWindows = navigator.userAgent.includes("Windows");

  const handleChooseDir = async () => {
    const selected = await open({ directory: true });
    if (selected) setBaseDir(selected);
  };

  const handleSave = async () => {
    if (!baseDir.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ baseDir: baseDir.trim(), theme });
      setView("catalog");
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-backdrop flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-750 bg-gray-850/90 p-8 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-500/10 text-sm font-bold text-brand-300">CD</div>
          <div>
            <h1 className="text-lg font-semibold text-gray-100">{settings ? "工作区设置" : "欢迎使用 CommandDeck"}</h1>
            <p className="text-[11px] text-gray-500">macOS · Windows</p>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-gray-400">
          设置工具运行的起始工作目录，所有终端命令将在此目录下执行。
        </p>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-300">
            外观主题
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-750 bg-gray-925 p-1.5">
            <ThemeOption active={theme === "light"} onClick={() => setTheme("light")} icon="☀" label="浅色" />
            <ThemeOption active={theme === "dark"} onClick={() => setTheme("dark")} icon="☾" label="深色" />
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-xs font-medium text-gray-300">
            工作目录
          </label>
          <div className="flex gap-2">
            <input
              value={baseDir}
              onChange={(e) => setBaseDir(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-750 bg-gray-925 px-3 py-2.5 font-mono text-sm text-gray-100 placeholder-gray-600 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              placeholder={isWindows ? "C:\\Users\\name\\CommandDeck" : "/Users/name/CommandDeck"}
            />
            <button
              onClick={handleChooseDir}
              className="shrink-0 rounded-lg border border-gray-750 bg-gray-750 px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-700"
            >
              选择
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">无法保存：{error}</div>}

        <button
          onClick={handleSave}
          disabled={!baseDir.trim() || saving}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "正在准备工作区…" : "保存并进入工作台"}
        </button>
        {settings && <button type="button" onClick={() => setView("catalog")} className="mt-2 w-full rounded-lg px-4 py-2 text-xs text-gray-500 hover:text-gray-200">返回工作台</button>}
      </div>
    </div>
  );
}

function ThemeOption({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${active ? "bg-gray-850 text-gray-100 shadow-sm ring-1 ring-gray-750" : "text-gray-500 hover:text-gray-200"}`}
    >
      <span className="mr-1.5" aria-hidden="true">{icon}</span>{label}
    </button>
  );
}
