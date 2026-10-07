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
  Copy,
  Forward,
  FolderInput,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/avatar-bubble";
import { formatTime } from "@/lib/format";
import { useIsOnline } from "@/hooks/use-presence";
import { useT } from "@/lib/i18n";
import { isFutureSchedule } from "@/lib/password";
import { CalendarClock } from "lucide-react";

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
  scheduled_at?: string | null;
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
  const { t, lang } = useT();
  const [peerId, setPeerId] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const peerOnline = useIsOnline(peerId);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const sendLp = useRef<number | null>(null);
  const [tick, setTick] = useState(0);
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
        .select("kind, channel_id")
        .eq("id", id)
        .single();
      if (!conv) return;
      if (conv.kind === "channel" && conv.channel_id) {
        const { data: ch } = await supabase
          .from("channels")
          .select("name, description")
          .eq("id", conv.channel_id)
          .single();
        if (ch) {
          setTitle(`# ${ch.name}`);
          setSubtitle(ch.description ?? "");
        }
      } else {
        const { data: peers } = await supabase
          .from("conversation_members")
          .select("user_id")
          .eq("conversation_id", id)
          .neq("user_id", user.id)
          .limit(1);
        const peerId = peers?.[0]?.user_id;
        if (peerId) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("display_name, avatar_url:visible_avatar, last_seen_at" as "display_name, avatar_url, last_seen_at")
            .eq("id", peerId)
            .single();
          if (prof) {
            setTitle(prof.display_name);
            setAvatar(prof.avatar_url);
            setPeerId(peerId);
            setLastSeen(prof.last_seen_at);
          }
        }
      }
    };

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, status, created_at, edited_at, deleted_at, file_id, scheduled_at")
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

    // Mark conversation as read for this user.
    const markRead = async () => {
      await supabase
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", id)
        .eq("user_id", user.id);
    };
    markRead();

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

  // Signed thumbnails for image attachments.
  useEffect(() => {
    const missing = messages.filter((m) => m.file?.mime_type?.startsWith("image/") && !thumbs[m.file.id]);
    if (!missing.length) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (m) => {
          const { data } = await supabase.storage
            .from("files")
            .createSignedUrl(m.file!.storage_path, 3600, { transform: { width: 480, quality: 70 } });
          return [m.file!.id, data?.signedUrl ?? ""] as const;
        })
      );
      setThumbs((p) => ({ ...p, ...Object.fromEntries(entries.filter(([, u]) => u)) }));
    })();
  }, [messages, thumbs]);

  // Periodically reveal scheduled messages that became due.
  useEffect(() => {
    const iv = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!tick || !user) return;
    supabase
      .from("messages")
      .select("id, body, sender_id, status, created_at, edited_at, deleted_at, file_id, scheduled_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .then(async ({ data }) => {
        if (!data) return;
        const known = new Set(messages.map((m) => m.id));
        const fresh = (data as Message[]).filter((m) => !known.has(m.id));
        if (fresh.length) {
          const h = await hydrateFiles(fresh);
          setMessages((p) => [...p, ...h].sort((a, b) => a.created_at.localeCompare(b.created_at)));
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const send = async (scheduledAt?: Date) => {
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
        .insert({
          conversation_id: id,
          sender_id: user.id,
          body,
          status: "delivered",
          scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
        })
        .select("id, body, sender_id, status, created_at, edited_at, deleted_at, file_id, scheduled_at")
        .single();
      if (error) throw error;
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, { ...(data as Message), file: null }]
      );
      if (scheduledAt) toast.success(t("chat.scheduledOk"));
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
        .select("id, body, sender_id, status, created_at, edited_at, deleted_at, file_id, scheduled_at")
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
    if (file.mime_type?.startsWith("image/")) setLightbox(data.signedUrl);
    else window.open(data.signedUrl, "_blank", "noopener");
  };

  const downloadFile = async (file: FileMeta) => {
    setOpenMenuFor(null);
    const { data, error } = await supabase.storage.from("files").createSignedUrl(file.storage_path, 60);
    if (error || !data) {
      toast.error("No se pudo descargar");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Descarga iniciada");
  };

  const saveToEurekup = async (file: FileMeta) => {
    setOpenMenuFor(null);
    if (!user) return;
    if (file.storage_path.startsWith(`${user.id}/`)) {
      // Already in user's storage — just clone the DB row pointer.
      const { error } = await supabase.from("files").insert({
        owner_id: user.id,
        folder_id: null,
        name: file.name,
        storage_path: file.storage_path,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
      });
      if (error) toast.error("No se pudo guardar");
      else toast.success("Guardado en tus archivos");
      return;
    }
    try {
      const { data: src, error: dlErr } = await supabase.storage.from("files").download(file.storage_path);
      if (dlErr || !src) throw dlErr ?? new Error("Sin contenido");
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("files").upload(path, src, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.mime_type ?? "application/octet-stream",
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("files").insert({
        owner_id: user.id,
        folder_id: null,
        name: file.name,
        storage_path: path,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
      });
      if (dbErr) throw dbErr;
      toast.success("Guardado en Eurekup");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const copyMessage = async (m: Message) => {
    setOpenMenuFor(null);
    const t = m.body ?? m.file?.name ?? "";
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const forwardMessage = async (m: Message) => {
    setOpenMenuFor(null);
    const t = m.body ?? (m.file ? `Archivo: ${m.file.name}` : "");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Eurekup", text: t });
        return;
      } catch {
        // fallthrough
      }
    }
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Mensaje copiado para reenviar");
    } catch {
      toast.error("No se pudo reenviar");
    }
  };

  // Move file modal state
  const [moveFile, setMoveFile] = useState<FileMeta | null>(null);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const openMoveFor = async (file: FileMeta) => {
    setOpenMenuFor(null);
    if (!user) return;
    const { data } = await supabase
      .from("folders")
      .select("id, name")
      .eq("owner_id", user.id)
      .order("name");
    setFolders(data ?? []);
    setMoveFile(file);
  };
  const doMove = async (folderId: string | null) => {
    if (!moveFile || !user) return;
    if (!moveFile.storage_path.startsWith(`${user.id}/`)) {
      const { error } = await supabase
        .from("files")
        .insert({
          owner_id: user.id,
          folder_id: folderId,
          name: moveFile.name,
          storage_path: moveFile.storage_path,
          mime_type: moveFile.mime_type,
          size_bytes: moveFile.size_bytes,
        });
      if (error) {
        toast.error("No se pudo mover");
        return;
      }
    } else {
      const { error } = await supabase.from("files").update({ folder_id: folderId }).eq("id", moveFile.id);
      if (error) {
        toast.error("No se pudo mover");
        return;
      }
    }
    toast.success("Movido");
    setMoveFile(null);
  };

  return (
    <div className="fixed inset-0 z-40 flex h-dvh flex-col bg-background">
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
          <Avatar name={title} url={avatar} online={peerId ? peerOnline : undefined} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{title}</p>
            {peerId ? (
              <p className={`truncate text-xs ${peerOnline ? "text-success" : "text-muted-foreground"}`}>
                {peerOnline
                  ? t("chat.online")
                  : lastSeen
                  ? `${t("chat.lastSeen")} ${new Date(lastSeen).toLocaleString(lang, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : t("chat.offline")}
              </p>
            ) : (
              subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
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
              {t("chat.empty")}
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
                  <div
                    className="relative max-w-[78%]"
                    onTouchStart={(e) => {
                      const t = window.setTimeout(() => setOpenMenuFor(m.id), 450);
                      (e.currentTarget as HTMLDivElement & { _lp?: number })._lp = t;
                    }}
                    onTouchEnd={(e) => {
                      const el = e.currentTarget as HTMLDivElement & { _lp?: number };
                      if (el._lp) window.clearTimeout(el._lp);
                    }}
                    onTouchMove={(e) => {
                      const el = e.currentTarget as HTMLDivElement & { _lp?: number };
                      if (el._lp) window.clearTimeout(el._lp);
                    }}
                  >
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm break-words ${
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "glass text-foreground rounded-bl-md"
                      } ${isDeleted ? "italic opacity-70" : ""}`}
                    >
                      {isDeleted ? (
                        <p>{t("chat.deleted")}</p>
                      ) : m.file && m.file.mime_type?.startsWith("image/") && thumbs[m.file.id] ? (
                        <button onClick={() => setLightbox(thumbs[m.file!.id])} className="-mx-2 -mt-1 block overflow-hidden rounded-xl">
                          <img src={thumbs[m.file.id]} alt={m.file.name} loading="lazy" className="max-h-64 w-full max-w-xs object-cover" />
                        </button>
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
                        {!isDeleted && m.edited_at && <span className="italic">{t("chat.edited")}</span>}
                        {m.scheduled_at && new Date(m.scheduled_at) > new Date() && (
                          <span className="flex items-center gap-0.5"><CalendarClock className="h-3 w-3" />{t("chat.pending")} · {new Date(m.scheduled_at).toLocaleString(lang, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        )}
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

                    {/* Action button — only visible on hover (desktop). Mobile uses long-press on the bubble. */}
                    {!isDeleted && (
                      <button
                        onClick={() => setOpenMenuFor(openMenuFor === m.id ? null : m.id)}
                        className={`absolute -top-2 ${mine ? "-left-2" : "-right-2"} hidden h-7 w-7 items-center justify-center rounded-full bg-glass-strong text-foreground shadow-soft transition-opacity duration-200 hover:bg-glass md:flex md:opacity-0 md:group-hover:opacity-100 ${openMenuFor === m.id ? "md:opacity-100" : ""}`}
                        aria-label="Acciones"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Action menu */}
                    {openMenuFor === m.id && !isDeleted && (
                      <div
                        className={`absolute z-20 mt-1 min-w-52 overflow-hidden rounded-2xl glass-strong p-1 text-sm shadow-elevated animate-slide-up ${
                          mine ? "right-0" : "left-0"
                        } ${i >= messages.length - 3 ? "bottom-full mb-1" : "top-full"}`}
                      >
                        {!m.file && (
                          <button
                            onClick={() => copyMessage(m)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                          >
                            <Copy className="h-4 w-4" /> {t("chat.copy")}
                          </button>
                        )}
                        <button
                          onClick={() => forwardMessage(m)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                        >
                          <Forward className="h-4 w-4" /> {t("chat.forward")}
                        </button>
                        {mine && m.body !== null && !m.file && (
                          <button
                            onClick={() => startEdit(m)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                          >
                            <Pencil className="h-4 w-4" /> {t("chat.edit")}
                          </button>
                        )}
                        {m.file && (
                          <>
                            <button
                              onClick={() => downloadFile(m.file!)}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                            >
                              <Download className="h-4 w-4" /> {t("chat.download")}
                            </button>
                            <button
                              onClick={() => openMoveFor(m.file!)}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                            >
                              <FolderInput className="h-4 w-4" /> {t("chat.move")}
                            </button>
                            <button
                              onClick={() => saveToEurekup(m.file!)}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-glass"
                            >
                              <Share2 className="h-4 w-4" /> {t("chat.saveEurekup")}
                            </button>
                          </>
                        )}
                        {mine && (
                          <button
                            onClick={() => deleteMessage(m)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" /> {t("chat.delete")}
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
            <span className="flex-1 truncate text-muted-foreground">{t("chat.editing")}</span>
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
            placeholder={editing ? t("chat.editPlaceholder") : t("chat.placeholder")}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <button
            onClick={() => send()}
            onContextMenu={(e) => {
              e.preventDefault();
              if (text.trim() && !editing) setScheduleOpen(true);
            }}
            onTouchStart={() => {
              sendLp.current = window.setTimeout(() => {
                if (text.trim() && !editing) setScheduleOpen(true);
              }, 500);
            }}
            onTouchEnd={(e) => {
              if (sendLp.current) window.clearTimeout(sendLp.current);
              if (scheduleOpen) e.preventDefault();
            }}
            title={t("chat.scheduleHint")}
            disabled={sending || !text.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
            aria-label={editing ? "Guardar" : "Enviar"}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-xl animate-fade-in"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setLightbox(null)}
            aria-label={t("common.close")}
            className="glass absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full safe-top"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] max-w-full touch-pinch-zoom rounded-2xl object-contain shadow-elevated"
          />
        </div>
      )}

      {scheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-md" onClick={() => setScheduleOpen(false)} />
          <div className="glass-strong relative w-full max-w-sm space-y-4 rounded-3xl p-5 animate-slide-up">
            <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="h-4 w-4" />{t("chat.schedule")}</h2>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {scheduleAt && (
              <p className="text-xs text-muted-foreground">
                {t("chat.scheduledFor")} {new Date(scheduleAt).toLocaleString(lang, { dateStyle: "full", timeStyle: "short" })}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setScheduleOpen(false)} className="flex-1 rounded-full glass-subtle py-2.5 text-sm">{t("common.cancel")}</button>
              <button
                onClick={() => {
                  const d = new Date(scheduleAt);
                  if (!isFutureSchedule(d)) return toast.error(t("chat.scheduleFuture"));
                  setScheduleOpen(false);
                  setScheduleAt("");
                  send(d);
                }}
                className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move-to-folder modal */}
      {moveFile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-md" onClick={() => setMoveFile(null)} />
          <div className="glass-strong relative flex max-h-[70dvh] w-full max-w-sm flex-col rounded-3xl p-5 animate-slide-up backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Mover a carpeta</h2>
              <button onClick={() => setMoveFile(null)} className="rounded-full p-1.5 hover:bg-glass" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{moveFile.name}</p>
            <div className="mt-4 -mx-1 flex-1 overflow-y-auto px-1">
              <button
                onClick={() => doMove(null)}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm hover:bg-glass"
              >
                <FolderInput className="h-4 w-4 text-muted-foreground" /> Raíz (sin carpeta)
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => doMove(f.id)}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm hover:bg-glass"
                >
                  <FolderInput className="h-4 w-4 text-muted-foreground" /> {f.name}
                </button>
              ))}
              {folders.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No tienes carpetas. Se guardará en la raíz.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
