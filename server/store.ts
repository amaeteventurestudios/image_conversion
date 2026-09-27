// Temporary, per-user file registry. Everything here is disposable: the work
// directory is wiped on startup and files expire after FILE_TTL_HOURS.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.ts";
import type { SourceInfo, EncodeResult } from "./engine.ts";

export interface StoredFile {
  id: string;
  userId: number;
  originalName: string;
  size: number;
  info: SourceInfo;
  dir: string;
  sourcePath: string;
  thumbPath: string;
  createdAt: number;
  output?: EncodeResult & { path: string; format: string; settingsKey: string; name: string };
}

const files = new Map<string, StoredFile>();

export function initWorkDir() {
  fs.rmSync(config.workDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(config.workDir, "incoming"), { recursive: true, mode: 0o700 });
}

export const incomingDir = () => path.join(config.workDir, "incoming");

export function newFileDir(): { id: string; dir: string } {
  const id = crypto.randomBytes(12).toString("base64url");
  const dir = path.join(config.workDir, id);
  fs.mkdirSync(dir, { mode: 0o700 });
  return { id, dir };
}

export function put(f: StoredFile) {
  files.set(f.id, f);
}

/** Only ever returns files owned by the requesting user. */
export function get(userId: number, id: unknown): StoredFile | undefined {
  if (typeof id !== "string") return undefined;
  const f = files.get(id);
  return f && f.userId === userId ? f : undefined;
}

export function listForUser(userId: number): StoredFile[] {
  return [...files.values()].filter((f) => f.userId === userId);
}

export function remove(f: StoredFile) {
  files.delete(f.id);
  fs.rm(f.dir, { recursive: true, force: true }, () => {});
}

export function removeAllForUser(userId: number) {
  for (const f of listForUser(userId)) remove(f);
}

/** Deletes expired files plus any orphaned directories/partial uploads. */
export function sweep() {
  const cutoff = Date.now() - config.fileTtlMs;
  for (const f of files.values()) if (f.createdAt < cutoff) remove(f);
  for (const dir of [config.workDir, incomingDir()]) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (dir === config.workDir && (name === "incoming" || files.has(name))) continue;
      const p = path.join(dir, name);
      try {
        const st = fs.statSync(p);
        // Give in-flight uploads an hour before treating them as orphans.
        if (st.mtimeMs < Math.min(cutoff, Date.now() - 3600_000)) fs.rmSync(p, { recursive: true, force: true });
      } catch {
        /* already gone */
      }
    }
  }
}

// Short-lived tokens for ZIP downloads so the browser can stream them via a plain GET.
const zipTokens = new Map<string, { userId: number; items: { file: StoredFile; name: string }[]; expires: number }>();
export function createZipToken(userId: number, items: { file: StoredFile; name: string }[]) {
  const token = crypto.randomBytes(18).toString("base64url");
  zipTokens.set(token, { userId, items, expires: Date.now() + 5 * 60_000 });
  for (const [k, v] of zipTokens) if (v.expires < Date.now()) zipTokens.delete(k);
  return token;
}
export function takeZipToken(userId: number, token: string) {
  const t = zipTokens.get(token);
  if (!t || t.userId !== userId || t.expires < Date.now()) return undefined;
  zipTokens.delete(token);
  return t.items;
}
