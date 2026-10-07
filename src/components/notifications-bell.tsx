import { useEffect, useRef, useState } from "react";
import { playMessageBeep } from "@/lib/sound";
// no router import — link is a dynamic string, navigate via window.location
import { Bell, Check, Trash2, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatTime } from "@/lib/format";
import { useT } from "@/lib/i18n";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const { tr, lang } = useT();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      setItems((data ?? []) as Notification[]);
    };
    load();

    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === "INSERT" && (payload.new as { kind?: string }).kind === "message") {
            playMessageBeep();
          }
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const markRead = async (n: Notification) => {
    if (n.read_at) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-glass-strong hover:text-foreground"
        aria-label={tr("Notificaciones", "Notifications")}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-12 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl animate-slide-up">
          <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
            <p className="text-sm font-semibold">{tr("Notificaciones", "Notifications")}</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-glass hover:text-foreground"
              >
                <Check className="h-3.5 w-3.5" /> {tr("Marcar todas", "Mark all")}
              </button>
            )}
          </div>
          <div className="max-h-[60dvh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{tr("Sin notificaciones", "No notifications")}</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const handleClick = () => {
                    markRead(n);
                    if (n.link) {
                      setOpen(false);
                      window.location.assign(n.link);
                    }
                  };
                  return (
                    <li key={n.id} className="border-b border-glass-border last:border-0">
                      <div className="group relative">
                        <button onClick={handleClick} className="block w-full text-left">
                          <div className={`flex gap-3 px-4 py-3 transition hover:bg-glass ${!n.read_at ? "bg-primary/5" : ""}`}>
                            {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                              {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                              <p className="mt-1 text-[10px] text-muted-foreground">{formatTime(n.created_at, lang)}</p>
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                          className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                          aria-label={tr("Eliminar", "Delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
