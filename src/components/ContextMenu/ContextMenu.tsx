import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useMenuMotion } from "../../motion";

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
  const { ref, close } = useMenuMotion(onClose);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [close, ref]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      className="cd-menu fixed z-50"
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
            close();
          }}
          className={item.danger ? "text-red-400" : ""}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
