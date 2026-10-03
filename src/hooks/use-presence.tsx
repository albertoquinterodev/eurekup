import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const PresenceCtx = createContext<Set<string>>(new Set());

/** Real-time presence: every signed-in tab joins one shared channel. */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setOnline(new Set());
      return;
    }
    const touch = () =>
      supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
    const ch = supabase.channel("presence:global", { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      setOnline(new Set(Object.keys(ch.presenceState())));
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ at: Date.now() });
        touch();
      }
    });
    const hb = window.setInterval(touch, 60_000);
    const onHide = () => touch();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(hb);
      window.removeEventListener("pagehide", onHide);
      touch();
      supabase.removeChannel(ch);
    };
  }, [user]);

  return <PresenceCtx.Provider value={online}>{children}</PresenceCtx.Provider>;
}

export function useIsOnline(userId: string | null | undefined) {
  const set = useContext(PresenceCtx);
  return !!userId && set.has(userId);
}

export function useOnlineSet() {
  return useContext(PresenceCtx);
}
