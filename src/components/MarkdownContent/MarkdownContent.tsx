import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

interface Props {
  children: string;
  onRun?: (command: string) => void;
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

function MarkdownPre({
  children,
  onRun,
}: {
  children?: ReactNode;
  onRun?: (command: string) => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [runStatus, setRunStatus] = useState<"idle" | "running">("idle");
  const command = textContent(children).replace(/\n$/, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1200);
  };

  return (
    <div className="group/code relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover/code:opacity-100 focus-within:opacity-100">
        {onRun && (
          <button
            type="button"
            onClick={() => {
              setRunStatus("running");
              onRun(command);
              window.setTimeout(() => setRunStatus("idle"), 800);
            }}
            className="rounded-md border border-gray-750 bg-gray-925/90 px-2 py-1 text-[10px] text-brand-300 hover:text-brand-200"
          >
            {runStatus === "running" ? "启动中…" : "运行"}
          </button>
        )}
        <button
          type="button"
          onClick={() => { void copy(); }}
          className="rounded-md border border-gray-750 bg-gray-925/90 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-100"
        >
          {copyStatus === "copied" ? "已复制" : copyStatus === "error" ? "复制失败" : "复制"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function MarkdownContent({ children, onRun }: Props) {
  return (
    <div className="markdown-content text-sm">
      <ReactMarkdown components={{ pre: (props) => <MarkdownPre onRun={onRun}>{props.children}</MarkdownPre> }}>{children}</ReactMarkdown>
    </div>
  );
}
