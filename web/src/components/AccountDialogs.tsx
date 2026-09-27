import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent(""); setNext(""); setConfirm(""); setError(null); setDone(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password", { method: "POST", json: { current, next } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Change password" description="Changing your password signs out all other devices.">
      {done ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">Password updated. Other devices have been signed out.</p>
          <div className="flex justify-end"><Button onClick={() => onOpenChange(false)}>Close</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input type="text" autoComplete="username" hidden readOnly />
          <div className="space-y-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="text-xs text-muted-foreground">At least 10 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conf">Confirm new password</Label>
            <Input id="conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy || !current || !next}>
              {busy && <Loader2 className="animate-spin" />} Update password
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

interface SessionInfo {
  id: string;
  current: boolean;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  persistent: boolean;
  userAgent: string | null;
  ip: string | null;
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SessionsDialog({ open, onOpenChange, onSignedOut }: { open: boolean; onOpenChange: (o: boolean) => void; onSignedOut: () => void }) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const load = () => api<SessionInfo[]>("/auth/sessions").then(setSessions, () => setSessions([]));
  useEffect(() => {
    if (open) load();
  }, [open]);

  async function revoke(s: SessionInfo) {
    await api(`/auth/sessions/${s.id}`, { method: "DELETE" });
    if (s.current) onSignedOut();
    else load();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Signed-in devices"
      description="Trusted devices stay signed in until their session expires or you sign them out."
      className="max-w-xl"
      footer={
        <>
          <Button onClick={async () => { await api("/auth/sessions/revoke-others", { method: "POST" }); load(); }} disabled={!sessions || sessions.length < 2}>
            Sign out all other devices
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </>
      }
    >
      {!sessions ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {describeAgent(s.userAgent)}
                  {s.current && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">This device</span>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {s.ip ?? "unknown IP"} · last active {fmtDate(s.lastSeen)} · {s.persistent ? `trusted until ${fmtDate(s.expiresAt)}` : "session only"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => revoke(s)}>Sign out</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
