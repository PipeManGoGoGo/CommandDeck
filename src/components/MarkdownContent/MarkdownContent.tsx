import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

interface Props {
  children: string;
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textContent(children).replace(/\n$/, ""));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1200);
  };

  return (
    <div className="group/code relative">
      <button
        type="button"
        onClick={() => { void copy(); }}
        className="absolute right-2 top-2 z-10 rounded-md border border-gray-750 bg-gray-925/90 px-2 py-1 text-[10px] text-gray-400 opacity-0 transition hover:text-gray-100 group-hover/code:opacity-100 focus:opacity-100"
      >
        {copyStatus === "copied" ? "已复制" : copyStatus === "error" ? "复制失败" : "复制"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

export function MarkdownContent({ children }: Props) {
  return (
    <div className="markdown-content text-sm">
      <ReactMarkdown components={{ pre: MarkdownPre }}>{children}</ReactMarkdown>
    </div>
  );
}
