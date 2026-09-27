// Filename normalization shared by the browser (to preview final names) and
// the server (to enforce them). The server never trusts client-supplied names.

export const OUTPUT_FORMATS = ["webp", "avif", "jpeg", "png"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const EXTENSIONS: Record<OutputFormat, string> = {
  webp: "webp",
  avif: "avif",
  jpeg: "jpg",
  png: "png",
};

const MAX_BASE_LENGTH = 120;

/** Strip an extension from a filename ("IMG_001.png" -> "IMG_001"). */
export function baseName(filename: string): string {
  const name = filename.split(/[\\/]/).pop() ?? filename;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Minimal safety pass: keeps case and most characters, removes anything that
 * could escape a directory or break a download header.
 */
export function safeBase(input: string): string {
  let s = input.normalize("NFC");
  s = s.replace(/[\u0000-\u001f\u007f]/g, "");
  s = s.replace(/[\\/:*?"<>|]/g, "-");
  s = s.replace(/\.{2,}/g, ".");
  s = s.replace(/^[.\s-]+|[.\s]+$/g, "");
  s = s.replace(/\s+/g, " ");
  return s.slice(0, MAX_BASE_LENGTH).trim();
}

/**
 * Web normalization: "African Barber Shop – Evening!" -> "african-barber-shop-evening".
 */
export function webSafeBase(input: string, lowercase = true): string {
  let s = input.normalize("NFKD").replace(/[̀-ͯ]/g, ""); // drop accents
  if (lowercase) s = s.toLowerCase();
  s = s.replace(/[\s_–—]+/g, "-");
  s = s.replace(/[^A-Za-z0-9._-]/g, "");
  s = s.replace(/\.{2,}/g, ".");
  s = s.replace(/-{2,}/g, "-");
  s = s.replace(/^[-.]+|[-.]+$/g, "");
  return s.slice(0, MAX_BASE_LENGTH).replace(/[-.]+$/g, "");
}

export type NamingMode = "keep" | "custom" | "csv";

/** Resolve the final base name (no extension) for one image. */
export function finalBase(opts: {
  mode: NamingMode;
  original: string;
  custom: string;
  webNormalize: boolean;
  lowercase: boolean;
}): string {
  const orig = baseName(opts.original);
  if (opts.mode === "keep") return safeBase(orig) || "image";
  const raw = opts.custom.trim() || orig;
  const out = opts.webNormalize ? webSafeBase(raw, opts.lowercase) : safeBase(raw);
  return out || safeBase(orig) || "image";
}

export function withExtension(base: string, format: OutputFormat): string {
  return `${base}.${EXTENSIONS[format]}`;
}

/** Returns indexes of entries whose names collide (case-insensitive). */
export function duplicateIndexes(names: string[]): Set<number> {
  const seen = new Map<string, number[]>();
  names.forEach((n, i) => {
    const key = n.toLowerCase();
    seen.set(key, [...(seen.get(key) ?? []), i]);
  });
  const dupes = new Set<number>();
  for (const idx of seen.values()) if (idx.length > 1) idx.forEach((i) => dupes.add(i));
  return dupes;
}

/** Make names unique by appending -2, -3 ... (used for ZIP entries as a safety net). */
export function uniquify(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const dot = n.lastIndexOf(".");
    const stem = dot > 0 ? n.slice(0, dot) : n;
    const ext = dot > 0 ? n.slice(dot) : "";
    let candidate = n;
    let i = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${stem}-${i++}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// ---------------------------------------------------------------------------
// CSV mapping

/** Small RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface CsvMappingResult {
  mapping: Map<string, string>; // original filename (lowercased) -> new name
  matched: number;
  unmatchedImages: string[]; // uploaded images with no CSV row
  unknownRows: string[]; // CSV rows naming files that are not uploaded
  duplicateRows: string[]; // original names listed more than once
  errors: string[];
}

export function buildCsvMapping(text: string, uploaded: string[]): CsvMappingResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const mapping = new Map<string, string>();
  const duplicateRows: string[] = [];
  if (!rows.length) errors.push("The CSV file is empty.");
  let start = 0;
  if (rows[0] && /original/i.test(rows[0][0] ?? "") && /new/i.test(rows[0][1] ?? "")) start = 1;
  for (let i = start; i < rows.length; i++) {
    const [orig = "", next = ""] = rows[i].map((f) => f.trim());
    if (!orig || !next) {
      errors.push(`Row ${i + 1} needs both an original name and a new name.`);
      continue;
    }
    const key = orig.toLowerCase();
    if (mapping.has(key)) duplicateRows.push(orig);
    mapping.set(key, baseName(next) === next ? next : next.replace(/\.(webp|avif|jpe?g|png|gif|bmp)$/i, ""));
  }
  const uploadedKeys = new Map(uploaded.map((n) => [n.toLowerCase(), n]));
  // Also allow matching on base name without extension ("IMG_001" matches "IMG_001.png").
  const uploadedBases = new Map(uploaded.map((n) => [baseName(n).toLowerCase(), n]));
  const resolved = new Map<string, string>();
  const unknownRows: string[] = [];
  for (const [key, value] of mapping) {
    const hit = uploadedKeys.get(key) ?? uploadedBases.get(key);
    if (hit) resolved.set(hit.toLowerCase(), value);
    else unknownRows.push(key);
  }
  const unmatchedImages = uploaded.filter((n) => !resolved.has(n.toLowerCase()));
  return { mapping: resolved, matched: resolved.size, unmatchedImages, unknownRows, duplicateRows, errors };
}
