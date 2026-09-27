import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, type SessionRow, type UserRow } from "./db.ts";
import { config } from "./config.ts";

export const COOKIE = "pic_session";
const MIN_PASSWORD = 10;

// Argon2id with library defaults (m=19 MiB, t=2, p=1 per OWASP guidance).
export const hashPassword = (pw: string) => hash(pw);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 256) return "Password is too long.";
  return null;
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// A dummy hash so failed lookups take the same time as a real verification.
let dummyHash: string | undefined;
async function timingSafeMiss() {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString("hex"));
  await verifyPassword(dummyHash, "not-the-password");
}

export async function authenticate(username: string, password: string): Promise<UserRow | null> {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  if (!user) {
    await timingSafeMiss();
    return null;
  }
  return (await verifyPassword(user.password_hash, password)) ? user : null;
}

export function createSession(req: Request, res: Response, userId: number, rememberDays: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const persistent = config.rememberDays.includes(rememberDays);
  const expires = now + (persistent ? rememberDays * 86400_000 : config.shortSessionMs);
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, persistent, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), userId, now, now, expires, persistent ? 1 : 0, (req.get("user-agent") ?? "").slice(0, 300), req.ip ?? null);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(req),
    path: "/",
    // No maxAge = browser-session cookie; the server-side expiry still applies.
    ...(persistent ? { expires: new Date(expires) } : {}),
  });
}

function cookieSecure(req: Request) {
  if (config.cookieSecure === "true") return true;
  if (config.cookieSecure === "false") return false;
  return req.secure;
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "strict", secure: cookieSecure(req), path: "/" });
}

export function destroySession(req: Request) {
  const token = req.cookies?.[COOKIE];
  if (typeof token === "string") db.prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth; only read on routes mounted after it. */
      user: { id: number; username: string };
      sessionId: string;
    }
  }
}
export type AuthedRequest = Request;

export function loadSession(req: Request): { user: UserRow; session: SessionRow } | null {
  const token = req.cookies?.[COOKIE];
  if (typeof token !== "string" || token.length > 100) return null;
  const id = sha256(token);
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  if (!session) return null;
  const now = Date.now();
  if (session.expires_at < now) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as UserRow | undefined;
  if (!user) return null;
  if (now - session.last_seen > 60_000) db.prepare("UPDATE sessions SET last_seen = ? WHERE id = ?").run(now, id);
  return { user, session };
}

/** Guards every /api route except login. Returns 401 JSON, never the app. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const s = loadSession(req);
  if (!s) {
    clearSessionCookie(req, res);
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
  (req as AuthedRequest).user = { id: s.user.id, username: s.user.username };
  (req as AuthedRequest).sessionId = s.session.id;
  next();
}

/**
 * CSRF defence in depth on top of SameSite=Strict cookies: state-changing
 * requests must come from our own origin.
 */
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") ?? req.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return res.status(403).json({ error: "Cross-origin request blocked." });
    } catch {
      return res.status(403).json({ error: "Cross-origin request blocked." });
    }
  } else if (req.get("sec-fetch-site") && req.get("sec-fetch-site") !== "same-origin") {
    return res.status(403).json({ error: "Cross-origin request blocked." });
  }
  next();
}

// ---------------------------------------------------------------------------
// Login throttling (in memory; fine for a single-instance internal tool).

const attempts = new Map<string, { count: number; first: number }>();
const WINDOW = 15 * 60_000;
const MAX_ATTEMPTS = 8;

export function loginThrottled(key: string): number {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW) return 0;
  return a.count >= MAX_ATTEMPTS ? Math.ceil((a.first + WINDOW - Date.now()) / 1000) : 0;
}
export function recordFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
}
export const clearFailures = (key: string) => attempts.delete(key);

export function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  for (const [k, a] of attempts) if (Date.now() - a.first > WINDOW) attempts.delete(k);
}
