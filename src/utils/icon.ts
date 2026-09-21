import { convertIcon } from "./tauri";

const MAX_ICON_FILE_SIZE = 8 * 1024 * 1024;
const MAX_ICON_DIMENSION = 256;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

export const ICON_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.svg,.ico,.icns,.icn,.bmp";

export async function prepareIcon(file: File): Promise<string> {
  if (file.size > MAX_ICON_FILE_SIZE) {
    throw new Error("图标不能超过 8 MB");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const extracted = extractDisplayableImage(bytes, name);
  if (extracted) {
    try {
      return await rasterizeBlob(extracted);
    } catch {
      /* fall through to system conversion */
    }
  }

  try {
    return await rasterizeBlob(new Blob([toBuffer(bytes)], { type: guessMime(name, file.type, bytes) }));
  } catch {
    /* native decode failed */
  }

  try {
    const png = await convertIcon(Array.from(bytes), file.name || "icon.icns");
    return await rasterizeBlob(new Blob([Uint8Array.from(png)], { type: "image/png" }));
  } catch (error) {
    if (name.endsWith(".icns") || name.endsWith(".icn") || name.endsWith(".ico")) {
      throw new Error(error instanceof Error ? error.message : "无法转换此 ICNS，请改用 PNG");
    }
    throw new Error("无法读取此文件。请使用 PNG、JPEG、WebP、GIF、SVG、ICO 或 ICNS");
  }
}

function extractDisplayableImage(bytes: Uint8Array, name: string): Blob | null {
  const pngs = findEmbeddedPngs(bytes);
  if (pngs.length > 0) {
    const largest = pngs.reduce((a, b) => (b.length > a.length ? b : a));
    return new Blob([toBuffer(largest)], { type: "image/png" });
  }
  if (name.endsWith(".ico") || isIco(bytes)) {
    const png = extractIcoPng(bytes);
    if (png) return new Blob([toBuffer(png)], { type: "image/png" });
  }
  return null;
}

function toBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function findEmbeddedPngs(data: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i <= data.length - 24; i++) {
    if (!startsWith(data, i, PNG_SIG)) continue;
    const end = indexOfBytes(data, IEND, i + 8);
    if (end < 0) continue;
    out.push(data.slice(i, end + IEND.length));
    i = end + IEND.length - 1;
  }
  return out;
}

function isIco(data: Uint8Array): boolean {
  return data.length >= 6 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0;
}

function extractIcoPng(data: Uint8Array): Uint8Array | null {
  if (!isIco(data)) return null;
  const count = data[4] | (data[5] << 8);
  let best: Uint8Array | null = null;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    if (entry + 16 > data.length) break;
    const size =
      (data[entry + 8] |
        (data[entry + 9] << 8) |
        (data[entry + 10] << 16) |
        (data[entry + 11] << 24)) >>>
      0;
    const offset =
      (data[entry + 12] |
        (data[entry + 13] << 8) |
        (data[entry + 14] << 16) |
        (data[entry + 15] << 24)) >>>
      0;
    if (offset < 0 || size <= 0 || offset + size > data.length) continue;
    const slice = data.slice(offset, offset + size);
    if (startsWith(slice, 0, PNG_SIG) && (!best || slice.length > best.length)) {
      best = slice;
    }
  }
  return best;
}

function startsWith(data: Uint8Array, offset: number, sig: number[]): boolean {
  if (offset + sig.length > data.length) return false;
  return sig.every((byte, i) => data[offset + i] === byte);
}

function indexOfBytes(data: Uint8Array, needle: number[], from: number): number {
  outer: for (let i = from; i <= data.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (data[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function guessMime(name: string, type: string, bytes: Uint8Array): string {
  if (type && type !== "application/octet-stream") return type;
  if (name.endsWith(".svg") || looksLikeSvg(bytes)) return "image/svg+xml";
  if (name.endsWith(".png") || startsWith(bytes, 0, PNG_SIG)) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || (bytes[0] === 0xff && bytes[1] === 0xd8)) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".ico") || isIco(bytes)) return "image/x-icon";
  return "application/octet-stream";
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trim().toLowerCase();
  return head.startsWith("<svg") || head.includes("<svg");
}

async function rasterizeBlob(blob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return fitIconFromImage(await loadImage(objectUrl));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const trimmedCache = new Map<string, string>();
const trimmedPending = new Map<string, Promise<string>>();

export function peekTrimmedIcon(src: string) {
  return trimmedCache.get(src);
}

export function displayIcon(src: string): Promise<string> {
  const cached = trimmedCache.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = trimmedPending.get(src);
  if (pending) return pending;
  const next = loadImage(src)
    .then((image) => {
      const url = fitIconFromImage(image);
      trimmedCache.set(src, url);
      trimmedPending.delete(src);
      return url;
    })
    .catch(() => {
      trimmedCache.set(src, src);
      trimmedPending.delete(src);
      return src;
    });
  trimmedPending.set(src, next);
  return next;
}

function similar(a: readonly number[], b: readonly number[], fuzz = 36) {
  if (a[3] < 20 && b[3] < 20) return true;
  if (a[3] < 20 || b[3] < 20) return false;
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= fuzz * 3;
}

function lumaOf(p: readonly number[]) {
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
}

function cropContent(image: HTMLImageElement) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (w < 8 || h < 8) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, w, h);
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
  };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const bg = corners[0];
  const cornersAgree = corners.every((corner) => similar(corner, bg, 40));
  const bgEmpty =
    bg[3] < 20 ||
    (lumaOf(bg) < 52 && Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) < 30);

  const isBg = (x: number, y: number) => {
    const p = px(x, y);
    if (p[3] < 20) return true;
    if (!cornersAgree || !bgEmpty) return false;
    if (bg[3] < 20) return false;
    return lumaOf(p) < 52 && Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 30;
  };

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isBg(x, y)) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (count < 24 || minX > maxX) return null;
  const sw = maxX - minX + 1;
  const sh = maxY - minY + 1;
  if (sw < 8 || sh < 8) return null;
  if (sw >= w * 0.96 && sh >= h * 0.96) return null;
  return { sx: minX, sy: minY, sw, sh };
}

function fitIconFromImage(image: HTMLImageElement): string {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("empty");
  const crop = cropContent(image);
  const sx = crop?.sx ?? 0;
  const sy = crop?.sy ?? 0;
  const sw = crop?.sw ?? width;
  const sh = crop?.sh ?? height;
  const size = MAX_ICON_DIMENSION;
  const scale = Math.max(size / sw, size / sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no ctx");
  context.clearRect(0, 0, size, size);
  context.drawImage(image, sx, sy, sw, sh, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode failed"));
    image.src = src;
  });
}
