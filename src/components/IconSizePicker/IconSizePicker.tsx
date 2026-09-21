import { useEffect, useState } from "react";
import {
  applyIconSize,
  ICON_SIZES,
  readStoredIconSize,
  subscribeIconSize,
  type IconSizeId,
} from "../../theme/iconSize";

export function IconSizePicker({ compact = false }: { compact?: boolean }) {
  const [value, setValue] = useState<IconSizeId>(() => readStoredIconSize());

  useEffect(() => subscribeIconSize(setValue), []);

  const change = (id: IconSizeId) => {
    setValue(id);
    applyIconSize(id);
  };

  const control = (
    <div className="flex gap-0.5" role="radiogroup" aria-label="图标大小">
      {ICON_SIZES.map((size) => {
        const active = value === size.id;
        return (
          <button
            key={size.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => change(size.id)}
            className={`rounded-full px-2.5 py-1 text-[12px] ${
              active ? "bg-gray-925 text-gray-50" : "text-gray-400 hover:text-gray-100"
            }`}
          >
            {size.label}
          </button>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] text-gray-500">图标</span>
        {control}
      </div>
    );
  }

  return control;
}
