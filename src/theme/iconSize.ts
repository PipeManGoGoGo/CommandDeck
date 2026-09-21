export const ICON_SIZE_IDS = ["s", "m", "l", "xl"] as const;
export type IconSizeId = (typeof ICON_SIZE_IDS)[number];

export const ICON_SIZES: { id: IconSizeId; label: string; px: number }[] = [
  { id: "s", label: "小", px: 64 },
  { id: "m", label: "中", px: 80 },
  { id: "l", label: "大", px: 96 },
  { id: "xl", label: "特大", px: 112 },
];

export function isIconSizeId(value: string | null | undefined): value is IconSizeId {
  return ICON_SIZE_IDS.includes(value as IconSizeId);
}

export function readStoredIconSize(): IconSizeId {
  const raw = localStorage.getItem("commanddeck-icon-size");
  return isIconSizeId(raw) ? raw : "l";
}

type Listener = (id: IconSizeId) => void;
const listeners = new Set<Listener>();

export function applyIconSize(id: IconSizeId) {
  const px = ICON_SIZES.find((item) => item.id === id)?.px ?? 96;
  const root = document.documentElement;
  root.dataset.iconSize = id;
  root.style.setProperty("--cd-icon", `${px}px`);
  root.style.setProperty("--cd-cell", `${px + 36}px`);
  localStorage.setItem("commanddeck-icon-size", id);
  listeners.forEach((fn) => fn(id));
}

export function subscribeIconSize(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
