import { useState } from "react";
import { ChevronDown, KeyRound, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Logo } from "@/components/Logo";
import { ChangePasswordDialog, SessionsDialog } from "@/components/AccountDialogs";
import type { Me } from "@/App";

export function Header({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { theme, toggle } = useTheme();
  const [dialog, setDialog] = useState<"password" | "sessions" | null>(null);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-8">
        <Logo />
        <span className="text-xl font-semibold tracking-tight">Images</span>
        <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">BETA</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Moon /> : <Sun />}
        </Button>
        <DropdownMenu>
          <DropdownTrigger asChild>
            <button className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none">
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-500/70 text-sm font-semibold text-white">
                {me.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-sm font-medium sm:inline">{me.username}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>Signed in as {me.username}</DropdownLabel>
            <DropdownSeparator />
            <DropdownItem onSelect={() => setDialog("password")}>
              <KeyRound /> Change password
            </DropdownItem>
            <DropdownItem onSelect={() => setDialog("sessions")}>
              <Monitor /> Signed-in devices
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={logout}>
              <LogOut /> Log out
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
      <ChangePasswordDialog open={dialog === "password"} onOpenChange={(o) => setDialog(o ? "password" : null)} />
      <SessionsDialog open={dialog === "sessions"} onOpenChange={(o) => setDialog(o ? "sessions" : null)} onSignedOut={onLogout} />
    </header>
  );
}
