import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

export const motionReduced =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

CustomEase.create("cd.out", "M0,0 C0.16,1 0.3,1 1,1");
CustomEase.create("cd.in", "M0,0 C0.7,0 0.84,0 1,1");

gsap.config({ nullTargetWarn: false });
gsap.defaults({
  duration: motionReduced ? 0.01 : 0.32,
  ease: "cd.out",
  overwrite: "auto",
});

export { gsap };

export const EASE = {
  out: "cd.out",
  in: "cd.in",
  spring: "back.out(1.85)",
  soft: "power3.out",
} as const;

function instant(el: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  gsap.set(el, { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, ...vars });
}

export function killMotion(...els: Array<gsap.TweenTarget | null | undefined>) {
  for (const el of els) {
    if (el) gsap.killTweensOf(el);
  }
}

export function bootSplash(root: HTMLElement | null) {
  if (!root) return;
  const mark = root.querySelector(".cd-mark");
  const lines = root.querySelectorAll("p");
  const bar = root.querySelector(".cd-boot-bar");
  if (motionReduced) {
    instant([mark, lines, bar].filter(Boolean));
    return;
  }
  const tl = gsap.timeline();
  if (mark) {
    tl.fromTo(
      mark,
      { opacity: 0, scale: 0.7, rotate: -8 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.55, ease: EASE.spring }
    );
  }
  tl.fromTo(lines, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: EASE.out }, 0.12);
  if (bar) {
    gsap.fromTo(
      bar,
      { scaleX: 0.15, opacity: 0.4 },
      { scaleX: 1, opacity: 1, duration: 1.15, ease: "sine.inOut", repeat: -1, yoyo: true }
    );
  }
  return tl;
}

export function bootShell(root: HTMLElement | null) {
  if (!root) return;
  if (motionReduced) {
    instant(root);
    return;
  }
  const sidebar = root.querySelector("aside");
  const main = root.querySelector("main");
  const footer = root.querySelector("footer");
  const tl = gsap.timeline();
  tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out" });
  if (sidebar) {
    tl.fromTo(sidebar, { x: -28, opacity: 0 }, { x: 0, opacity: 1, duration: 0.55, ease: EASE.out }, 0.04);
  }
  if (main) {
    tl.fromTo(main, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, ease: EASE.out }, 0.08);
  }
  if (footer) {
    tl.fromTo(footer, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: EASE.out }, 0.14);
  }
  return tl;
}

export function enterPage(el: Element | null) {
  if (!el) return;
  if (motionReduced) {
    instant(el);
    return;
  }
  return gsap.fromTo(
    el,
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.48, ease: EASE.out, clearProps: "transform" }
  );
}

export function enterView(el: HTMLElement | null, kind: "catalog" | "tool" | "page") {
  if (!el) return;
  if (motionReduced) {
    instant(el);
    return;
  }
  const hasTerm = Boolean(el.querySelector(".terminal-well"));
  if (hasTerm || kind === "tool") {
    return gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: "power1.out" });
  }
  if (kind === "catalog") {
    return gsap.fromTo(
      el,
      { opacity: 0, x: -14 },
      { opacity: 1, x: 0, duration: 0.42, ease: EASE.out, clearProps: "transform" }
    );
  }
  return enterPage(el);
}

export function overlayIn(overlay: Element | null, panel: Element | null) {
  if (!overlay) return;
  if (motionReduced) {
    instant(overlay);
    if (panel) instant(panel);
    return;
  }
  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out" });
  if (panel) {
    gsap.fromTo(
      panel,
      { opacity: 0, y: 18, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: EASE.out }
    );
  }
}

export function overlayOut(
  overlay: Element | null,
  panel: Element | null,
  onDone: () => void
) {
  if (motionReduced || !overlay) {
    onDone();
    return;
  }
  const tl = gsap.timeline({ onComplete: onDone });
  if (panel) {
    tl.to(panel, { opacity: 0, y: 10, scale: 0.98, duration: 0.16, ease: EASE.in }, 0);
  }
  tl.to(overlay, { opacity: 0, duration: 0.18, ease: "power1.in" }, 0);
}

export function menuIn(el: Element | null) {
  if (!el) return;
  if (motionReduced) {
    instant(el);
    return;
  }
  const items = el.querySelectorAll("button");
  gsap.fromTo(
    el,
    { opacity: 0, y: 8, scale: 0.94 },
    { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: EASE.out, transformOrigin: "16px 8px" }
  );
  if (items.length) {
    gsap.fromTo(
      items,
      { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: 0.2, stagger: 0.018, ease: EASE.out, delay: 0.04 }
    );
  }
}

export function menuOut(el: Element | null, onDone: () => void) {
  if (motionReduced || !el) {
    onDone();
    return;
  }
  gsap.to(el, { opacity: 0, y: 6, scale: 0.96, duration: 0.12, ease: EASE.in, onComplete: onDone });
}

export function staggerApps(els: ArrayLike<Element> | null) {
  if (!els || els.length === 0) return;
  if (motionReduced) {
    instant(els);
    return;
  }
  const icons = Array.from(els)
    .map((el) => el.querySelector(".cd-app-icon"))
    .filter((node): node is Element => Boolean(node));
  const names = Array.from(els)
    .map((el) => el.querySelector(".cd-app-name"))
    .filter((node): node is Element => Boolean(node));
  gsap.fromTo(
    els,
    { opacity: 0, y: 36 },
    { opacity: 1, y: 0, duration: 0.56, stagger: 0.02, ease: EASE.out }
  );
  if (icons.length) {
    gsap.fromTo(
      icons,
      { scale: 0.42, rotate: -12 },
      { scale: 1, rotate: 0, duration: 0.72, stagger: 0.02, ease: EASE.spring }
    );
  }
  if (names.length) {
    gsap.fromTo(
      names,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.36, stagger: 0.02, delay: 0.1, ease: EASE.out }
    );
  }
}

export function staggerList(els: ArrayLike<Element> | null, vars?: gsap.TweenVars) {
  if (!els || els.length === 0) return;
  if (motionReduced) {
    instant(els);
    return;
  }
  return gsap.fromTo(
    els,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.36, stagger: 0.028, ease: EASE.out, ...vars }
  );
}

export function slideInX(el: Element | null, from = 28) {
  if (!el) return;
  if (motionReduced) {
    instant(el);
    return;
  }
  return gsap.fromTo(
    el,
    { opacity: 0, x: from },
    { opacity: 1, x: 0, duration: 0.38, ease: EASE.out }
  );
}

export function slideOutX(el: Element | null, to = 24, onDone: () => void) {
  if (motionReduced || !el) {
    onDone();
    return;
  }
  gsap.to(el, { opacity: 0, x: to, duration: 0.2, ease: EASE.in, onComplete: onDone });
}

export function scrollElementInto(container: HTMLElement | null, target: HTMLElement | null) {
  if (!container || !target) return;
  const c = container.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const y = container.scrollTop + (t.top - c.top) - 24;
  if (motionReduced) {
    container.scrollTop = y;
    return;
  }
  gsap.to(container, { scrollTop: y, duration: 0.55, ease: EASE.out });
}

export function moveInk(ink: HTMLElement | null, active: HTMLElement | null, bar: HTMLElement | null) {
  if (!ink || !active || !bar) return;
  const parent = bar.getBoundingClientRect();
  const box = active.getBoundingClientRect();
  const next = {
    x: box.left - parent.left + bar.scrollLeft + 10,
    width: Math.max(18, box.width - 20),
  };
  if (motionReduced) {
    gsap.set(ink, next);
    return;
  }
  gsap.to(ink, { ...next, duration: 0.34, ease: EASE.out });
}

export function usePageEnter<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const tween = enterPage(ref.current);
    return () => {
      tween?.kill();
    };
  }, []);
  return ref;
}

export function useOverlayController(onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    overlayIn(overlayRef.current, panelRef.current);
    const panel = panelRef.current;
    const rows = panel?.querySelectorAll(".cd-row, [role='option']");
    if (rows && rows.length) staggerList(rows, { delay: 0.08, stagger: 0.016 });
    return () => {
      killMotion(overlayRef.current, panelRef.current);
    };
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    overlayOut(overlayRef.current, panelRef.current, () => onCloseRef.current());
  }, []);

  return { overlayRef, panelRef, close };
}

export function useMenuMotion(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    menuIn(ref.current);
    return () => {
      killMotion(ref.current);
    };
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    menuOut(ref.current, () => onCloseRef.current());
  }, []);

  return { ref, close };
}

export function useMountMotion(ref: RefObject<HTMLElement | null>, play: (el: HTMLElement) => gsap.core.Tween | gsap.core.Timeline | void) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tween = play(el);
    return () => {
      if (tween && "kill" in tween) tween.kill();
    };
  }, [ref, play]);
}
