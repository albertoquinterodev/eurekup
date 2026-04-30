import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Hash, Lock, Globe, Plus, Search, Loader2, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppBar } from "@/components/app-bar";
import { Fab } from "@/components/fab";

export const Route = createFileRoute("/app/channels/")({
  component: Channels,
});

interface Channel {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  owner_id: string;
  tags: string[];
}

const TAGS = ["Tecnología", "Diseño", "Música", "Cine", "Negocios", "Estudio"];

function Channels() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("public");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("channels")
        .select("id, name, description, visibility, owner_id, tags")
        .order("created_at", { ascending: false });
      setChannels(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = channels.filter((c) => {
    const q = query.trim().toLowerCase();
    if (q && !c.name.toLowerCase().includes(q) && !(c.description ?? "").toLowerCase().includes(q)) return false;
    if (activeTags.length && !activeTags.some((t) => c.tags.includes(t))) return false;
    return true;
  });

  const join = async (c: Channel) => {
    if (!user) return;
    if (c.visibility === "private" && c.owner_id !== user.id) {
      const { error } = await supabase.from("channel_join_requests").insert({ channel_id: c.id, user_id: user.id });
      if (error && !error.message.includes("duplicate")) {
        toast.error(error.message);
        return;
      }
      toast.success("Solicitud enviada");
      return;
    }
    // create conversation tied to channel if missing
    let convId: string | null = null;
    const { data: existing } = await supabase.from("conversations").select("id").eq("channel_id", c.id).maybeSingle();
    if (existing) convId = existing.id;
    if (!convId) {
      const { data: conv, error } = await supabase.from("conversations").insert({ kind: "channel", channel_id: c.id }).select("id").single();
      if (error) {
        toast.error(error.message);
        return;
      }
      convId = conv.id;
    }
    await supabase.from("conversation_members").insert({ conversation_id: convId, user_id: user.id }).select();
    navigate({ to: "/app/chats/$id", params: { id: convId! } });
  };

  const create = async () => {
    if (!user || !newName.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    setCreating(true);
    try {
      const { data: ch, error } = await supabase
        .from("channels")
        .insert({
          name: newName.trim(),
          description: newDesc.trim() || null,
          visibility: newVisibility,
          owner_id: user.id,
          tags: activeTags,
        })
        .select("id, name, description, visibility, owner_id, tags")
        .single();
      if (error) throw error;
      const { data: conv } = await supabase.from("conversations").insert({ kind: "channel", channel_id: ch.id }).select("id").single();
      if (conv) await supabase.from("conversation_members").insert({ conversation_id: conv.id, user_id: user.id });
      setChannels((prev) => [ch, ...prev]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      toast.success("Canal creado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <AppBar
        title="Canales"
        subtitle="Descubre comunidades"
        rightSlot={
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-glass-strong"
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        }
      />

      <div className="px-3 pt-3">
        <div className="glass flex items-center gap-2 rounded-full px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar canales…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>

        {showFilters && (
          <div className="glass mt-3 rounded-3xl p-4 animate-slide-up">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Preferencias</p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => {
                const active = activeTags.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() =>
                      setActiveTags((prev) => (active ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      active ? "bg-primary text-primary-foreground" : "glass-subtle text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pb-4 pt-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-12 text-center">
            <p className="font-medium">Sin resultados</p>
            <p className="mt-1 text-sm text-muted-foreground">Crea el primer canal con el botón +.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <li key={c.id} className="glass rounded-3xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-glass-strong">
                    {c.visibility === "private" ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{c.name}</p>
                      <span className="flex items-center gap-1 rounded-full glass-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {c.visibility === "public" ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                        {c.visibility === "public" ? "Público" : "Privado"}
                      </span>
                    </div>
                    {c.description && <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
                  </div>
                  <button
                    onClick={() => join(c)}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    {c.visibility === "private" && c.owner_id !== user?.id ? "Solicitar" : "Unirse"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Fab onClick={() => setShowCreate(true)} icon={Plus} label="Crear canal" />

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="glass-strong relative w-full max-w-md rounded-3xl p-6 animate-slide-up">
            <h2 className="text-lg font-semibold">Crear canal</h2>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del canal"
              className="mt-4 w-full rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["public", "private"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setNewVisibility(v)}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-medium ${
                    newVisibility === v ? "bg-primary text-primary-foreground" : "glass-subtle text-muted-foreground"
                  }`}
                >
                  {v === "public" ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  {v === "public" ? "Público" : "Privado"}
                </button>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-full glass-subtle py-2.5 text-sm font-medium">
                Cancelar
              </button>
              <button
                onClick={create}
                disabled={creating}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
