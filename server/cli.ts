// User management for a self-hosted install. This is also the password-reset
// mechanism: whoever can run commands on the server can reset a password.
//   npm run user -- create <username>
//   npm run user -- reset-password <username>
//   npm run user -- list
//   npm run user -- revoke-sessions <username>
import readline from "node:readline";
import { Writable } from "node:stream";
import { db, type UserRow } from "./db.ts";
import { hashPassword, validatePassword } from "./auth.ts";

const [cmd, username] = process.argv.slice(2);

async function promptHidden(q: string): Promise<string> {
  if (process.env.NEW_PASSWORD) return process.env.NEW_PASSWORD;
  let muted = false;
  const out = new Writable({ write: (chunk, enc, cb) => (!muted && process.stdout.write(chunk, enc), cb()) });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(q, (a) => {
      rl.close();
      process.stdout.write("\n");
      resolve(a);
    });
    muted = true;
  });
}

async function askPassword(): Promise<string> {
  const a = await promptHidden("New password: ");
  const problem = validatePassword(a);
  if (problem) throw new Error(problem);
  if (!process.env.NEW_PASSWORD && (await promptHidden("Repeat password: ")) !== a) throw new Error("Passwords do not match.");
  return a;
}

const findUser = (u: string) => db.prepare("SELECT * FROM users WHERE username = ?").get(u) as UserRow | undefined;

try {
  switch (cmd) {
    case "create": {
      if (!username) throw new Error("Usage: npm run user -- create <username>");
      if (findUser(username)) throw new Error(`User "${username}" already exists.`);
      const pw = await askPassword();
      db.prepare("INSERT INTO users (username, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?)").run(username, await hashPassword(pw), Date.now(), Date.now());
      console.log(`Created user "${username}".`);
      break;
    }
    case "reset-password": {
      const user = username && findUser(username);
      if (!user) throw new Error(`No user named "${username ?? ""}".`);
      const pw = await askPassword();
      db.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?").run(await hashPassword(pw), Date.now(), user.id);
      const r = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      console.log(`Password reset for "${user.username}". Signed out ${r.changes} session(s).`);
      break;
    }
    case "revoke-sessions": {
      const user = username && findUser(username);
      if (!user) throw new Error(`No user named "${username ?? ""}".`);
      const r = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      console.log(`Signed out ${r.changes} session(s).`);
      break;
    }
    case "delete": {
      const user = username && findUser(username);
      if (!user) throw new Error(`No user named "${username ?? ""}".`);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      console.log(`Deleted "${user.username}".`);
      break;
    }
    case "list": {
      const rows = db.prepare("SELECT username, created_at FROM users ORDER BY id").all() as { username: string; created_at: number }[];
      if (!rows.length) console.log("No users.");
      for (const r of rows) console.log(`${r.username}\t(created ${new Date(r.created_at).toISOString()})`);
      break;
    }
    default:
      console.log("Commands: create <username> | reset-password <username> | revoke-sessions <username> | delete <username> | list");
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
