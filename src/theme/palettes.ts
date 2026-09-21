import { getActiveTermTheme } from "./fonts";

export const PALETTE_IDS = ["tabby", "tabby-light"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export type ThemeMode = "dark" | "light";
type Family = "tabby";

type Term = Record<string, string>;
type Chrome = Record<string, string>;

export const PALETTES: {
  id: PaletteId;
  label: string;
  hint: string;
  swatch: string;
  mode: ThemeMode;
  chrome: { dark: string; light: string };
}[] = [
  { id: "tabby", label: "黑暗", hint: "Raycast", swatch: "#ffffff", mode: "dark", chrome: { dark: "#07080a", light: "#07080a" } },
  { id: "tabby-light", label: "明亮", hint: "Tabby Default Light", swatch: "#4271ae", mode: "light", chrome: { dark: "#ffffff", light: "#ffffff" } },
];

function hexRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function chromeFrom(
  steps: string[],
  well: string,
  brand: string[],
  extra: { emerald?: string[]; red?: string[]; amber?: string[]; dark: boolean }
): Chrome {
  const g = steps.map(hexRgb);
  const brandRgb = brand.map(hexRgb);
  const em = (extra.emerald ?? ["#b1e969", "#ddf88f"]).map(hexRgb);
  const rd = (extra.red ?? ["#f58c80", "#ff615a"]).map(hexRgb);
  const am = (extra.amber ?? ["#ebd99c", "#eee5b2", "#eab700"]).map(hexRgb);
  return {
    "--gray-50": g[0],
    "--gray-100": g[1],
    "--gray-200": g[2],
    "--gray-300": g[3],
    "--gray-400": g[4],
    "--gray-500": g[5],
    "--gray-600": g[6],
    "--gray-700": g[7],
    "--gray-750": g[8],
    "--gray-800": g[9],
    "--gray-850": g[10],
    "--gray-900": g[11],
    "--gray-925": g[12],
    "--gray-950": g[13],
    "--well": hexRgb(well),
    "--brand-300": brandRgb[0],
    "--brand-400": brandRgb[1],
    "--brand-500": brandRgb[2],
    "--brand-600": brandRgb[3],
    "--emerald-300": em[0],
    "--emerald-400": em[1],
    "--red-300": rd[0],
    "--red-400": rd[1],
    "--amber-200": am[0],
    "--amber-300": am[1],
    "--amber-400": am[2],
    "--shadow-panel": "none",
    "--shadow-glow": extra.dark ? "0 0 0 1px #242728" : "0 0 0 1px rgba(20, 20, 18, 0.08)",
    "--backdrop-glow": extra.dark ? "rgba(255, 255, 255, 0.04)" : "rgba(20, 20, 18, 0.03)",
  };
}

const CHROME: Record<Family, { dark: Chrome; light: Chrome }> = {
  tabby: {
    dark: chromeFrom(
      ["#f4f4f6", "#e8e8ea", "#cdcdcd", "#b4b4b5", "#9c9c9d", "#6a6b6c", "#565758", "#434345", "#2e3032", "#242728", "#18191a", "#121212", "#101111", "#07080a"],
      "#07080a",
      ["#ffffff", "#f4f4f6", "#e8e8e8", "#ffffff"],
      { dark: true, emerald: ["#59d499", "#59d499"], red: ["#ff6161", "#ff6161"], amber: ["#ffc533", "#ffc533", "#ffc533"] }
    ),
    light: chromeFrom(
      ["#4d4d4c", "#5c5c5b", "#6e6e6c", "#80807c", "#9a9a96", "#b0b0ac", "#c8c8c4", "#e0e0dc", "#ececea", "#f4f4f2", "#ffffff", "#ffffff", "#f6f6f4", "#ffffff"],
      "#f4f4f2",
      ["#8a5a2e", "#c4894a", "#9a6a3e", "#6e4424"],
      { dark: false, emerald: ["#718c00", "#3e999f"], red: ["#c82829", "#c82829"] }
    ),
  },
};

const TERMINAL: Record<Family, { dark: Term; light: Term }> = {
  tabby: {
    dark: {
      background: "#07080a",
      foreground: "#cdcdcd",
      cursor: "#f4f4f6",
      cursorAccent: "#07080a",
      selectionBackground: "#3d6ea8",
      selectionInactiveBackground: "#2a4566",
      selectionForeground: "#ffffff",
      black: "#000000",
      red: "#ff615a",
      green: "#b1e969",
      yellow: "#ebd99c",
      blue: "#5da9f6",
      magenta: "#e86aff",
      cyan: "#82fff7",
      white: "#dedacf",
      brightBlack: "#313131",
      brightRed: "#f58c80",
      brightGreen: "#ddf88f",
      brightYellow: "#eee5b2",
      brightBlue: "#a5c7ff",
      brightMagenta: "#ddaaff",
      brightCyan: "#b7fff9",
      brightWhite: "#ffffff",
    },
    light: {
      background: "#ffffff",
      foreground: "#4d4d4c",
      cursor: "#1d4ed8",
      cursorAccent: "#ffffff",
      selectionBackground: "#8cb8ff",
      selectionInactiveBackground: "#c5d9f7",
      selectionForeground: "#102033",
      black: "#000000",
      red: "#c82829",
      green: "#718c00",
      yellow: "#eab700",
      blue: "#4271ae",
      magenta: "#8959a8",
      cyan: "#3e999f",
      white: "#ffffff",
      brightBlack: "#000000",
      brightRed: "#c82829",
      brightGreen: "#718c00",
      brightYellow: "#eab700",
      brightBlue: "#4271ae",
      brightMagenta: "#8959a8",
      brightCyan: "#3e999f",
      brightWhite: "#ffffff",
    },
  },
};

export function isPaletteId(value: string | null | undefined): value is PaletteId {
  return PALETTE_IDS.includes(value as PaletteId);
}

export function skinFamily(_id: PaletteId): Family {
  return "tabby";
}

export function skinMode(id: PaletteId): ThemeMode {
  return id.endsWith("-light") ? "light" : "dark";
}

export function readStoredPalette(): PaletteId {
  return localStorage.getItem("commanddeck-palette") === "tabby-light" ? "tabby-light" : "tabby";
}

export function applyPalette(id: PaletteId) {
  const mode = skinMode(id);
  document.documentElement.dataset.palette = id;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  localStorage.setItem("commanddeck-palette", id);
  localStorage.setItem("commanddeck-theme", mode);
  for (const [key, value] of Object.entries(CHROME.tabby[mode])) {
    document.documentElement.style.setProperty(key, value);
  }
}

export function getTerminalTheme() {
  const overlay = getActiveTermTheme();
  if (overlay) return overlay;
  const raw = document.documentElement.dataset.palette;
  const palette = isPaletteId(raw) ? raw : readStoredPalette();
  return TERMINAL.tabby[skinMode(palette)];
}

export function getTerminalSearchDecorations() {
  const theme = getTerminalTheme();
  const hex = (theme.background || "#000000").replace("#", "");
  const n = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16);
  const light = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 160;
  if (light) {
    return {
      matchBackground: "#ffe08a",
      matchBorder: "#c4850a",
      matchOverviewRuler: "#c4850a",
      activeMatchBackground: "#ff9f1a",
      activeMatchBorder: "#9a4b00",
      activeMatchColorOverviewRuler: "#ff9f1a",
    };
  }
  return {
    matchBackground: "#8a6d12",
    matchBorder: "#ffc533",
    matchOverviewRuler: "#ffc533",
    activeMatchBackground: "#e08a00",
    activeMatchBorder: "#ffc533",
    activeMatchColorOverviewRuler: "#ffc533",
  };
}
