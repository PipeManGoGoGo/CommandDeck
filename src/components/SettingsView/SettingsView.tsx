import { useState } from "react";
import { usePageEnter } from "../../motion";
import { useStore } from "../../store";
import { open } from "@tauri-apps/plugin-dialog";
import { PalettePicker } from "../PalettePicker";
import { FontPicker } from "../FontPicker";
import { IconSizePicker } from "../IconSizePicker/IconSizePicker";
import { McpToggle } from "../McpToggle";
import type { PaletteId } from "../../theme/palettes";
import { skinMode } from "../../theme/palettes";
import type { TermFontId } from "../../theme/fonts";

export function SettingsView({
  palette,
  onPaletteChange,
  termFont,
  onTermFontChange,
}: {
  palette: PaletteId;
  onPaletteChange: (id: PaletteId) => void;
  termFont: TermFontId;
  onTermFontChange: (id: TermFontId) => void;
}) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setView = useStore((s) => s.setView);
  const [baseDir, setBaseDir] = useState(settings?.baseDir || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isWindows = navigator.userAgent.includes("Windows");
  const pageRef = usePageEnter<HTMLDivElement>();

  const handleChooseDir = async () => {
    const selected = await open({ directory: true });
    if (selected) setBaseDir(selected);
  };

  const handleSave = async () => {
    if (!baseDir.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ baseDir: baseDir.trim(), theme: skinMode(palette) });
      setView("catalog");
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={pageRef} className="flex flex-1 overflow-y-auto bg-gray-950 px-8 py-6">
      <div className="w-full max-w-xl">
        <h1 className="font-display text-[11px] text-gray-400">{settings ? "设置" : "CommandDeck"}</h1>
        <p className="mt-3 mb-6 text-[13px] leading-6 text-gray-400">
          工作目录保存工具配置。命令里的 {"{{TOOL_DIR}}"} 会在运行时展开。
        </p>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-300">界面</label>
          <div className="cd-panel px-3 py-2.5">
            <p className="mb-2 text-[11px] text-gray-500">整窗深浅。选「跟随界面」时终端也用这一套。</p>
            <PalettePicker value={palette} onChange={onPaletteChange} />
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-300">工具图标</label>
          <div className="cd-panel flex items-center justify-between gap-3 px-3 py-2.5">
            <p className="mr-3 text-[11px] leading-5 text-gray-500">Launchpad 式纯图标。无外框，可改大小。</p>
            <IconSizePicker />
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-300">终端</label>
          <div className="cd-panel flex items-center justify-between px-3 py-2.5">
            <p className="mr-3 text-[11px] text-gray-500">字形、底色和字色一起换。</p>
            <FontPicker value={termFont} onChange={onTermFontChange} align="down" />
          </div>
        </div>

        <McpToggle />

        <div className="mb-6">
          <label className="mb-1.5 block text-xs font-medium text-gray-300">
            工作目录
          </label>
          <div className="flex gap-2">
            <input
              value={baseDir}
              onChange={(e) => setBaseDir(e.target.value)}
              className="cd-field min-w-0 flex-1 font-mono"
              placeholder={isWindows ? "C:\\Users\\name\\CommandDeck" : "/Users/name/CommandDeck"}
            />
            <button onClick={handleChooseDir} className="cd-btn shrink-0">
              选择
            </button>
          </div>
        </div>

        {error && <div className="mb-4 border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">无法保存：{error}</div>}

        <button
          onClick={handleSave}
          disabled={!baseDir.trim() || saving}
          className="cd-btn cd-btn-primary h-9 w-full"
        >
          {saving ? "正在准备工作区…" : "保存并进入工作台"}
        </button>
        {settings && <button type="button" onClick={() => setView("catalog")} className="cd-btn mt-2 w-full">返回工作台</button>}
      </div>
    </div>
  );
}
