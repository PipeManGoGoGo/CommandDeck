import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[140px]"
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 180)),
        top: Math.max(8, Math.min(y, window.innerHeight - Math.min(320, items.length * 36 + 16))),
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
            item.danger
              ? "text-red-400 hover:bg-red-900/30"
              : "text-gray-200 hover:bg-gray-700"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
