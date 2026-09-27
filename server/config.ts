import path from "node:path";
import os from "node:os";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, "data"));

export const config = {
  root,
  host: process.env.HOST ?? "127.0.0.1",
  port: num(process.env.PORT, 3000),
  production: process.env.NODE_ENV === "production",
  dataDir,
  dbPath: path.join(dataDir, "app.db"),
  // Temporary uploads/outputs live outside any public directory.
  workDir: path.resolve(process.env.WORK_DIR ?? path.join(dataDir, "work")),
  // Files older than this are deleted automatically.
  fileTtlMs: num(process.env.FILE_TTL_HOURS, 6) * 3600_000,
  cleanupIntervalMs: 10 * 60_000,
  maxFileBytes: num(process.env.MAX_FILE_MB, 60) * 1024 * 1024,
  maxFilesPerUpload: num(process.env.MAX_FILES_PER_UPLOAD, 200),
  maxInputPixels: num(process.env.MAX_INPUT_MEGAPIXELS, 268) * 1_000_000,
  // Sessions without "remember me" expire after this idle-independent lifetime.
  shortSessionMs: num(process.env.SESSION_HOURS, 12) * 3600_000,
  rememberDays: [30, 60, 90],
  // "auto" = Secure cookie when the request arrived over HTTPS (honours X-Forwarded-Proto with TRUST_PROXY).
  cookieSecure: (process.env.COOKIE_SECURE ?? "auto") as "auto" | "true" | "false",
  trustProxy: process.env.TRUST_PROXY ?? "loopback",
  concurrency: Math.max(1, num(process.env.CONCURRENCY, Math.max(1, Math.min(4, os.cpus().length)))),
};
