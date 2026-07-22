import { useRef, useState } from "react";
import { useStore } from "../../store";
import { MarkdownContent } from "../MarkdownContent";

interface Props {
  toolId: string;
  onClose: () => void;
}

export function NotesPanel({ toolId, onClose }: Props) {
  const tool = useStore((s) => (s.tools ?? []).find((t) => t.id === toolId));
  const [width, setWidth] = useState(320);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  return (
    <aside
      className="relative shrink-0 border-l border-gray-700 bg-gray-850 flex flex-col overflow-hidden"
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
          setWidth(Math.min(640, Math.max(240, drag.startWidth + drag.startX - event.clientX)));
        }}
        onPointerUp={(event) => {
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-300">
          📝 {tool?.name || ""} 笔记
        </span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 text-xs"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tool?.note ? (
          <MarkdownContent>{tool.note}</MarkdownContent>
        ) : (
          <p className="text-xs text-gray-500">暂无笔记</p>
        )}
      </div>
    </aside>
  );
}
