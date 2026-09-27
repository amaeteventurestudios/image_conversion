import { useState } from "react";
import { Eye, EyeOff, Loader2, Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Logo } from "@/components/Logo";
import type { Me } from "@/App";

const REMEMBER = [
  { value: 0, label: "This browser session only" },
  { value: 30, label: "Trust this device for 30 days" },
  { value: 60, label: "Trust this device for 60 days" },
  { value: 90, label: "Trust this device for 90 days" },
];

export function LoginPage({ onLogin, notice }: { onLogin: (m: Me) => void; notice?: string }) {
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", json: { username, password, remember } });
      onLogin(await api<Me>("/auth/me"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Button variant="ghost" size="icon" className="fixed top-4 right-4" onClick={toggle} aria-label="Toggle theme">
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
      <div className="mb-8 flex items-center gap-3">
        <Logo className="size-10" />
        <span className="text-2xl font-semibold">Amaete Image Optimizer</span>
      </div>
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">This is a private tool. Authorised users only.</p>
        {notice && !error && <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{notice}</p>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username or email</Label>
            <Input id="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button type="button" onClick={() => setForgot(true)} className="cursor-pointer text-xs text-primary hover:underline">
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remember">Stay signed in</Label>
            <select
              id="remember"
              value={remember}
              onChange={(e) => setRemember(Number(e.target.value))}
              className="h-10 w-full cursor-pointer rounded-lg border border-border bg-input px-3 text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
            >
              {REMEMBER.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !username || !password}>
            {busy && <Loader2 className="animate-spin" />} Sign in
          </Button>
        </form>
      </Card>
      <Dialog
        open={forgot}
        onOpenChange={setForgot}
        title="Reset your password"
        description="For security, passwords can only be reset by someone with access to the server."
        footer={<Button onClick={() => setForgot(false)}>Close</Button>}
      >
        <p className="text-sm text-muted-foreground">On the machine running Amaete Image Optimizer, open a terminal in the app folder and run:</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">npm run user -- reset-password &lt;username&gt;</pre>
        <p className="mt-3 text-sm text-muted-foreground">This sets a new password and signs out every device.</p>
      </Dialog>
    </div>
  );
}
