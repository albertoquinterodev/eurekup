import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send, Check, CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/avatar-bubble";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/app/chats/$id")({
  component: ChatRoom,
});

interface Message {
  id: string;
  body: string | null;
  sender_id: string;
  status: "sent" | "delivered" | "read";
  created_at: string;
}

function ChatRoom() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Conversación");
  const [subtitle, setSubtitle] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const loadHeader = async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("kind, channels(name, description)")
        .eq("id", id)
        .single();
      if (!conv) return;
      if (conv.kind === "channel" && conv.channels) {
        const ch = conv.channels as { name: string; description: string | null };
        setTitle(`# ${ch.name}`);
        setSubtitle(ch.description ?? "");
      } else {
        const { data: peers } = await supabase
          .from("conversation_members")
          .select("user_id, profiles(display_name, avatar_url)")
          .eq("conversation_id", id)
          .neq("user_id", user.id)
          .limit(1);
        const p = peers?.[0] as { profiles: { display_name: string; avatar_url: string | null } | null } | undefined;
        if (p?.profiles) {
          setTitle(p.profiles.display_name);
          setAvatar(p.profiles.avatar_url);
          setSubtitle("En línea");
        }
      }
    };

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, status, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (error) {
        toast.error("No se pudieron cargar los mensajes");
        return;
      }
      if (mounted) {
        setMessages(data ?? []);
        setLoading(false);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        });
      }
    };

    loadHeader();
    loadMessages();

    const ch = supabase
      .channel(`chat-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [id, user]);

  const send = async () => {
    if (!text.trim() || !user) return;
    setSending(true);
    const body = text.trim();
    setText("");
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: id, sender_id: user.id, body, status: "delivered" })
        .select("id, body, sender_id, status, created_at")
        .single();
      if (error) throw error;
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar");
      setText(body); // restore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 safe-top">
        <div className="glass mx-3 mt-3 flex items-center gap-3 rounded-3xl px-3 py-2.5">
          <Link
            to="/app/chats"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-glass-strong"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Avatar name={title} url={avatar} online />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="glass mx-auto max-w-sm rounded-3xl px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no hay mensajes. Escribe el primero ✨
            </p>
          </div>
        ) : (
          <ul className="mx-auto flex max-w-2xl flex-col gap-2">
            {messages.map((m, i) => {
              const mine = m.sender_id === user?.id;
              const prev = messages[i - 1];
              const grouped = prev && prev.sender_id === m.sender_id;
              return (
                <li
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "" : "mt-2"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm break-words ${
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "glass text-foreground rounded-bl-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <div
                      className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                        mine ? "text-primary-foreground/60" : "text-muted-foreground"
                      }`}
                    >
                      <span>{formatTime(m.created_at)}</span>
                      {mine &&
                        (m.status === "read" ? (
                          <CheckCheck className="h-3 w-3" />
                        ) : m.status === "delivered" ? (
                          <CheckCheck className="h-3 w-3 opacity-60" />
                        ) : (
                          <Check className="h-3 w-3 opacity-60" />
                        ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 z-30 safe-bottom px-3 pb-3 pt-2">
        <div className="glass-strong mx-auto flex max-w-2xl items-end gap-2 rounded-3xl p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribe un mensaje…"
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
            aria-label="Enviar"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
