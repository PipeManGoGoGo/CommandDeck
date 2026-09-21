export const TERM_FONT_IDS = [
  "current",
  "cobalt2",
  "dracula",
  "nord",
  "encom",
  "tabby-light",
  "material-light",
  "solarized-light",
  "github-light",
] as const;
export type TermFontId = (typeof TERM_FONT_IDS)[number];

type Term = Record<string, string>;

function luminance(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function term(partial: {
  background: string;
  foreground: string;
  cursor: string;
  colors: string[];
}): Term {
  const c = partial.colors;
  const light = luminance(partial.background) > 160;
  return {
    background: partial.background,
    foreground: partial.foreground,
    cursor: partial.cursor,
    cursorAccent: partial.background,
    selectionBackground: light ? "#8cb8ff" : "#3d6ea8",
    selectionInactiveBackground: light ? "#c5d9f7" : "#2a4566",
    selectionForeground: light ? "#102033" : "#ffffff",
    black: c[0],
    red: c[1],
    green: c[2],
    yellow: c[3],
    blue: c[4],
    magenta: c[5],
    cyan: c[6],
    white: c[7],
    brightBlack: c[8],
    brightRed: c[9],
    brightGreen: c[10],
    brightYellow: c[11],
    brightBlue: c[12],
    brightMagenta: c[13],
    brightCyan: c[14],
    brightWhite: c[15],
  };
}

export const TERM_FONTS: {
  id: TermFontId;
  label: string;
  hint: string;
  family: string;
  theme: Term | null;
}[] = [
  {
    id: "current",
    label: "跟随界面",
    hint: "跟随界面 · Raycast 暗色",
    family: '"Cascadia Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
    theme: null,
  },
  {
    id: "cobalt2",
    label: "Cobalt2 · 深",
    hint: "深蓝底 · Fira Code",
    family: '"Fira Code", Menlo, monospace',
    theme: term({
      background: "#132738",
      foreground: "#ffffff",
      cursor: "#f0cc09",
      colors: ["#000000", "#ff0000", "#38de21", "#ffe50a", "#1460d2", "#ff005d", "#00bbbb", "#bbbbbb", "#555555", "#f40e17", "#3bd01d", "#edc809", "#5555ff", "#ff55ff", "#6ae3fa", "#ffffff"],
    }),
  },
  {
    id: "dracula",
    label: "Dracula · 深",
    hint: "紫黑底 · IBM Plex Mono",
    family: '"IBM Plex Mono", Menlo, monospace',
    theme: term({
      background: "#1e1f29",
      foreground: "#f8f8f2",
      cursor: "#bbbbbb",
      colors: ["#000000", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#bbbbbb", "#555555", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#ffffff"],
    }),
  },
  {
    id: "nord",
    label: "Nord · 深",
    hint: "北欧底 · Source Code Pro",
    family: '"Source Code Pro", Menlo, monospace',
    theme: term({
      background: "#2e3440",
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      colors: ["#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0", "#373e4d", "#94545d", "#809575", "#b29e75", "#68809a", "#8c738c", "#6d96a5", "#aeb3bb"],
    }),
  },
  {
    id: "encom",
    label: "ENCOM · 深",
    hint: "纯黑底 · Menlo",
    family: "Menlo, Monaco, Consolas, monospace",
    theme: term({
      background: "#000000",
      foreground: "#00a595",
      cursor: "#4cf1e1",
      colors: ["#000000", "#9f0000", "#008b00", "#ffd000", "#0081ff", "#bc00ca", "#008b8b", "#bbbbbb", "#555555", "#ff0000", "#00ee00", "#ffff00", "#0000ff", "#ff00ff", "#00cdcd", "#ffffff"],
    }),
  },
  {
    id: "tabby-light",
    label: "Tabby 浅",
    hint: "白底 · JetBrains Mono",
    family: '"JetBrains Mono", Menlo, monospace',
    theme: term({
      background: "#ffffff",
      foreground: "#4d4d4c",
      cursor: "#4d4d4c",
      colors: ["#000000", "#c82829", "#718c00", "#eab700", "#4271ae", "#8959a8", "#3e999f", "#ffffff", "#000000", "#c82829", "#718c00", "#eab700", "#4271ae", "#8959a8", "#3e999f", "#ffffff"],
    }),
  },
  {
    id: "material-light",
    label: "Material 浅",
    hint: "灰白底 · Fira Code",
    family: '"Fira Code", Menlo, monospace',
    theme: term({
      background: "#eaeaea",
      foreground: "#232322",
      cursor: "#16afca",
      colors: ["#212121", "#b7141f", "#457b24", "#f6981e", "#134eb2", "#560088", "#0e717c", "#efefef", "#424242", "#e83b3f", "#7aba3a", "#ffea2e", "#54a4f3", "#aa4dbc", "#26bbd1", "#d9d9d9"],
    }),
  },
  {
    id: "solarized-light",
    label: "Solarized 浅",
    hint: "米色底 · IBM Plex Mono",
    family: '"IBM Plex Mono", Menlo, monospace',
    theme: term({
      background: "#fdf6e3",
      foreground: "#657b83",
      cursor: "#657b83",
      colors: ["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5", "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3"],
    }),
  },
  {
    id: "github-light",
    label: "GitHub 浅",
    hint: "纸白底 · Source Code Pro",
    family: '"Source Code Pro", Menlo, monospace',
    theme: term({
      background: "#ffffff",
      foreground: "#1f2328",
      cursor: "#0969da",
      colors: ["#24292f", "#cf222e", "#116329", "#4d2d00", "#0969da", "#8250df", "#1b7c83", "#6e7781", "#57606a", "#a40e26", "#1a7f37", "#633c01", "#218bff", "#a475f9", "#3192aa", "#8c959f"],
    }),
  },
];

export function isTermFontId(value: string | null | undefined): value is TermFontId {
  return TERM_FONT_IDS.includes(value as TermFontId);
}

export function readStoredTermFont(): TermFontId {
  const raw = localStorage.getItem("commanddeck-term-family");
  return isTermFontId(raw) ? raw : "current";
}

export function getTermFontFamily(id?: TermFontId) {
  const resolved = id ?? readStoredTermFont();
  return TERM_FONTS.find((item) => item.id === resolved)?.family ?? TERM_FONTS[0].family;
}

export function getActiveTermTheme(): Term | null {
  const id = (document.documentElement.dataset.termFont as TermFontId | undefined) ?? readStoredTermFont();
  return TERM_FONTS.find((item) => item.id === id)?.theme ?? null;
}

export function fontSwatches(id: TermFontId) {
  const theme = TERM_FONTS.find((item) => item.id === id)?.theme;
  if (!theme) {
    return document.documentElement.dataset.theme === "light"
      ? ["#c82829", "#718c00", "#eab700", "#4271ae", "#8959a8", "#3e999f"]
      : ["#ff615a", "#b1e969", "#ebd99c", "#5da9f6", "#e86aff", "#82fff7"];
  }
  return [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan];
}

export function applyTermFont(id: TermFontId) {
  const font = TERM_FONTS.find((item) => item.id === id) ?? TERM_FONTS[0];
  document.documentElement.dataset.termFont = font.id;
  document.documentElement.style.setProperty("--mono-font", font.family);
  if (font.theme?.background) {
    document.documentElement.style.setProperty("--term-bg", font.theme.background);
  } else {
    document.documentElement.style.removeProperty("--term-bg");
  }
  localStorage.setItem("commanddeck-term-family", font.id);
}
