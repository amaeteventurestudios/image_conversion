import Database from "better-sqlite3";
import fs from "node:fs";
import { config } from "./config.ts";

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,           -- SHA-256 of the cookie token; raw token is never stored
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  persistent  INTEGER NOT NULL,
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`);

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
  password_changed_at: number;
}

export interface SessionRow {
  id: string;
  user_id: number;
  created_at: number;
  last_seen: number;
  expires_at: number;
  persistent: number;
  user_agent: string | null;
  ip: string | null;
}
