import { PALETTES, type PaletteId } from "../../theme/palettes";

export function PalettePicker({
  value,
  onChange,
}: {
  value: PaletteId;
  onChange: (id: PaletteId) => void;
  align?: "up" | "down";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500">界面</span>
      <div className="flex gap-0.5">
        {PALETTES.map((palette) => {
          const active = value === palette.id;
          return (
            <button
              key={palette.id}
              type="button"
              onClick={() => onChange(palette.id)}
              className={`rounded-full px-2.5 py-1 text-[12px] ${
                active ? "bg-gray-925 text-gray-50" : "text-gray-400 hover:text-gray-100"
              }`}
            >
              {palette.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
