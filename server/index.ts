import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import multer from "multer";
import { ZipArchive } from "archiver";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.ts";
import { db, type SessionRow, type UserRow } from "./db.ts";
import {
  authenticate, clearFailures, clearSessionCookie, createSession, destroySession, hashPassword, loadSession,
  loginThrottled, purgeExpiredSessions, recordFailure, requireAuth, sameOrigin, validatePassword, verifyPassword,
  type AuthedRequest,
} from "./auth.ts";
import * as store from "./store.ts";
import { convert, estimate, ImageError, inspect, thumbnail, withSlot } from "./engine.ts";
import { parseSettings, settingsKey } from "../shared/settings.ts";
import { EXTENSIONS, baseName, safeBase, uniquify } from "../shared/naming.ts";

const app = express();
app.disable("x-powered-by");
const tp = config.trustProxy;
app.set("trust proxy", tp === "true" ? true : tp === "false" ? false : /^\d+$/.test(tp) ? Number(tp) : tp);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "blob:", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
// Search-engine exclusion on every response (not a security control; auth is).
app.use((_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  next();
});
app.use(cookieParser());

app.get("/robots.txt", (_req, res) => res.type("text/plain").send("User-agent: *\nDisallow: /\n"));

const api = express.Router();
api.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
api.use(express.json({ limit: "1mb" }));
api.use(sameOrigin);

const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as AuthedRequest, res)).catch(next);

// ---------------------------------------------------------------------------
// Auth

api.post(
  "/auth/login",
  wrap(async (req, res) => {
    const { username, password, remember } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password)
      return res.status(400).json({ error: "Enter your username and password." });
    const key = `${req.ip}|${username.toLowerCase()}`;
    const wait = loginThrottled(key) || loginThrottled(`${req.ip}`);
    if (wait) return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
    const user = await authenticate(username.trim(), password);
    if (!user) {
      recordFailure(key);
      recordFailure(`${req.ip}`);
      return res.status(401).json({ error: "Incorrect username or password." });
    }
    clearFailures(key);
    destroySession(req);
    createSession(req, res, user.id, Number(remember) || 0);
    res.json({ username: user.username });
  }),
);

api.post("/auth/logout", (req, res) => {
  destroySession(req);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

api.get("/auth/me", (req, res) => {
  const s = loadSession(req);
  if (!s) return res.status(401).json({ error: "Not signed in." });
  res.json({ username: s.user.username, persistent: !!s.session.persistent, expiresAt: s.session.expires_at });
});

api.use(requireAuth);

api.post(
  "/auth/password",
  wrap(async (req, res) => {
    const { current, next } = req.body ?? {};
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as UserRow;
    if (typeof current !== "string" || !(await verifyPassword(user.password_hash, current)))
      return res.status(400).json({ error: "Your current password is incorrect." });
    const problem = validatePassword(next);
    if (problem) return res.status(400).json({ error: problem });
    db.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?").run(await hashPassword(next), Date.now(), user.id);
    // Changing the password signs out every other device.
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(user.id, req.sessionId);
    res.json({ ok: true });
  }),
);

const publicSessionId = (id: string) => id.slice(0, 16);

api.get("/auth/sessions", (req, res) => {
  const rows = db.prepare("SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC").all(req.user.id, Date.now()) as SessionRow[];
  res.json(
    rows.map((s) => ({
      id: publicSessionId(s.id),
      current: s.id === req.sessionId,
      createdAt: s.created_at,
      lastSeen: s.last_seen,
      expiresAt: s.expires_at,
      persistent: !!s.persistent,
      userAgent: s.user_agent,
      ip: s.ip,
    })),
  );
});

api.delete("/auth/sessions/:id", (req, res) => {
  const rows = db.prepare("SELECT id FROM sessions WHERE user_id = ?").all(req.user.id) as { id: string }[];
  const hit = rows.find((r) => publicSessionId(r.id) === req.params.id);
  if (!hit) return res.status(404).json({ error: "Session not found." });
  db.prepare("DELETE FROM sessions WHERE id = ?").run(hit.id);
  if (hit.id === req.sessionId) clearSessionCookie(req, res);
  res.json({ ok: true });
});

api.post("/auth/sessions/revoke-others", (req, res) => {
  const r = db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(req.user.id, req.sessionId);
  res.json({ revoked: r.changes });
});

// ---------------------------------------------------------------------------
// Files

api.get("/config", (_req, res) => {
  res.json({ maxFileBytes: config.maxFileBytes, fileTtlHours: config.fileTtlMs / 3600_000, concurrency: config.concurrency });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, store.incomingDir()),
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(12).toString("hex")),
  }),
  limits: { fileSize: config.maxFileBytes, files: 1, fields: 5 },
});

function publicFile(f: store.StoredFile) {
  return {
    id: f.id,
    originalName: f.originalName,
    size: f.size,
    format: f.info.format,
    width: f.info.width,
    height: f.info.height,
    pages: f.info.pages,
    hasAlpha: f.info.hasAlpha,
    metadata: f.info.metadata,
    createdAt: f.createdAt,
    output: f.output
      ? { size: f.output.size, width: f.output.width, height: f.output.height, format: f.output.format, settingsKey: f.output.settingsKey, name: f.output.name }
      : null,
  };
}

// One file per request so a bad or oversized file never affects the rest of the batch.
api.post("/files", (req, res, next) => {
  upload.single("file")(req, res, async (err: unknown) => {
    const user = (req as AuthedRequest).user;
    const tmp = req.file?.path;
    try {
      if (err) {
        const code = (err as { code?: string }).code;
        if (code === "LIMIT_FILE_SIZE")
          return res.status(413).json({ error: `File is too large (limit ${Math.round(config.maxFileBytes / 1048576)} MB).` });
        if (code === "ENOSPC") return res.status(507).json({ error: "The server is out of storage space." });
        return res.status(400).json({ error: "Upload failed." });
      }
      if (!req.file) return res.status(400).json({ error: "No file received." });
      // Browsers send filenames as latin1 in multipart; recover UTF-8 names.
      const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8").split(/[\\/]/).pop()!.slice(0, 255);
      let info;
      try {
        info = await withSlot("high", () => inspect(req.file!.path));
      } catch (e) {
        return res.status(415).json({ error: e instanceof ImageError ? e.message : "Unsupported or corrupted image." });
      }
      const { id, dir } = store.newFileDir();
      const sourcePath = path.join(dir, "source");
      fs.renameSync(req.file.path, sourcePath);
      const thumbPath = path.join(dir, "thumb.webp");
      await withSlot("high", () => thumbnail(sourcePath, thumbPath));
      const f: store.StoredFile = {
        id, userId: user.id, originalName, size: req.file.size, info, dir, sourcePath, thumbPath, createdAt: Date.now(),
      };
      store.put(f);
      res.json(publicFile(f));
    } catch (e) {
      next(e);
    } finally {
      if (tmp && fs.existsSync(tmp)) fs.rm(tmp, { force: true }, () => {});
    }
  });
});

api.get("/files", (req, res) => {
  res.json(store.listForUser(req.user.id).sort((a, b) => a.createdAt - b.createdAt).map(publicFile));
});

api.get("/files/:id/thumb", (req, res) => {
  const f = store.get(req.user.id, req.params.id);
  if (!f) return res.status(404).end();
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.type("image/webp").sendFile(f.thumbPath);
});

api.delete("/files/:id", (req, res) => {
  const f = store.get(req.user.id, req.params.id);
  if (f) store.remove(f);
  res.json({ ok: true });
});

api.delete("/files", (req, res) => {
  store.removeAllForUser(req.user.id);
  res.json({ ok: true });
});

// Estimate cache: identical settings on the same file are encoded only once.
const estimates = new Map<string, { size: number; width: number; height: number }>();

api.post(
  "/files/:id/estimate",
  wrap(async (req, res) => {
    const f = store.get(req.user.id, req.params.id);
    if (!f) return res.status(404).json({ error: "This image has expired or was removed. Please upload it again." });
    let settings;
    try {
      settings = parseSettings(req.body?.settings);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    const key = `${f.id}|${settingsKey(settings)}`;
    let result = estimates.get(key);
    if (!result) {
      let aborted = false;
      res.on("close", () => (aborted = !res.writableFinished));
      result = await withSlot("low", async () => (aborted ? null : estimate(f.sourcePath, f.info, settings))) ?? undefined;
      if (!result) return; // client went away
      if (estimates.size > 5000) estimates.clear();
      estimates.set(key, result);
    }
    res.json({ ...result, exact: true, settingsKey: settingsKey(settings) });
  }),
);

function outputName(f: store.StoredFile, requested: unknown, format: keyof typeof EXTENSIONS) {
  const base = (typeof requested === "string" && safeBase(requested)) || safeBase(baseName(f.originalName)) || "image";
  return `${base}.${EXTENSIONS[format]}`;
}

api.post(
  "/files/:id/convert",
  wrap(async (req, res) => {
    const f = store.get(req.user.id, req.params.id);
    if (!f) return res.status(404).json({ error: "This image has expired or was removed. Please upload it again." });
    let settings;
    try {
      settings = parseSettings(req.body?.settings);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    const name = outputName(f, req.body?.name, settings.format);
    const out = path.join(f.dir, `output.${EXTENSIONS[settings.format]}`);
    try {
      const result = await withSlot("high", () => convert(f.sourcePath, f.info, settings, out + ".tmp"));
      if (f.output && f.output.path !== out) fs.rm(f.output.path, { force: true }, () => {});
      fs.renameSync(out + ".tmp", out);
      f.output = { ...result, path: out, format: settings.format, settingsKey: settingsKey(settings), name };
      estimates.set(`${f.id}|${settingsKey(settings)}`, result);
      res.json(publicFile(f));
    } catch (e) {
      fs.rm(out + ".tmp", { force: true }, () => {});
      const code = (e as { code?: string }).code;
      if (code === "ENOSPC") return res.status(507).json({ error: "The server is out of storage space." });
      console.error("convert failed", f.id, e);
      res.status(500).json({ error: "Conversion failed for this image." });
    }
  }),
);

api.get("/files/:id/download", (req, res) => {
  const f = store.get(req.user.id, req.params.id);
  if (!f?.output) return res.status(404).type("text/plain").send("This file is no longer available. Convert it again.");
  const name = req.query.name ? outputName(f, String(req.query.name), f.output.format as keyof typeof EXTENSIONS) : f.output.name;
  res.attachment(name);
  res.sendFile(f.output.path);
});

api.post("/zip", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const resolved = items
    .map((it: { id?: unknown; name?: unknown }) => {
      const file = store.get(req.user.id, it?.id);
      return file?.output ? { file, name: outputName(file, it?.name, file.output.format as keyof typeof EXTENSIONS) } : null;
    })
    .filter(Boolean) as { file: store.StoredFile; name: string }[];
  if (!resolved.length) return res.status(400).json({ error: "No converted images to include." });
  const names = uniquify(resolved.map((r) => r.name));
  resolved.forEach((r, i) => (r.name = names[i]));
  res.json({ token: store.createZipToken(req.user.id, resolved), count: resolved.length });
});

api.get("/zip/:token", (req, res, next) => {
  const items = store.takeZipToken(req.user.id, req.params.token);
  if (!items) return res.status(404).type("text/plain").send("This download link has expired. Please try again.");
  const fname = safeBase(String(req.query.filename ?? "")) || `images-${new Date().toISOString().slice(0, 10)}`;
  res.attachment(`${fname}.zip`);
  // Images are already compressed; "store" avoids wasting CPU.
  const zip = new ZipArchive({ store: true });
  zip.on("error", next);
  zip.pipe(res);
  for (const it of items) if (it.file.output) zip.file(it.file.output.path, { name: it.name });
  zip.finalize();
});

api.use((_req, res) => res.status(404).json({ error: "Not found." }));

app.use("/api", api);

// ---------------------------------------------------------------------------
// Frontend (built SPA). The shell holds no data; every API call needs a session.

const dist = path.join(config.root, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: "Something went wrong on the server." });
});

// ---------------------------------------------------------------------------

store.initWorkDir();
setInterval(() => {
  store.sweep();
  purgeExpiredSessions();
}, config.cleanupIntervalMs).unref();

const users = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
if (!users) {
  const u = process.env.INITIAL_USERNAME;
  const p = process.env.INITIAL_PASSWORD;
  if (u && p && !validatePassword(p)) {
    db.prepare("INSERT INTO users (username, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?)").run(u, await hashPassword(p), Date.now(), Date.now());
    console.log(`Created user "${u}" from INITIAL_USERNAME/INITIAL_PASSWORD. Remove those variables now.`);
  } else {
    console.warn('No users exist yet. Create one with:  npm run user -- create <username>');
  }
}

app.listen(config.port, config.host, () => {
  console.log(`Private Image Converter listening on http://${config.host}:${config.port}`);
});
