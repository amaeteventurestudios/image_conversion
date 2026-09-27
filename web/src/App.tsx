import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, onUnauthorized } from "@/lib/api";
import { LoginPage } from "@/components/LoginPage";
import { Converter } from "@/components/Converter";

export interface Me {
  username: string;
  persistent: boolean;
  expiresAt: number;
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    api<Me>("/auth/me").then(setMe, () => setMe(null));
    return onUnauthorized(() => {
      setExpired(true);
      setMe(null);
    }) as () => void;
  }, []);

  if (me === undefined)
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  if (!me)
    return (
      <LoginPage
        notice={expired ? "Your session expired. Please sign in again." : undefined}
        onLogin={(m) => {
          setExpired(false);
          setMe(m);
        }}
      />
    );
  return <Converter me={me} onLogout={() => setMe(null)} />;
}
