import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCirclePlus, Hash, Loader2 } from "lucide-react";
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
}

function ChatsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  const startNewChat = async () => {
    setCreating(true);
    try {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("contact_user_id, profiles!contacts_contact_user_id_fkey(display_name)")
        .eq("owner_id", user!.id)
        .limit(20);

      if (!contacts || contacts.length === 0) {
        toast.message("Añade contactos primero", { description: "Ve a Contactos para empezar a chatear." });
        navigate({ to: "/app/contacts" });
        return;
      }
      // Ask via simple prompt for v1
      const peerId = contacts[0].contact_user_id;
      // Find existing direct conv
      const { data: mine } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(kind)")
        .eq("user_id", user!.id);
      const myConvIds = (mine ?? []).filter((m) => (m.conversations as { kind: string }).kind === "direct").map((m) => m.conversation_id);
      let existing: string | null = null;
      if (myConvIds.length) {
        const { data: peerMembers } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", peerId)
          .in("conversation_id", myConvIds);
        existing = peerMembers?.[0]?.conversation_id ?? null;
      }
      let convId = existing;
      if (!convId) {
        const { data: conv, error } = await supabase
          .from("conversations")
          .insert({ kind: "direct" })
          .select("id")
          .single();
        if (error) throw error;
        convId = conv.id;
        const { error: mErr } = await supabase
          .from("conversation_members")
          .insert([
            { conversation_id: convId, user_id: user!.id },
            { conversation_id: convId, user_id: peerId },
          ]);
        if (mErr) throw mErr;
      }
      navigate({ to: "/app/chats/$id", params: { id: convId! } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear chat");
    } finally {
      setCreating(false);
    }
  };

  const filtered = chats.filter((c) => {
    if (filter === "personal") return !c.is_channel;
    if (filter === "unread") return false; // future: unread tracking
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

      <Fab onClick={startNewChat} icon={creating ? Loader2 : MessageCirclePlus} label="Nuevo chat" />
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
