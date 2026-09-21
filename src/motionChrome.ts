import { gsap, motionReduced, EASE } from "./motion";

const bound = new WeakSet<Element>();

function prefersHover() {
  return window.matchMedia("(hover: hover)").matches;
}

function bindApp(el: HTMLElement) {
  const icon = el.querySelector(".cd-app-icon") as HTMLElement | null;
  if (!icon) return;
  let hovering = false;
  const lift = (scale: number, y: number, duration: number, ease: string) => {
    gsap.to(icon, { scale, y, duration: motionReduced ? 0.01 : duration, ease, overwrite: "auto" });
  };
  el.addEventListener("pointerenter", () => {
    if (!prefersHover()) return;
    hovering = true;
    lift(1.2, -14, 0.42, EASE.spring);
  });
  el.addEventListener("pointerleave", () => {
    hovering = false;
    lift(1, 0, 0.28, EASE.out);
  });
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    lift(0.84, 4, 0.1, "power2.in");
  });
  el.addEventListener("pointerup", () => {
    lift(hovering ? 1.16 : 1, hovering ? -10 : 0, 0.36, EASE.spring);
  });
}

function bindPress(el: HTMLElement) {
  const down = () => gsap.to(el, { scale: 0.92, duration: 0.08, ease: "power2.in" });
  const up = () => gsap.to(el, { scale: 1, duration: 0.28, ease: EASE.spring });
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    down();
  });
  el.addEventListener("pointerup", up);
  el.addEventListener("pointerleave", up);
  el.addEventListener("pointercancel", up);
}

function bindRow(el: HTMLElement) {
  if (!prefersHover()) return;
  el.addEventListener("pointerenter", () => {
    gsap.to(el, { x: 6, duration: 0.22, ease: EASE.out });
  });
  el.addEventListener("pointerleave", () => {
    gsap.to(el, { x: 0, duration: 0.28, ease: EASE.out });
  });
}

function bindSwitch(el: HTMLElement) {
  const thumb = el.querySelector("span");
  if (!thumb) return;
  const sync = () => {
    const on = el.getAttribute("aria-checked") === "true";
    gsap.to(thumb, { x: on ? 14 : 0, duration: motionReduced ? 0.01 : 0.32, ease: EASE.out });
  };
  sync();
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["aria-checked"] });
}

function bindPulse(el: HTMLElement) {
  if (motionReduced) return;
  gsap.to(el, {
    opacity: 0.35,
    duration: 0.9,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
  });
}

function bindSpin(el: HTMLElement) {
  if (motionReduced) return;
  gsap.to(el, { rotation: 360, duration: 0.7, repeat: -1, ease: "none" });
}

function bindEl(node: Element) {
  if (!(node instanceof HTMLElement) || bound.has(node)) return;
  bound.add(node);
  if (node.classList.contains("cd-app")) bindApp(node);
  else if (node.classList.contains("cd-btn")) bindPress(node);
  else if (node.classList.contains("cd-row")) bindRow(node);
  else if (node.classList.contains("cd-switch")) bindSwitch(node);
  else if (node.classList.contains("cd-app-dot") || node.hasAttribute("data-pulse")) bindPulse(node);
  else if (node.classList.contains("cd-spin")) bindSpin(node);
}

const SELECTOR =
  ".cd-app, .cd-btn, .cd-row, .cd-switch, .cd-app-dot, .cd-spin, [data-pulse]";

export function installChromeMotion(root: HTMLElement) {
  const scan = (node: ParentNode) => {
    if (node instanceof Element && node.matches(SELECTOR)) bindEl(node);
    node.querySelectorAll(SELECTOR).forEach(bindEl);
  };
  scan(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element || node instanceof DocumentFragment) scan(node as ParentNode);
      });
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
