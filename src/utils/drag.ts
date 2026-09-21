import { message } from "@tauri-apps/plugin-dialog";
import { EASE, gsap, motionReduced } from "../motion";
import { useStore } from "../store";
import { TRASH_ID } from "./tree";

let settling = false;

export const dragPointer = { x: 0, y: 0 };

function dragIconEl() {
  return document.querySelector(".cd-drag-float") as HTMLElement | null;
}

function currentXY(icon: HTMLElement) {
  return {
    x: Number(gsap.getProperty(icon, "x")) || 0,
    y: Number(gsap.getProperty(icon, "y")) || 0,
  };
}

function placeVisualCenter(icon: HTMLElement, clientX: number, clientY: number) {
  const rect = icon.getBoundingClientRect();
  const { x, y } = currentXY(icon);
  gsap.set(icon, {
    x: x + clientX - (rect.left + rect.width / 2),
    y: y + clientY - (rect.top + rect.height / 2),
  });
}

export function liftDragIcon(_id: string, clientX: number, clientY: number) {
  const icon = dragIconEl();
  if (!icon) return;
  gsap.killTweensOf(icon);
  gsap.set(icon, { x: 0, y: 0, scale: 1, rotate: 0, transformOrigin: "50% 50%" });
  const rect = icon.getBoundingClientRect();
  const size = rect.width || parseFloat(getComputedStyle(icon).width) || 72;
  gsap.set(icon, {
    position: "fixed",
    left: 0,
    top: 0,
    x: 0,
    y: 0,
    width: size,
    height: size,
    margin: 0,
    zIndex: 400,
    pointerEvents: "none",
    transformOrigin: "50% 50%",
  });
  placeVisualCenter(icon, clientX, clientY);
  gsap.to(icon, {
    scale: 1.08,
    rotate: 4,
    duration: motionReduced ? 0.01 : 0.18,
    ease: EASE.spring,
    overwrite: false,
  });
}

export function followDragIcon(_id: string, clientX: number, clientY: number) {
  const icon = dragIconEl();
  if (!icon || icon.classList.contains("is-parked")) return;
  placeVisualCenter(icon, clientX, clientY);
}

export function parkDragIcon(_id: string) {
  const icon = dragIconEl();
  const slot = document.querySelector("[data-trash-slot]");
  if (!icon || !slot) return;
  icon.classList.add("is-parked");
  const ir = icon.getBoundingClientRect();
  const sr = slot.getBoundingClientRect();
  const { x, y } = currentXY(icon);
  const scale = Number(gsap.getProperty(icon, "scale")) || 1;
  gsap.to(icon, {
    x: x + (sr.left + sr.width / 2 - (ir.left + ir.width / 2)),
    y: y + (sr.top + sr.height / 2 - (ir.top + ir.height / 2)),
    scale: Math.max(0.28, (sr.width / Math.max(ir.width, 1)) * scale),
    rotate: 0,
    duration: motionReduced ? 0.01 : 0.28,
    ease: EASE.spring,
    overwrite: true,
  });
}

export function unparkDragIcon(_id: string, clientX: number, clientY: number) {
  const icon = dragIconEl();
  if (!icon) return;
  icon.classList.remove("is-parked");
  gsap.set(icon, { scale: 1.08, rotate: 4 });
  placeVisualCenter(icon, clientX, clientY);
}

export function resetDragIcon(_id?: string) {
  const icon = dragIconEl();
  if (!icon) return;
  gsap.killTweensOf(icon);
  icon.classList.remove("is-parked");
}

export function endToolDrag() {
  if (settling) return;
  const state = useStore.getState();
  const dragging = state.dragToolId;
  const dest = state.dropTargetCatId;
  if (!dragging) return;

  if (dest === TRASH_ID) {
    settling = true;
    let done = false;
    const icon = dragIconEl();
    const commit = () => {
      if (done) return;
      done = true;
      settling = false;
      void state.trashTool(dragging).catch((error) =>
        message(`无法移到回收站：${String(error)}`, { title: "CommandDeck", kind: "error" })
      );
      resetDragIcon(dragging);
      const latest = useStore.getState();
      if (latest.dragToolId === dragging) latest.setDragToolId(null);
    };
    if (icon && !motionReduced) {
      gsap.to(icon, {
        scale: 0.08,
        opacity: 0,
        duration: 0.3,
        ease: "power2.in",
        overwrite: true,
        onComplete: commit,
      });
      window.setTimeout(commit, 420);
      return;
    }
    commit();
    return;
  }

  resetDragIcon(dragging);
  state.setDragToolId(null);
  if (!dest) return;
  const current = state.tools.find((item) => item.id === dragging);
  if (current && current.category_id !== dest) {
    void state.moveTool(dragging, dest).catch((error) =>
      message(`移动失败：${String(error)}`, { title: "CommandDeck", kind: "error" })
    );
  }
}
