import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { UserPlus, Trash2, MessageSquare, Loader2, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar-bubble";
import { Fab } from "@/components/fab";
import { ConfirmDialog } from "@/components/confirm-dialog";

export const Route = createFileRoute("/app/contacts/")({
  component: Contacts,
});

interface Contact {
  id: string;
  contact_user_id: string;
  profile: { display_name: string; email: string; avatar_url: string | null };
}

const emailSchema = z.string().trim().email("Email inválido").max(255);

function Contacts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmDel, setConfirmDel] = useState<Contact | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, contact_user_id, profiles!contacts_contact_user_id_fkey(display_name, email, avatar_url)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      if (error) {
        toast.error("No se pudieron cargar los contactos");
      } else {
        setContacts(
          (data ?? []).map((d) => ({
            id: d.id,
            contact_user_id: d.contact_user_id,
            profile: d.profiles as { display_name: string; email: string; avatar_url: string | null },
          }))
        );
      }
      setLoading(false);
    };
    load();
  }, [user]);

  // Find or create a direct conversation between current user and a peer.
  // Uses a security-definer RPC so it is atomic and survives expired-session edge cases
  // (the call refreshes the session client-side first).
  const ensureDirectConv = async (peerId: string): Promise<string | null> => {
    if (!user) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error("Tu sesión ha caducado. Vuelve a iniciar sesión.");
      navigate({ to: "/auth" });
      return null;
    }
    const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { _peer: peerId });
    if (error) {
      toast.error(error.message || "No se pudo abrir el chat");
      return null;
    }
    return data as string;
  };

  const addContact = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (!user) return;
    setAdding(true);
    try {
      const target = parsed.data.toLowerCase();
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url")
        .ilike("email", target)
        .limit(1);
      if (pErr) throw pErr;
      const profile = profiles?.[0];
      if (!profile) {
        toast.error("No existe un usuario con ese email");
        return;
      }
      if (profile.id === user.id) {
        toast.error("No puedes añadirte a ti mismo");
        return;
      }
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("owner_id", user.id)
        .eq("contact_user_id", profile.id)
        .maybeSingle();
      if (existing) {
        toast.message("Ya tienes este contacto");
        // still ensure a conversation and navigate
        const convId = await ensureDirectConv(profile.id);
        setShowAdd(false);
        setEmail("");
        if (convId) navigate({ to: "/app/chats/$id", params: { id: convId } });
        return;
      }
      const { data: inserted, error } = await supabase
        .from("contacts")
        .insert({ owner_id: user.id, contact_user_id: profile.id })
        .select("id, contact_user_id")
        .single();
      if (error) throw error;
      setContacts((prev) => [
        {
          id: inserted.id,
          contact_user_id: inserted.contact_user_id,
          profile: { display_name: profile.display_name, email: profile.email, avatar_url: profile.avatar_url },
        },
        ...prev,
      ]);
      // Auto-create chat instance and jump into it.
      const convId = await ensureDirectConv(profile.id);
      toast.success(`${profile.display_name} añadido`);
      setShowAdd(false);
      setEmail("");
      if (convId) navigate({ to: "/app/chats/$id", params: { id: convId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al añadir");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (c: Contact) => {
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    if (error) {
      toast.error("No se pudo eliminar");
      return;
    }
    setContacts((prev) => prev.filter((x) => x.id !== c.id));
    toast.success("Contacto eliminado");
  };

  const startChat = async (c: Contact) => {
    const convId = await ensureDirectConv(c.contact_user_id);
    if (convId) navigate({ to: "/app/chats/$id", params: { id: convId } });
  };

  return (
    <>
      <AppBar title="Contactos" subtitle={`${contacts.length} ${contacts.length === 1 ? "contacto" : "contactos"}`} />
      <div className="px-3 pb-4 pt-3">
        {loading ? (
          <div className="glass flex items-center justify-center rounded-3xl py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="glass mx-auto max-w-sm rounded-3xl px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-glass-strong">
              <UserPlus className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Sin contactos</p>
            <p className="mt-1 text-sm text-muted-foreground">Añade tu primer contacto por email.</p>
          </div>
        ) : (
          <ul className="glass rounded-3xl overflow-hidden">
            {contacts.map((c, i) => (
              <li key={c.id}>
                <div className="flex items-center gap-3 px-4 py-3 transition hover:bg-glass-strong">
                  <button
                    onClick={() => startChat(c)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`Abrir chat con ${c.profile.display_name}`}
                  >
                    <Avatar name={c.profile.display_name} url={c.profile.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.profile.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.profile.email}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => startChat(c)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-glass"
                    aria-label="Nuevo chat"
                    title="Nuevo chat"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => navigate({ to: "/app/channels" })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-glass"
                    aria-label="Nuevo canal"
                    title="Crear o unirse a un canal"
                  >
                    <Hash className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDel(c)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {i < contacts.length - 1 && <div className="ml-[68px] h-px bg-glass-border" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Fab onClick={() => setShowAdd(true)} icon={UserPlus} label="Añadir contacto" />

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="glass-strong relative w-full max-w-sm rounded-3xl p-6 animate-slide-up">
            <h2 className="text-lg font-semibold">Añadir contacto</h2>
            <p className="mt-1 text-sm text-muted-foreground">Introduce el email del usuario.</p>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@email.com"
              className="mt-4 w-full rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === "Enter" && addContact()}
            />
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-full glass-subtle py-2.5 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={addContact}
                disabled={adding}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {adding && <Loader2 className="h-4 w-4 animate-spin" />}
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="Eliminar contacto"
        description={
          <>
            ¿Eliminar a <span className="text-foreground font-medium">{confirmDel?.profile.display_name}</span>? No se eliminarán las conversaciones existentes.
          </>
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => { if (confirmDel) await remove(confirmDel); }}
      />
    </>
  );
}
