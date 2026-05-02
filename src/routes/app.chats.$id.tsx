import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Check,
  CheckCheck,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  Share2,
  X,
  FileText,
  Image as ImageIcon,
  Film,
  File as FileIcon,
  MoreVertical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/avatar-bubble";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/app/chats/$id")({
  component: ChatRoom,
});

interface FileMeta {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
}

interface Message {
  id: string;
  body: string | null;
  sender_id: string;
  status: "sent" | "delivered" | "read";
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  file_id: string | null;
  file?: FileMeta | null;
}

function fileIconFor(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Film;
  if (mime.includes("pdf") || mime.startsWith("text/")) return FileText;
  return FileIcon;
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
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate file metadata for messages that include file_id.
  const hydrateFiles = async (rows: Message[]): Promise<Message[]> => {
    const ids = Array.from(new Set(rows.map((r) => r.file_id).filter((x): x is string => !!x)));
    if (!ids.length) return rows;
    const { data: files } = await supabase
      .from("files")
      .select("id, name, storage_path, mime_type, size_bytes")
      .in("id", ids);
    const map = new Map((files ?? []).map((f) => [f.id, f as FileMeta]));
    return rows.map((r) => ({ ...r, file: r.file_id ? map.get(r.file_id) ?? null : null }));
  };

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
        .select("id, body, sender_id, status, created_at, edited_at, deleted_at, file_id")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (error) {
        toast.error("No se pudieron cargar los mensajes");
        return;
      }
      const hydrated = await hydrateFiles((data ?? []) as Message[]);
      if (mounted) {
        setMessages(hydrated);
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
        async (payload) => {
          const m = payload.new as Message;
          const [hydrated] = await hydrateFiles([m]);
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, hydrated]));
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, body: m.body, edited_at: m.edited_at, deleted_at: m.deleted_at, status: m.status } : x))
          );
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
    if (editing) {
      // Save edit
      const newBody = text.trim();
      setSending(true);
      try {
        const { error } = await supabase
          .from("messages")
          .update({ body: newBody, edited_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
        setMessages((prev) =>
          prev.map((m) => (m.id === editing.id ? { ...m, body: newBody, edited_at: new Date().toISOString() } : m))
        );
        setEditing(null);
        setText("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo editar");
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    const body = text.trim();
    setText("");
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: id, sender_id: user.id, body, status: "delivered" })
        .select("id, body, sender_id, status, created_at, edited_at, deleted_at, file_id")
        .single();
      if (error) throw error;
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, { ...(data as Message), file: null }]
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar");
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const onPickAttachment = () => fileInputRef.current?.click();

  const sendAttachment = async (file: File) => {
    if (!user) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Máximo 25 MB por archivo");
      return;
    }
    setUploading(true);
    try {
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("files").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) throw upErr;
      const { data: fileRow, error: dbErr } = await supabase
        .from("files")
        .insert({
          owner_id: user.id,
          folder_id: null,
          name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        .select("id, name, storage_path, mime_type, size_bytes")
        .single();
      if (dbErr) throw dbErr;
      const { data: msg, error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: id,
          sender_id: user.id,
          body: null,
          file_id: fileRow.id,
          status: "delivered",
        })
        .select("id, body, sender_id, status, created_at, edited_at, deleted_at, file_id")
        .single();
      if (msgErr) throw msgErr;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev
          : [...prev, { ...(msg as Message), file: fileRow as FileMeta }]
      );
      toast.success("Archivo enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo adjuntar");
    } finally {
      setUploading(false);
    }
  };

  const deleteMessage = async (m: Message) => {
    setOpenMenuFor(null);
    const { error } = await supabase
      .from("messages")
      .update({ body: null, deleted_at: new Date().toISOString() })
      .eq("id", m.id);
    if (error) {
      toast.error("No se pudo eliminar");
      return;
    }
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, body: null, deleted_at: new Date().toISOString() } : x))
    );
  };

  const shareMessage = async (m: Message) => {
    setOpenMenuFor(null);
    let textToShare = m.body ?? "";
    if (m.file) textToShare = `${m.file.name}`;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Eurekup", text: textToShare, url });
        return;
      } catch {
        // fallthrough to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${textToShare}\n${url}`);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo compartir");
    }
  };

  const startEdit = (m: Message) => {
    setOpenMenuFor(null);
    setEditing({ id: m.id, body: m.body ?? "" });
    setText(m.body ?? "");
  };

  const cancelEdit = () => {
    setEditing(null);
    setText("");
  };

  const openFile = async (file: FileMeta) => {
    const { data, error } = await supabase.storage.from("files").createSignedUrl(file.storage_path, 60);
    if (error || !data) {
      toast.error("No se pudo abrir");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="shrink-0 safe-top">
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

      {/* Messages — independent scroll */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
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
              const isDeleted = !!m.deleted_at;
              const Icon = m.file ? fileIconFor(m.file.mime_type) : null;
              return (
                <li
                  key={m.id}
                  className={`group flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "" : "mt-2"}`}
                >
                  <div className={`relative max-w-[78%] ${mine ? "" : ""}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm break-words ${
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "glass text-foreground rounded-bl-md"
                      } ${isDeleted ? "italic opacity-70" : ""}`}
                    >
                      {isDeleted ? (
                        <p>Mensaje eliminado</p>
                      ) : m.file ? (
                        <button
                          onClick={() => openFile(m.file!)}
                          className="flex items-center gap-3 text-left"
                        >
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                              mine ? "bg-primary-foreground/15" : "bg-glass-strong"
                            }`}
                          >
                            {Icon && <Icon className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{m.file.name}</p>
                            <p className={`text-xs ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {(m.file.size_bytes / 1024).toFixed(0)} KB
                            </p>
                          </div>
                        </button>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      )}
                      <div
                        className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                          mine ? "text-primary-foreground/60" : "text-muted-foreground"
                        }`}
                      >
                        {!isDeleted && m.edited_at && <span className="italic">(editado)</span>}
                        <span>{formatTime(m.created_at)}</span>
                        {mine &&
                          !isDeleted &&
                          (m.status === "read" ? (
                            <CheckCheck className="h-3 w-3" />
                          ) : m.status === "delivered" ? (
                            <CheckCheck className="h-3 w-3 opacity-60" />
                          ) : (
                            <Check className="h-3 w-3 opacity-60" />
                          ))}
                      </div>
                    </div>

                    {/* Action button — visible on hover (desktop) and always on touch via menu toggle */}
                    {!isDeleted && (
                      <button
                        onClick={() => setOpenMenuFor(openMenuFor === m.id ? null : m.id)}
                        className={`absolute -top-2 ${mine ? "-left-2" : "-right-2"} hidden h-7 w-7 items-center justify-center rounded-full bg-glass-strong text-foreground shadow-soft hover:bg-glass group-hover:flex`}
                        aria-label="Acciones"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Action menu */}
                    {openMenuFor === m.id && !isDeleted && (
                      <div
                        className={`absolute z-20 mt-1 min-w-44 overflow-hidden rounded-2xl glass-strong p-1 text-sm shadow-elevated animate-slide-up ${
                          mine ? "right-0" : "left-0"
                        } top-full`}
                      >
                        {mine && m.body !== null && !m.file && (
                          <button
                            onClick={() => startEdit(m)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                          >
                            <Pencil className="h-4 w-4" /> Editar
                          </button>
                        )}
                        <button
                          onClick={() => shareMessage(m)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                        >
                          <Share2 className="h-4 w-4" /> Compartir
                        </button>
                        {mine && (
                          <button
                            onClick={() => deleteMessage(m)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" /> Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 safe-bottom px-3 pb-3 pt-2">
        {editing && (
          <div className="glass mx-auto mb-2 flex max-w-2xl items-center gap-2 rounded-2xl px-3 py-2 text-xs">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">Editando mensaje</span>
            <button onClick={cancelEdit} className="rounded-full p-1 hover:bg-glass-strong">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="glass-strong mx-auto flex max-w-2xl items-end gap-2 rounded-3xl p-2">
          <button
            onClick={onPickAttachment}
            disabled={uploading || !!editing}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/80 transition hover:bg-glass active:scale-95 disabled:opacity-40"
            aria-label="Adjuntar archivo"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) sendAttachment(f);
              e.target.value = "";
            }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={editing ? "Edita tu mensaje…" : "Escribe un mensaje…"}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
            aria-label={editing ? "Guardar" : "Enviar"}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
