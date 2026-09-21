import { useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { NoteEditor } from "../NoteEditor";
import { slideInX, slideOutX } from "../../motion";

interface Props {
  toolId: string;
  onClose: () => void;
}

export function NotesPanel({ toolId, onClose }: Props) {
  const tool = useStore((s) => (s.tools ?? []).find((t) => t.id === toolId));
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem("commanddeck-notes-width"));
    return Number.isFinite(stored) && stored >= 240 && stored <= 640 ? stored : 360;
  });
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const tween = slideInX(panelRef.current, 36);
    return () => {
      tween?.kill();
    };
  }, []);

  const close = () => {
    slideOutX(panelRef.current, 28, onClose);
  };

  return (
    <aside
      ref={panelRef}
      className="relative flex shrink-0 flex-col overflow-hidden border-l border-gray-800 bg-gray-950"
      style={{ width }}
      aria-label={`${tool?.name || "工具"}笔记`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整笔记面板宽度"
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize hover:bg-brand-400/50"
        onPointerDown={(event) => {
          dragRef.current = { startX: event.clientX, startWidth: width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const next = Math.min(640, Math.max(240, drag.startWidth + drag.startX - event.clientX));
          setWidth(next);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (drag) {
            const next = Math.min(640, Math.max(240, drag.startWidth + drag.startX - event.clientX));
            setWidth(next);
            localStorage.setItem("commanddeck-notes-width", String(next));
          }
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <span className="font-display text-[10px] text-gray-400">
          {tool?.name || ""} 笔记
        </span>
        <button onClick={close} className="cd-btn h-6 w-6 p-0" aria-label="关闭笔记">
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        <NoteEditor toolId={toolId} compact />
      </div>
    </aside>
  );
}
