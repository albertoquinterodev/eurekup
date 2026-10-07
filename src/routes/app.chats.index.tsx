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
import { useT } from "@/lib/i18n";

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
  username: string;
  avatar_url: string | null;
}

function ChatsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tr, lang } = useT();
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
      // 1. My memberships with last_read_at
      const { data: myMembers } = await supabase
        .from("conversation_members")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);
      if (!myMembers || myMembers.length === 0) {
        if (mounted) { setChats([]); setLoading(false); }
        return;
      }
      const convIds = myMembers.map((m) => m.conversation_id);
      const lastRead = new Map(myMembers.map((m) => [m.conversation_id, m.last_read_at]));

      // 2. Conversation rows
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, kind, channel_id, last_message_at")
        .in("id", convIds);

      // 3. Channels for channel-kind convs
      const channelIds = (convs ?? []).map((c) => c.channel_id).filter((x): x is string => !!x);
      const channelMap = new Map<string, string>();
      if (channelIds.length) {
        const { data: chans } = await supabase.from("channels").select("id, name").in("id", channelIds);
        for (const c of chans ?? []) channelMap.set(c.id, c.name);
      }

      // 4. Peers for direct convs
      const directIds = (convs ?? []).filter((c) => c.kind === "direct").map((c) => c.id);
      const peerByConv = new Map<string, { id: string; display_name: string; avatar_url: string | null }>();
      if (directIds.length) {
        const { data: peers } = await supabase
          .from("conversation_members")
          .select("conversation_id, user_id")
          .in("conversation_id", directIds)
          .neq("user_id", user.id);
        const peerIds = Array.from(new Set((peers ?? []).map((p) => p.user_id)));
        const profileById = new Map<string, { display_name: string; avatar_url: string | null }>();
        if (peerIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url:visible_avatar" as "id, display_name, avatar_url")
            .in("id", peerIds);
          for (const p of profs ?? []) profileById.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
        }
        for (const p of peers ?? []) {
          const prof = profileById.get(p.user_id);
          if (prof) peerByConv.set(p.conversation_id, { id: p.user_id, ...prof });
        }
      }

      // 5. Last message + unread count per conversation (one query)
      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("conversation_id, body, created_at, sender_id, deleted_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(500);
      const lastByConv = new Map<string, { body: string | null; created_at: string }>();
      const unreadByConv = new Map<string, number>();
      for (const m of lastMsgs ?? []) {
        if (!lastByConv.has(m.conversation_id)) {
          lastByConv.set(m.conversation_id, {
            body: m.deleted_at ? tr("Mensaje eliminado", "Message deleted") : m.body,
            created_at: m.created_at,
          });
        }
        if (m.sender_id !== user.id) {
          const lr = lastRead.get(m.conversation_id);
          if (!lr || m.created_at > lr) {
            unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
          }
        }
      }

      const items: ChatItem[] = (convs ?? []).map((c) => {
        const last = lastByConv.get(c.id);
        let displayName = tr("Conversación", "Conversation");
        let avatarUrl: string | null = null;
        if (c.kind === "channel" && c.channel_id) {
          displayName = `# ${channelMap.get(c.channel_id) ?? tr("canal", "channel")}`;
        } else {
          const peer = peerByConv.get(c.id);
          if (peer) {
            displayName = peer.display_name;
            avatarUrl = peer.avatar_url;
          }
        }
        return {
          conversation_id: c.id,
          kind: c.kind as "direct" | "channel",
          display_name: displayName,
          avatar_url: avatarUrl,
          last_body: last?.body ?? null,
          last_at: last?.created_at ?? c.last_message_at,
          is_channel: c.kind === "channel",
          unread: unreadByConv.get(c.id) ?? 0,
        };
      });
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
      .select("contact_user_id, profiles!contacts_contact_user_id_fkey(display_name, username, avatar_url:visible_avatar)" as "contact_user_id, profiles!contacts_contact_user_id_fkey(display_name, username, avatar_url)")
      .eq("owner_id", user.id);
    if (error) {
      toast.error(tr("No se pudieron cargar contactos", "Could not load contacts"));
      return;
    }
    setContacts(
      (data ?? []).map((d) => ({
        contact_user_id: d.contact_user_id,
        display_name: (d.profiles as { display_name: string }).display_name,
        username: (d.profiles as { username: string }).username,
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
        toast.error(tr("Tu sesión ha caducado. Vuelve a iniciar sesión.", "Your session has expired. Please sign in again."));
        navigate({ to: "/auth" });
        return;
      }
      const { data: convId, error } = await supabase.rpc("get_or_create_direct_conversation", { _peer: peerId });
      if (error || !convId) throw new Error(error?.message ?? tr("Error al crear chat", "Error creating chat"));
      setPicker(false);
      navigate({ to: "/app/chats/$id", params: { id: convId as string } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Error al crear chat", "Error creating chat"));
    } finally {
      setBusyContactId(null);
    }
  };

  const [search, setSearch] = useState("");
  const filtered = chats.filter((c) => {
    if (filter === "personal" && c.is_channel) return false;
    if (filter === "unread" && c.unread === 0) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !c.display_name.toLowerCase().includes(q) &&
        !(c.last_body ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });
  const totalUnread = chats.reduce((a, c) => a + c.unread, 0);

  return (
    <>
      <AppBar
        title={tr("Chats", "Chats")}
        subtitle={
          totalUnread > 0
            ? tr(`${totalUnread} sin leer · ${chats.length} conversaciones`, `${totalUnread} unread · ${chats.length} conversations`)
            : chats.length
            ? tr(`${chats.length} conversaciones`, `${chats.length} conversations`)
            : tr("Sin conversaciones", "No conversations")
        }
      />
      <div className="px-3 pt-3">
        <div className="glass flex items-center gap-2 rounded-full px-4 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Buscar en conversaciones…", "Search conversations…")}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>
      <ChipRow>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>{tr("Todos", "All")}</Chip>
        <Chip active={filter === "personal"} onClick={() => setFilter("personal")}>{tr("Personal", "Personal")}</Chip>
        <Chip active={filter === "unread"} onClick={() => setFilter("unread")}>
          {tr("No leídos", "Unread")} {totalUnread > 0 && `(${totalUnread})`}
        </Chip>
      </ChipRow>

      <div className="px-3 pb-4">
        {loading ? (
          <EmptyState icon={Loader2} title={tr("Cargando", "Loading")} description={tr("Un momento…", "One moment…")} spinning />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageCirclePlus}
            title={tr("Aún no hay conversaciones", "No conversations yet")}
            description={tr("Inicia un chat o únete a un canal.", "Start a chat or join a channel.")}
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
                      <p className={`truncate ${c.unread > 0 ? "font-semibold" : "font-medium"}`}>{c.display_name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatTime(c.last_at, lang)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`flex-1 truncate text-sm ${c.unread > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                        {c.last_body ?? tr("Aún no hay mensajes", "No messages yet")}
                      </p>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                {i < filtered.length - 1 && <div className="ml-[68px] h-px bg-glass-border" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Fab onClick={openPicker} icon={MessageCirclePlus} label={tr("Nuevo chat", "New chat")} />

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setPicker(false)} />
          <div className="glass-strong relative flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl p-5 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{tr("Nuevo chat", "New chat")}</h2>
              <button onClick={() => setPicker(false)} className="rounded-full p-1.5 hover:bg-glass" aria-label={tr("Cerrar", "Close")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tr("Elige un contacto para empezar.", "Choose a contact to get started.")}</p>
            <div className="mt-4 -mx-1 flex-1 overflow-y-auto px-1">
              {contacts.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">{tr("No tienes contactos todavía.", "You don't have any contacts yet.")}</p>
                  <button
                    onClick={() => { setPicker(false); navigate({ to: "/app/contacts" }); }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    <UserPlus className="h-4 w-4" /> {tr("Añadir contacto", "Add contact")}
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
                          <p className="truncate text-xs text-muted-foreground">@{c.username}</p>
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
