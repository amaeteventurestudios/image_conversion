import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1024) return `${n} B`;
  if (abs < 1024 * 1024) return `${(n / 1024).toFixed(abs < 10 * 1024 ? 1 : 0)} KB`;
  if (abs < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const pct = (saved: number, total: number) => (total > 0 ? (saved / total) * 100 : 0);

export const FORMAT_LABEL: Record<string, string> = {
  webp: "WebP", avif: "AVIF", jpeg: "JPG", png: "PNG", gif: "GIF", bmp: "BMP", tiff: "TIFF", heif: "HEIF",
};
