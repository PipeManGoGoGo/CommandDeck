import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store";
import {
  dragPointer,
  endToolDrag,
  followDragIcon,
  liftDragIcon,
  parkDragIcon,
  unparkDragIcon,
} from "../../utils/drag";
import { TRASH_ID } from "../../utils/tree";
import { AppIconImg } from "../AppIcon/AppIcon";

export function DragLayer() {
  const dragToolId = useStore((s) => s.dragToolId);
  const parked = useStore((s) => s.dropTargetCatId) === TRASH_ID;
  const tool = useStore((s) => s.tools.find((item) => item.id === s.dragToolId));
  const wasParked = useRef(false);

  useLayoutEffect(() => {
    if (!dragToolId) return;
    liftDragIcon(dragToolId, dragPointer.x, dragPointer.y);
  }, [dragToolId]);

  useEffect(() => {
    if (!dragToolId) {
      wasParked.current = false;
      return;
    }
    if (parked) {
      wasParked.current = true;
      parkDragIcon(dragToolId);
      return;
    }
    if (wasParked.current) {
      wasParked.current = false;
      unparkDragIcon(dragToolId, dragPointer.x, dragPointer.y);
    }
  }, [dragToolId, parked]);

  useEffect(() => {
    if (!dragToolId) return;
    const onMove = (event: PointerEvent) => {
      dragPointer.x = event.clientX;
      dragPointer.y = event.clientY;
      if (useStore.getState().dropTargetCatId === TRASH_ID) return;
      followDragIcon(dragToolId, event.clientX, event.clientY);
    };
    const blockNativeDrag = (event: Event) => event.preventDefault();
    document.body.classList.add("is-dragging");
    document.documentElement.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", endToolDrag, true);
    window.addEventListener("pointercancel", endToolDrag, true);
    window.addEventListener("dragstart", blockNativeDrag, true);
    return () => {
      document.body.classList.remove("is-dragging");
      document.documentElement.style.cursor = "";
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", endToolDrag, true);
      window.removeEventListener("pointercancel", endToolDrag, true);
      window.removeEventListener("dragstart", blockNativeDrag, true);
    };
  }, [dragToolId]);

  if (!dragToolId || !tool) return null;

  return createPortal(
    <span className={`cd-drag-float cd-app-icon ${tool.icon ? "" : "is-letter"}`}>
      {tool.icon ? <AppIconImg src={tool.icon} /> : tool.name.charAt(0).toUpperCase()}
    </span>,
    document.body
  );
}
