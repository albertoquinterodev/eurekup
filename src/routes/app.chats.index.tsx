import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCirclePlus, Hash, Loader2, X, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppBar } from "@/components/app-bar";
import { Chip, ChipRow } from "@/components/chip";
import { Avatar } from "@/components/avatar-bubble";
import { Fab } from "@/components/fab";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/app/chats/")({
  component: ChatsList,
});

type Filter = "all" | "personal" | "unread";

interface ChatItem {
  conversation_id: string;
  kind: "direct" | "channel";
  display_name: string;
  avatar_url: string | null;
  last_body: string | null;
  last_at: string;
  is_channel: boolean;
  unread: number;
}

interface ContactPick {
  contact_user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

function ChatsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [contacts, setContacts] = useState<ContactPick[]>([]);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      const { data: members } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations(id, kind, channel_id, last_message_at, channels(name))")
        .eq("user_id", user.id);

      if (!members) {
        if (mounted) setLoading(false);
        return;
      }

      const items: ChatItem[] = [];
      for (const m of members) {
        const c = m.conversations as { id: string; kind: "direct" | "channel"; channel_id: string | null; last_message_at: string; channels: { name: string } | null } | null;
        if (!c) continue;

        let displayName = "Conversación";
        let avatarUrl: string | null = null;
        if (c.kind === "channel" && c.channels) {
          displayName = `# ${c.channels.name}`;
        } else if (c.kind === "direct") {
          const { data: peers } = await supabase
            .from("conversation_members")
            .select("user_id, profiles(display_name, avatar_url)")
            .eq("conversation_id", c.id)
            .neq("user_id", user.id)
            .limit(1);
          const peer = peers?.[0] as { profiles: { display_name: string; avatar_url: string | null } | null } | undefined;
          if (peer?.profiles) {
            displayName = peer.profiles.display_name;
            avatarUrl = peer.profiles.avatar_url;
          }
        }
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("body, created_at")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1);

        items.push({
          conversation_id: c.id,
          kind: c.kind,
          display_name: displayName,
          avatar_url: avatarUrl,
          last_body: lastMsg?.[0]?.body ?? null,
          last_at: lastMsg?.[0]?.created_at ?? c.last_message_at,
          is_channel: c.kind === "channel",
        });
      }
      items.sort((a, b) => b.last_at.localeCompare(a.last_at));
      if (mounted) {
        setChats(items);
        setLoading(false);
      }
    };
    load();

    const ch = supabase
      .channel("chat-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => load())
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [user]);

  const openPicker = async () => {
    if (!user) return;
    setPicker(true);
    const { data, error } = await supabase
      .from("contacts")
      .select("contact_user_id, profiles!contacts_contact_user_id_fkey(display_name, email, avatar_url)")
      .eq("owner_id", user.id);
    if (error) {
      toast.error("No se pudieron cargar contactos");
      return;
    }
    setContacts(
      (data ?? []).map((d) => ({
        contact_user_id: d.contact_user_id,
        display_name: (d.profiles as { display_name: string }).display_name,
        email: (d.profiles as { email: string }).email,
        avatar_url: (d.profiles as { avatar_url: string | null }).avatar_url,
      }))
    );
  };

  const startWith = async (peerId: string) => {
    if (!user) return;
    setBusyContactId(peerId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("Tu sesión ha caducado. Vuelve a iniciar sesión.");
        navigate({ to: "/auth" });
        return;
      }
      const { data: convId, error } = await supabase.rpc("get_or_create_direct_conversation", { _peer: peerId });
      if (error || !convId) throw new Error(error?.message ?? "Error al crear chat");
      setPicker(false);
      navigate({ to: "/app/chats/$id", params: { id: convId as string } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear chat");
    } finally {
      setBusyContactId(null);
    }
  };

  const filtered = chats.filter((c) => {
    if (filter === "personal") return !c.is_channel;
    if (filter === "unread") return false;
    return true;
  });

  return (
    <>
      <AppBar title="Chats" subtitle={chats.length ? `${chats.length} conversaciones` : "Sin conversaciones"} />
      <ChipRow>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>Todos</Chip>
        <Chip active={filter === "personal"} onClick={() => setFilter("personal")}>Personal</Chip>
        <Chip active={filter === "unread"} onClick={() => setFilter("unread")}>No leídos</Chip>
      </ChipRow>

      <div className="px-3 pb-4">
        {loading ? (
          <EmptyState icon={Loader2} title="Cargando" description="Un momento…" spinning />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageCirclePlus}
            title="Aún no hay conversaciones"
            description="Inicia un chat o únete a un canal."
          />
        ) : (
          <ul className="glass rounded-3xl overflow-hidden">
            {filtered.map((c, i) => (
              <li key={c.conversation_id}>
                <Link
                  to="/app/chats/$id"
                  params={{ id: c.conversation_id }}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-glass-strong"
                >
                  {c.is_channel ? (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-glass-strong border border-glass-border">
                      <Hash className="h-5 w-5" />
                    </div>
                  ) : (
                    <Avatar name={c.display_name} url={c.avatar_url} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-medium">{c.display_name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatTime(c.last_at)}</span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {c.last_body ?? "Aún no hay mensajes"}
                    </p>
                  </div>
                </Link>
                {i < filtered.length - 1 && <div className="ml-[68px] h-px bg-glass-border" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Fab onClick={openPicker} icon={MessageCirclePlus} label="Nuevo chat" />

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setPicker(false)} />
          <div className="glass-strong relative flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl p-5 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nuevo chat</h2>
              <button onClick={() => setPicker(false)} className="rounded-full p-1.5 hover:bg-glass" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Elige un contacto para empezar.</p>
            <div className="mt-4 -mx-1 flex-1 overflow-y-auto px-1">
              {contacts.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">No tienes contactos todavía.</p>
                  <button
                    onClick={() => { setPicker(false); navigate({ to: "/app/contacts" }); }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    <UserPlus className="h-4 w-4" /> Añadir contacto
                  </button>
                </div>
              ) : (
                <ul className="space-y-1">
                  {contacts.map((c) => (
                    <li key={c.contact_user_id}>
                      <button
                        onClick={() => startWith(c.contact_user_id)}
                        disabled={!!busyContactId}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-glass disabled:opacity-50"
                      >
                        <Avatar name={c.display_name} url={c.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.display_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                        </div>
                        {busyContactId === c.contact_user_id && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  spinning,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  spinning?: boolean;
}) {
  return (
    <div className="glass mt-2 flex flex-col items-center justify-center gap-3 rounded-3xl px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-glass-strong">
        <Icon className={`h-5 w-5 ${spinning ? "animate-spin" : ""}`} />
      </div>
      <p className="text-base font-medium">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
