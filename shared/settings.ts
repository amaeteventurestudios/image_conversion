import { OUTPUT_FORMATS, type OutputFormat } from "./naming.ts";

export type ResizeMode = "none" | "exact" | "width" | "height" | "percent";

export interface ConvertSettings {
  format: OutputFormat;
  quality: number; // 1-100
  /** When set, quality is chosen per image (highest that fits) to keep each output at or under this many KB. */
  targetKB?: number;
  resize: {
    mode: ResizeMode;
    width?: number;
    height?: number;
    percent?: number;
    lockAspect: boolean;
    withoutEnlargement: boolean;
  };
  metadata: "strip" | "preserve";
}

export const DEFAULT_SETTINGS: ConvertSettings = {
  format: "webp",
  quality: 85,
  resize: { mode: "none", width: 1920, height: 1080, percent: 50, lockAspect: true, withoutEnlargement: true },
  metadata: "strip",
};

const clampInt = (v: unknown, min: number, max: number): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

/** Validate untrusted settings coming from the browser. Throws on invalid input. */
export function parseSettings(input: unknown): ConvertSettings {
  const s = (input ?? {}) as Record<string, any>;
  if (!OUTPUT_FORMATS.includes(s.format)) throw new Error("Unsupported output format");
  const quality = clampInt(s.quality, 1, 100);
  if (quality === undefined) throw new Error("Invalid quality");
  const targetKB = s.targetKB == null || s.targetKB === "" ? undefined : clampInt(s.targetKB, 1, 100_000);
  if (s.targetKB != null && s.targetKB !== "" && targetKB === undefined) throw new Error("Invalid target size");
  const r = s.resize ?? {};
  const modes: ResizeMode[] = ["none", "exact", "width", "height", "percent"];
  if (!modes.includes(r.mode)) throw new Error("Invalid resize mode");
  const resize: ConvertSettings["resize"] = {
    mode: r.mode,
    width: clampInt(r.width, 1, 16384),
    height: clampInt(r.height, 1, 16384),
    percent: clampInt(r.percent, 1, 400),
    lockAspect: r.lockAspect !== false,
    withoutEnlargement: r.withoutEnlargement !== false,
  };
  if ((resize.mode === "exact" || resize.mode === "width") && !resize.width) throw new Error("Width is required");
  if ((resize.mode === "exact" || resize.mode === "height") && !resize.height) throw new Error("Height is required");
  if (resize.mode === "percent" && !resize.percent) throw new Error("Percentage is required");
  if (s.metadata !== "strip" && s.metadata !== "preserve") throw new Error("Invalid metadata option");
  return { format: s.format, quality, targetKB, resize, metadata: s.metadata };
}

/** Stable key used to tell whether an output still matches current settings. */
export function settingsKey(s: ConvertSettings): string {
  const r = s.resize;
  const rk =
    r.mode === "none"
      ? "none"
      : `${r.mode}:${r.mode === "exact" || r.mode === "width" ? r.width : ""}x${
          r.mode === "exact" || r.mode === "height" ? r.height : ""
        }:${r.mode === "percent" ? r.percent : ""}:${r.lockAspect ? 1 : 0}:${r.withoutEnlargement ? 1 : 0}`;
  return `${s.format}|${s.targetKB ? `t${s.targetKB}` : s.quality}|${rk}|${s.metadata}`;
}

/** Predict output dimensions without decoding (used for UI before an estimate returns). */
export function targetDimensions(w: number, h: number, r: ConvertSettings["resize"]): { width: number; height: number } {
  let tw = w;
  let th = h;
  switch (r.mode) {
    case "width":
      tw = r.width!;
      th = Math.round((h * tw) / w);
      break;
    case "height":
      th = r.height!;
      tw = Math.round((w * th) / h);
      break;
    case "percent":
      tw = Math.round((w * r.percent!) / 100);
      th = Math.round((h * r.percent!) / 100);
      break;
    case "exact":
      if (r.lockAspect) {
        const scale = Math.min(r.width! / w, r.height! / h);
        tw = Math.round(w * scale);
        th = Math.round(h * scale);
      } else {
        tw = r.width!;
        th = r.height!;
      }
      break;
  }
  if (r.mode !== "none" && r.withoutEnlargement && (tw > w || th > h)) return { width: w, height: h };
  return { width: Math.max(1, tw), height: Math.max(1, th) };
}
