import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { menuIn } from "../../motion";
import { TERM_FONTS, fontSwatches, type TermFontId } from "../../theme/fonts";

let lastListScroll = 0;

export function FontPicker({
  value,
  onChange,
  align = "up",
}: {
  value: TermFontId;
  onChange: (id: TermFontId) => void;
  align?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const current = TERM_FONTS.find((item) => item.id === value) ?? TERM_FONTS[0];

  useLayoutEffect(() => {
    if (open) menuIn(listRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    const list = listRef.current;
    const active = activeRef.current;
    requestAnimationFrame(() => {
      if (!list) return;
      list.scrollTop = lastListScroll;
      if (active) {
        const top = active.offsetTop;
        const bottom = top + active.offsetHeight;
        if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
          active.scrollIntoView({ block: "nearest" });
        }
      }
    });
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="cd-btn h-7 gap-1.5 border-0 px-2 text-[11px]"
      >
        终端 · {current.label}
        <span className="flex gap-0.5">
          {fontSwatches(current.id).slice(0, 4).map((color, i) => (
            <span key={i} className="h-2 w-2 rounded-sm ring-1 ring-black/25" style={{ backgroundColor: color }} />
          ))}
        </span>
      </button>
      {open && (
        <div
          ref={listRef}
          onScroll={(event) => {
            lastListScroll = event.currentTarget.scrollTop;
          }}
          className={`cd-menu absolute z-50 max-h-72 w-60 overflow-y-auto ${
            align === "up" ? "bottom-full right-0 mb-1" : "top-full right-0 mt-1"
          }`}
          role="listbox"
          aria-label="终端外观"
        >
          {TERM_FONTS.map((font) => {
            const active = value === font.id;
            return (
              <button
                key={font.id}
                ref={active ? activeRef : undefined}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(font.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                  active ? "bg-gray-800 text-gray-100" : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ fontFamily: font.family }}>
                    {font.label}
                  </span>
                  <span className="block truncate text-[10px] text-gray-500">{font.hint}</span>
                </span>
                <span className="flex gap-0.5">
                  {fontSwatches(font.id).map((color, i) => (
                    <span key={i} className="h-2.5 w-2.5 rounded-sm ring-1 ring-black/25" style={{ backgroundColor: color }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
