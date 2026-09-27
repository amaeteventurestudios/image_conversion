// Thin orchestration over sharp/libvips. No codec work happens here.
import sharp, { type Sharp } from "sharp";
import fs from "node:fs/promises";
// @ts-expect-error bmp-js ships no types
import bmp from "bmp-js";
import { config } from "./config.ts";
import { targetDimensions, type ConvertSettings } from "../shared/settings.ts";

sharp.cache({ files: 0 });

export const INPUT_FORMATS = ["png", "jpeg", "webp", "avif", "gif", "bmp", "tiff", "heif"] as const;

export interface SourceInfo {
  format: string; // png, jpeg, webp, avif (heif), gif, bmp, tiff
  width: number; // after EXIF orientation
  height: number;
  pages: number;
  hasAlpha: boolean;
  metadata: { exif: boolean; icc: boolean; xmp: boolean; iptc: boolean };
}

export class ImageError extends Error {}

const isBmp = (buf: Buffer) => buf.length > 26 && buf[0] === 0x42 && buf[1] === 0x4d;

/** Decode a BMP (not supported by libvips' prebuilt loaders) into raw RGBA. */
function decodeBmp(buf: Buffer) {
  let decoded: { width: number; height: number; data: Buffer };
  try {
    decoded = bmp.decode(buf);
  } catch {
    throw new ImageError("This BMP file is corrupted or uses an unsupported variant.");
  }
  const { width, height, data } = decoded;
  if (width * height > config.maxInputPixels) throw new ImageError("Image dimensions are too large.");
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    // bmp-js yields ABGR; alpha is unreliable for 24-bit files, so treat as opaque.
    rgba[i * 4] = data[i * 4 + 3];
    rgba[i * 4 + 1] = data[i * 4 + 2];
    rgba[i * 4 + 2] = data[i * 4 + 1];
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

async function open(path: string, opts: { animated?: boolean } = {}): Promise<{ img: Sharp; bmp: boolean }> {
  const head = Buffer.alloc(32);
  const fh = await fs.open(path, "r");
  try {
    await fh.read(head, 0, 32, 0);
  } finally {
    await fh.close();
  }
  if (isBmp(head)) {
    const { width, height, rgba } = decodeBmp(await fs.readFile(path));
    return { img: sharp(rgba, { raw: { width, height, channels: 4 } }), bmp: true };
  }
  return {
    img: sharp(path, { limitInputPixels: config.maxInputPixels, animated: opts.animated ?? false, failOn: "error" }),
    bmp: false,
  };
}

export async function inspect(path: string): Promise<SourceInfo> {
  try {
    const { img, bmp } = await open(path);
    const m = await img.metadata();
    if (bmp) {
      return { format: "bmp", width: m.width!, height: m.height!, pages: 1, hasAlpha: false, metadata: { exif: false, icc: false, xmp: false, iptc: false } };
    }
    const format = m.format === "heif" ? (m.compression === "av1" ? "avif" : "heif") : m.format!;
    if (!(INPUT_FORMATS as readonly string[]).includes(format)) throw new ImageError(`Unsupported format: ${format}`);
    if (!m.width || !m.height) throw new ImageError("Could not read image dimensions.");
    const rotated = (m.orientation ?? 1) >= 5;
    const pages = m.pages ?? 1;
    const frameH = pages > 1 && m.pageHeight ? m.pageHeight : m.height;
    // Verify the pixel data actually decodes (catches truncated/corrupt files early).
    await sharp(path, { limitInputPixels: config.maxInputPixels, failOn: "error" }).resize(8, 8, { fit: "inside" }).raw().toBuffer();
    return {
      format,
      width: rotated ? frameH : m.width,
      height: rotated ? m.width : frameH,
      pages,
      hasAlpha: !!m.hasAlpha,
      metadata: { exif: !!m.exif, icc: !!m.icc, xmp: !!m.xmp, iptc: !!m.iptc },
    };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    const msg = String((e as Error).message ?? e);
    if (/pixel limit/i.test(msg)) throw new ImageError("Image dimensions are too large.");
    if (/unsupported image format/i.test(msg)) throw new ImageError("Unsupported or unrecognised image file.");
    throw new ImageError("This image appears to be corrupted and could not be read.");
  }
}

export async function thumbnail(path: string, out: string) {
  const { img } = await open(path);
  await img.autoOrient().resize(160, 160, { fit: "cover" }).webp({ quality: 70 }).toFile(out);
}

function pipeline(img: Sharp, src: SourceInfo, s: ConvertSettings, animated: boolean, q = s.quality) {
  img = img.autoOrient();
  const dims = targetDimensions(src.width, src.height, s.resize);
  if (dims.width !== src.width || dims.height !== src.height) img = img.resize(dims.width, dims.height, { fit: "fill" });
  if (s.metadata === "preserve") img = img.keepMetadata();
  switch (s.format) {
    case "webp":
      img = img.webp({ quality: q, effort: 4, ...(animated ? { loop: 0 } : {}) });
      break;
    case "avif":
      img = img.avif({ quality: q, effort: 4 });
      break;
    case "jpeg":
      if (src.hasAlpha) img = img.flatten({ background: "#ffffff" });
      img = img.jpeg({ quality: q, mozjpeg: true });
      break;
    case "png":
      // PNG is lossless; below 100 we quantise to a palette (like pngquant) so the slider still means something.
      img = q < 100 ? img.png({ palette: true, quality: q, effort: 7, compressionLevel: 9 }) : img.png({ compressionLevel: 9, effort: 7 });
      break;
  }
  return { img, dims };
}

export interface EncodeResult {
  size: number;
  width: number;
  height: number;
  quality: number; // quality actually used (differs from settings when targetKB is set)
}

async function encode(path: string, src: SourceInfo, s: ConvertSettings, q: number) {
  const animated = src.pages > 1 && s.format === "webp" && src.format !== "bmp";
  const { img } = await open(path, { animated });
  const { img: out, dims } = pipeline(img, src, s, animated, q);
  const data = await out.toBuffer();
  return { data, dims };
}

/**
 * Encode at settings.quality, or with targetKB set, binary-search for the highest
 * quality whose output fits. If nothing fits, the smallest (quality 1) is returned.
 */
async function encodeBest(path: string, src: SourceInfo, s: ConvertSettings) {
  if (!s.targetKB) return { ...(await encode(path, src, s, s.quality)), quality: s.quality };
  const limit = s.targetKB * 1024;
  let lo = 1;
  let hi = 100;
  let best: { data: Buffer; dims: { width: number; height: number }; quality: number } | undefined;
  while (lo <= hi) {
    const q = (lo + hi) >> 1;
    const r = await encode(path, src, s, q);
    if (r.data.length <= limit) {
      best = { ...r, quality: q };
      lo = q + 1;
    } else hi = q - 1;
  }
  return best ?? { ...(await encode(path, src, s, 1)), quality: 1 };
}

/** Real test encode in memory; nothing is written to disk. */
export async function estimate(path: string, src: SourceInfo, s: ConvertSettings): Promise<EncodeResult> {
  const { data, dims, quality } = await encodeBest(path, src, s);
  return { size: data.length, width: dims.width, height: dims.height, quality };
}

export async function convert(path: string, src: SourceInfo, s: ConvertSettings, out: string): Promise<EncodeResult> {
  const { data, dims, quality } = await encodeBest(path, src, s);
  await fs.writeFile(out, data);
  return { size: data.length, width: dims.width, height: dims.height, quality };
}

// ---------------------------------------------------------------------------
// Simple priority semaphore: conversions jump ahead of speculative estimates.

let running = 0;
const queues: { high: (() => void)[]; low: (() => void)[] } = { high: [], low: [] };

export async function withSlot<T>(priority: "high" | "low", fn: () => Promise<T>): Promise<T> {
  if (running < config.concurrency) running++;
  else await new Promise<void>((r) => queues[priority].push(r)); // slot is handed over on release
  try {
    return await fn();
  } finally {
    const next = queues.high.shift() ?? queues.low.shift();
    if (next) next();
    else running--;
  }
}
