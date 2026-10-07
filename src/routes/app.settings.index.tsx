import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { LogOut, Mail, Trash2, Shield, Gift, Hash, Loader2, Copy, Sun, Moon, Crown, Check, Sparkles, ChevronDown, Globe, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar-bubble";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatBytes } from "@/lib/format";
import { uploadAvatar } from "@/lib/avatar-upload";
import { isMessageSoundOn, setMessageSound, playMessageBeep } from "@/lib/sound";
import { Bell, Camera } from "lucide-react";

export const Route = createFileRoute("/app/settings/")({
  component: Settings,
});

interface Profile {
  display_name: string;
  username: string;
  avatar_url: string | null;
  avatar_visibility: string;
  referral_code: string;
}

const nameSchema = z.string().trim().min(1).max(60);
const nickSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/);

function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { lang, setLang, t, tr } = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quota, setQuota] = useState({ used: 0, total: 0 });
  const [referrals, setReferrals] = useState<{ verified: number; pending: number }>({ verified: 0, pending: 0 });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [showInviteEmail, setShowInviteEmail] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNick, setEditNick] = useState("");
  const [saving, setSaving] = useState(false);
  const [editVis, setEditVis] = useState<"everyone" | "contacts">("everyone");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => setSoundOn(isMessageSoundOn()), []);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setMessageSound(next);
    if (next) playMessageBeep(true);
  };

  const setLanguage = (code: string) => {
    if (code !== "es" && code !== "en") return;
    setLang(code);
    toast.success(code === "en" ? "Language updated" : "Idioma actualizado");
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data: p }, { data: q }, { data: refs }] = await Promise.all([
        supabase.from("profiles").select("display_name, username, avatar_url:visible_avatar, avatar_visibility, referral_code" as "display_name, username, avatar_url, avatar_visibility, referral_code").eq("id", user.id).single(),
        supabase.from("storage_quota").select("used_bytes, total_bytes").eq("user_id", user.id).single(),
        supabase.from("referrals").select("status").eq("referrer_id", user.id),
      ]);
      if (p) setProfile(p);
      if (q) setQuota({ used: Number(q.used_bytes), total: Number(q.total_bytes) });
      if (refs) {
        setReferrals({
          verified: refs.filter((r) => r.status === "verified").length,
          pending: refs.filter((r) => r.status === "pending").length,
        });
      }
    };
    load();
  }, [user]);

  const openEdit = () => {
    if (!profile) return;
    setEditName(profile.display_name);
    setEditNick(profile.username);
    setEditVis(profile.avatar_visibility === "contacts" ? "contacts" : "everyone");
    setEditFile(null);
    setEditPreview(null);
    setEditOpen(true);
  };

  const saveProfile = async () => {
    if (!user || !profile) return;
    const n = nameSchema.safeParse(editName);
    if (!n.success) return toast.error(tr("El nombre es obligatorio (máx. 60).", "Name is required (max 60)."));
    const k = nickSchema.safeParse(editNick.replace(/^@/, ""));
    if (!k.success) return toast.error(tr("Nick inválido: 3–24 letras minúsculas, números o _.", "Invalid nick: 3–24 lowercase letters, numbers or _."));
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: n.data, username: k.data, avatar_visibility: editVis, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error(tr("Ese nick ya está en uso.", "That nick is already taken."));
      return toast.error(error.message);
    }
    let avatarUrl = profile.avatar_url;
    if (editFile) {
      try {
        avatarUrl = await uploadAvatar(user.id, editFile);
      } catch {
        toast.error(tr("No se pudo subir la foto (imagen de máx. 5 MB).", "Couldn't upload the photo (image up to 5 MB)."));
      }
    }
    setProfile({ ...profile, display_name: n.data, username: k.data, avatar_visibility: editVis, avatar_url: avatarUrl });
    setEditOpen(false);
    toast.success(tr("Perfil actualizado.", "Profile updated."));
  };

  const invite = async () => {
    const parsed = z.string().trim().email().max(255).safeParse(inviteEmail);
    if (!parsed.success) {
      toast.error(tr("Email inválido.", "Invalid email."));
      return;
    }
    if (!user || !profile) return;
    setInviting(true);
    try {
      const target = parsed.data.toLowerCase();
      const { error } = await supabase.from("referrals").insert({ referrer_id: user.id, invited_email: target });
      if (error) {
        if (error.message.includes("duplicate")) toast.message(tr("Ya invitaste a este email.", "You already invited this email."));
        else throw error;
      } else {
        const subject = encodeURIComponent(tr("Te invito a EurekUp", "Join me on EurekUp"));
        const body = encodeURIComponent(
          tr(
            `Hola,\n\nQuiero invitarte a EurekUp, una app que combina chats y archivos.\nUsa mi código de referido al registrarte: ${profile.referral_code}\n\nÚnete: ${window.location.origin}/auth\n\n— ${profile.display_name}`,
            `Hi,\n\nI'd like to invite you to EurekUp, an app that combines chats and files.\nUse my referral code when you sign up: ${profile.referral_code}\n\nJoin: ${window.location.origin}/auth\n\n— ${profile.display_name}`
          )
        );
        window.location.href = `mailto:${target}?subject=${subject}&body=${body}`;
        setReferrals((r) => ({ ...r, pending: r.pending + 1 }));
        setInviteEmail("");
        toast.success(tr("Invitación lista para enviar.", "Invitation ready to send."));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setInviting(false);
    }
  };

  const copyCode = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.referral_code);
    toast.success(tr("Código copiado.", "Code copied."));
  };

  const copyInviteLink = () => {
    if (!profile) return;
    navigator.clipboard.writeText(`${window.location.origin}/auth?ref=${profile.referral_code}`);
    toast.success(tr("Enlace de invitación copiado.", "Invite link copied."));
  };

  const shareInvite = async () => {
    if (!profile) return;
    const link = `${window.location.origin}/auth?ref=${profile.referral_code}`;
    const text = tr(
      `Únete a EurekUp conmigo y conseguimos +1 GB extra. Usa mi enlace: ${link}`,
      `Join me on EurekUp and we both get +1 GB. Use my link: ${link}`
    );
    if (navigator.share) {
      try {
        await navigator.share({ title: "EurekUp", text, url: link });
      } catch {
        // cancelled
      }
    } else copyInviteLink();
  };

  const logout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const deleteAccount = async () => {
    if (!user) return;
    await supabase.from("profiles").delete().eq("id", user.id);
    await signOut();
    toast.success(tr("Cuenta eliminada.", "Account deleted."));
    navigate({ to: "/" });
  };

  const usedPct = quota.total ? Math.min(100, (quota.used / quota.total) * 100) : 0;
  const per = tr("/mes", "/mo");

  return (
    <>
      <AppBar title={tr("Ajustes", "Settings")} />

      <div className="space-y-3 px-3 pb-4 pt-3">
        {/* Profile */}
        <div className="glass rounded-3xl p-5">
          {profile ? (
            <div className="flex items-center gap-4">
              <Avatar name={profile.display_name} url={profile.avatar_url} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{profile.display_name}</p>
                <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
              </div>
              <button
                onClick={openEdit}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full glass-subtle hover:bg-glass"
                aria-label={tr("Editar perfil", "Edit profile")}
                title={tr("Editar perfil", "Edit profile")}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Storage + Premium */}
        <div className="glass relative overflow-hidden rounded-3xl p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{tr("Almacenamiento", "Storage")}</p>
              <p className="text-sm">
                <span className="font-semibold">{formatBytes(quota.used)}</span>{" "}
                <span className="text-muted-foreground">/ {formatBytes(quota.total)}</span>
              </p>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-glass">
              <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${usedPct}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="glass-strong rounded-2xl px-3 py-2 text-center backdrop-blur-2xl">
                <p className="text-lg font-semibold">+{Math.min(15, referrals.verified)} GB</p>
                <p className="text-[11px] text-muted-foreground">{tr("Por verificados", "From verified")}</p>
              </div>
              <div className="glass-strong rounded-2xl px-3 py-2 text-center backdrop-blur-2xl">
                <p className="text-lg font-semibold">{referrals.pending}</p>
                <p className="text-[11px] text-muted-foreground">{tr("Pendientes", "Pending")}</p>
              </div>
            </div>
            <button
              onClick={() => setShowPremium(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
            >
              <Crown className="h-4 w-4" /> {tr("Pasar a Premium", "Upgrade to Premium")}
              <Sparkles className="h-3.5 w-3.5 opacity-80" />
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {tr(
                "Hasta 5 TB · O invita amigos para ganar +1 GB cada uno (máx. 15 GB).",
                "Up to 5 TB · Or invite friends to earn +1 GB each (max 15 GB)."
              )}
            </p>
          </div>
        </div>

        {/* Referrals */}
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            <p className="font-medium">{tr("Invita y gana espacio", "Invite and earn space")}</p>
          </div>

          {profile && (
            <button
              onClick={copyCode}
              className="mt-3 flex w-full items-center justify-between rounded-2xl glass-subtle px-4 py-3 text-sm transition hover:bg-glass"
              title={tr("Copiar código", "Copy code")}
            >
              <span className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono font-semibold tracking-wider">{profile.referral_code}</span>
              </span>
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {profile && (
            <button
              onClick={shareInvite}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95"
            >
              <Gift className="h-4 w-4" /> {tr("Compartir invitación", "Share invitation")}
            </button>
          )}

          <button
            onClick={() => setShowInviteEmail((v) => !v)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-full px-3 py-2 text-xs text-muted-foreground hover:bg-glass"
            aria-expanded={showInviteEmail}
          >
            <Mail className="h-3.5 w-3.5" /> {tr("Invitar por email", "Invite by email")}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showInviteEmail ? "rotate-180" : ""}`} />
          </button>

          {showInviteEmail && (
            <div className="mt-2 flex gap-2 animate-slide-up">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={tr("email@amigo.com", "email@friend.com")}
                className="min-w-0 flex-1 rounded-full glass-subtle px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={invite}
                disabled={inviting}
                className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {tr("Enviar", "Send")}
              </button>
            </div>
          )}
        </div>

        {/* Preferences */}
        <div className="glass rounded-3xl overflow-hidden">
          <div className="flex w-full items-center gap-3 px-5 py-4">
            {theme === "dark" ? <Moon className="h-5 w-5 text-muted-foreground" /> : <Sun className="h-5 w-5 text-muted-foreground" />}
            <span className="flex-1 text-sm">{tr("Tema", "Theme")}</span>
            <button
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === "dark"}
              aria-label={tr("Alternar tema", "Toggle theme")}
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${theme === "dark" ? "bg-primary" : "bg-glass-strong"}`}
            >
              <span
                className={`absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-soft transition-all duration-200 ${
                  theme === "dark" ? "left-[22px]" : "left-0.5"
                }`}
              >
                {theme === "dark" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              </span>
            </button>
          </div>
          <div className="ml-12 h-px bg-glass-border" />

          <div className="flex w-full items-center gap-3 px-5 py-4">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm">{tr("Sonido de mensajes", "Message sound")}</span>
            <button
              onClick={toggleSound}
              role="switch"
              aria-checked={soundOn}
              aria-label={tr("Sonido de mensajes", "Message sound")}
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${soundOn ? "bg-primary" : "bg-glass-strong"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow-soft transition-all duration-200 ${soundOn ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <div className="ml-12 h-px bg-glass-border" />

          <div className="px-5 py-4">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-sm">{t("settings.language")}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { code: "es", label: "Español", ready: true },
                { code: "en", label: "English", ready: true },
                { code: "de", label: "Deutsch", ready: false },
                { code: "fr", label: "Français", ready: false },
                { code: "ru", label: "Русский", ready: false },
                { code: "zh", label: "中文", ready: false },
              ].map((l) => (
                <button
                  key={l.code}
                  onClick={() => (l.ready ? setLanguage(l.code) : toast.info(t("settings.soon")))}
                  className={`rounded-2xl px-3 py-2 text-xs transition ${
                    lang === l.code
                      ? "bg-primary text-primary-foreground font-semibold"
                      : l.ready
                      ? "glass-subtle hover:bg-glass"
                      : "glass-subtle opacity-50"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-12 h-px bg-glass-border" />

          <button
            onClick={() => navigate({ to: "/app/channels" })}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-glass-strong"
          >
            <Hash className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm">{tr("Explorar canales", "Explore channels")}</span>
          </button>
          <div className="ml-12 h-px bg-glass-border" />
          <button
            onClick={() => toast.info(tr("Política de privacidad disponible próximamente.", "Privacy policy coming soon."))}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-glass-strong"
          >
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm">{tr("Política de privacidad", "Privacy policy")}</span>
          </button>
          <div className="ml-12 h-px bg-glass-border" />
          <button
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-glass-strong"
          >
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm">{tr("Cerrar sesión", "Sign out")}</span>
          </button>
        </div>

        <div className="h-16" />

        <button
          onClick={() => setConfirmDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-3xl glass-subtle py-4 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" /> {tr("Eliminar cuenta", "Delete account")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title={tr("Cerrar sesión", "Sign out")}
        description={tr(
          "Tendrás que volver a iniciar sesión para acceder a tus chats y archivos.",
          "You'll need to sign in again to access your chats and files."
        )}
        confirmLabel={tr("Cerrar sesión", "Sign out")}
        onConfirm={logout}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={tr("Eliminar cuenta", "Delete account")}
        description={tr(
          "Se eliminarán tu perfil, contactos, mensajes y archivos. Esta acción es irreversible.",
          "Your profile, contacts, messages and files will be deleted. This can't be undone."
        )}
        confirmLabel={tr("Eliminar todo", "Delete everything")}
        destructive
        onConfirm={deleteAccount}
      />

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-md" onClick={() => setEditOpen(false)} />
          <div className="glass-strong relative w-full max-w-sm space-y-4 rounded-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{tr("Editar perfil", "Edit profile")}</h2>
              <button onClick={() => setEditOpen(false)} className="rounded-full p-1.5 hover:bg-glass" aria-label={t("common.close")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <label className="relative cursor-pointer" aria-label={tr("Cambiar foto", "Change photo")}>
                <Avatar name={editName || "?"} url={editPreview ?? profile?.avatar_url} size="lg" />
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
                  <Camera className="h-3.5 w-3.5" />
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (!f.type.startsWith("image/") || f.size > 5 * 1024 * 1024) {
                      toast.error(tr("Elige una imagen de máx. 5 MB.", "Pick an image up to 5 MB."));
                      return;
                    }
                    setEditFile(f);
                    setEditPreview(URL.createObjectURL(f));
                  }}
                />
              </label>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{tr("¿Quién ve tu foto?", "Who can see your photo?")}</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-full glass-subtle p-1">
                  {(["everyone", "contacts"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEditVis(v)}
                      className={`rounded-full px-2 py-1.5 text-xs transition ${editVis === v ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-glass"}`}
                    >
                      {v === "everyone" ? tr("Todos", "Everyone") : tr("Mis contactos", "My contacts")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{tr("Nombre", "Name")}</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value.slice(0, 60))}
                className="w-full rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Nick</span>
              <div className="flex items-center rounded-2xl glass-subtle px-4 focus-within:ring-2 focus-within:ring-ring">
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={editNick}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => setEditNick(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
                  className="w-full bg-transparent py-3 pl-1 text-sm focus:outline-none"
                />
              </div>
              <span className="mt-1.5 block text-[11px] text-muted-foreground">
                {tr(
                  "3–24 caracteres: letras minúsculas, números y _. Tus contactos te encontrarán por tu nick.",
                  "3–24 characters: lowercase letters, numbers and _. Contacts find you by your nick."
                )}
              </span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => setEditOpen(false)} className="flex-1 rounded-full glass-subtle py-2.5 text-sm font-medium">
                {t("common.cancel")}
              </button>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {tr("Guardar", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPremium && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={() => setShowPremium(false)} />
          <div className="glass-strong relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                <h2 className="text-lg font-semibold">EurekUp Premium</h2>
              </div>
              <button onClick={() => setShowPremium(false)} className="rounded-full p-1.5 hover:bg-glass" aria-label={t("common.close")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("Más espacio para tus archivos y conversaciones.", "More space for your files and conversations.")}
            </p>
            <div className="mt-4 -mx-1 flex-1 space-y-2 overflow-y-auto px-1">
              {[
                { size: "100 GB", price: "1,99 €", highlight: false },
                { size: "200 GB", price: "2,99 €", highlight: true, badge: "Popular" },
                { size: "1 TB", price: "9,99 €", highlight: false },
                { size: "5 TB", price: "24,99 €", highlight: false },
              ].map((plan) => (
                <button
                  key={plan.size}
                  onClick={() => toast.info(tr("Pagos disponibles próximamente.", "Payments coming soon."))}
                  className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${
                    plan.highlight ? "border-primary/40 bg-primary/5 hover:bg-primary/10" : "border-glass-border glass-subtle hover:bg-glass"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-glass-strong">
                      <Check className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{plan.size}</p>
                        {plan.badge && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{tr("Almacenamiento total", "Total storage")}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{plan.price}</p>
                    <p className="text-xs text-muted-foreground">{per}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {tr("Cancela cuando quieras. Precios incluyen impuestos aplicables.", "Cancel anytime. Prices include applicable taxes.")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
