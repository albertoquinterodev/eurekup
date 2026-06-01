import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { LogOut, Mail, Trash2, Shield, Gift, Hash, Loader2, Copy, Sun, Moon, Crown, Check, Sparkles, ChevronDown, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar-bubble";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatBytes } from "@/lib/format";

export const Route = createFileRoute("/app/settings/")({
  component: Settings,
});

interface Profile {
  display_name: string;
  email: string;
  avatar_url: string | null;
  referral_code: string;
}

function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quota, setQuota] = useState({ used: 0, total: 0 });
  const [referrals, setReferrals] = useState<{ verified: number; pending: number }>({ verified: 0, pending: 0 });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showPremium, setShowPremium] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data: p }, { data: q }, { data: refs }] = await Promise.all([
        supabase.from("profiles").select("display_name, email, avatar_url, referral_code").eq("id", user.id).single(),
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

  const invite = async () => {
    const parsed = z.string().trim().email().max(255).safeParse(inviteEmail);
    if (!parsed.success) {
      toast.error("Email inválido");
      return;
    }
    if (!user || !profile) return;
    setInviting(true);
    try {
      const target = parsed.data.toLowerCase();
      const { error } = await supabase.from("referrals").insert({
        referrer_id: user.id,
        invited_email: target,
      });
      if (error) {
        if (error.message.includes("duplicate")) {
          toast.message("Ya invitaste a este email");
        } else {
          throw error;
        }
      } else {
        // Open mailto so user can send the invitation right away
        const subject = encodeURIComponent("Te invito a Eurekup");
        const body = encodeURIComponent(
          `Hola,\n\nQuiero invitarte a Eurekup, una app que combina chats y archivos.\nUsa mi código de referido al registrarte: ${profile.referral_code}\n\nÚnete: ${window.location.origin}/auth\n\n— ${profile.display_name}`
        );
        window.location.href = `mailto:${target}?subject=${subject}&body=${body}`;
        setReferrals((r) => ({ ...r, pending: r.pending + 1 }));
        setInviteEmail("");
        toast.success("Invitación lista para enviar");
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
    toast.success("Código copiado");
  };

  const copyInviteLink = () => {
    if (!profile) return;
    const link = `${window.location.origin}/auth?ref=${profile.referral_code}`;
    navigator.clipboard.writeText(link);
    toast.success("Enlace de invitación copiado");
  };

  const shareInvite = async () => {
    if (!profile) return;
    const link = `${window.location.origin}/auth?ref=${profile.referral_code}`;
    const text = `Únete a Eurekup conmigo y conseguimos +1 GB extra. Usa mi enlace: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Eurekup", text, url: link });
      } catch {
        // user cancelled
      }
    } else {
      copyInviteLink();
    }
  };

  const logout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const deleteAccount = async () => {
    if (!user) return;
    // Sign out + delete profile (cascade removes data). Auth user removal needs admin.
    await supabase.from("profiles").delete().eq("id", user.id);
    await signOut();
    toast.success("Cuenta eliminada");
    navigate({ to: "/" });
  };

  const usedPct = quota.total ? Math.min(100, (quota.used / quota.total) * 100) : 0;

  return (
    <>
      <AppBar title="Ajustes" />

      <div className="space-y-3 px-3 pb-4 pt-3">
        {/* Profile */}
        <div className="glass rounded-3xl p-5">
          {profile ? (
            <div className="flex items-center gap-4">
              <Avatar name={profile.display_name} url={profile.avatar_url} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{profile.display_name}</p>
                <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
              </div>
            </div>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Storage */}
        <div className="glass rounded-3xl p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Almacenamiento</p>
            <p className="text-sm">
              <span className="font-semibold">{formatBytes(quota.used)}</span>{" "}
              <span className="text-muted-foreground">/ {formatBytes(quota.total)}</span>
            </p>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-glass">
            <div className="h-full rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Invita amigos para ganar +1 GB por cada uno verificado (hasta 15 GB extra · 20 GB en total).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="glass-strong rounded-2xl px-3 py-2 text-center backdrop-blur-2xl">
              <p className="text-lg font-semibold">+{Math.min(15, referrals.verified)} GB</p>
              <p className="text-[11px] text-muted-foreground">Activos por verificados</p>
            </div>
            <div className="glass-strong rounded-2xl px-3 py-2 text-center backdrop-blur-2xl">
              <p className="text-lg font-semibold">{referrals.pending}</p>
              <p className="text-[11px] text-muted-foreground">Pendientes de verificar</p>
            </div>
          </div>
        </div>

        {/* Premium */}
        <button
          onClick={() => setShowPremium(true)}
          className="glass relative w-full overflow-hidden rounded-3xl p-5 text-left transition hover:bg-glass-strong"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Eurekup Premium</p>
              <p className="truncate text-xs text-muted-foreground">
                Aumenta tu almacenamiento hasta 5 TB
              </p>
            </div>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>

        <div className="glass rounded-3xl p-5">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            <p className="font-medium">Referidos</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="glass-subtle rounded-2xl p-3 text-center">
              <p className="text-2xl font-semibold">{referrals.verified}</p>
              <p className="text-xs text-muted-foreground">Verificados</p>
            </div>
            <div className="glass-subtle rounded-2xl p-3 text-center">
              <p className="text-2xl font-semibold">{referrals.pending}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </div>

          {profile && (
            <button
              onClick={copyCode}
              className="mt-3 flex w-full items-center justify-between rounded-2xl glass-subtle px-4 py-3 text-sm transition hover:bg-glass"
            >
              <span className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono font-semibold tracking-wider">{profile.referral_code}</span>
              </span>
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {profile && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={shareInvite}
                className="flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-95"
              >
                <Gift className="h-3.5 w-3.5" /> Compartir invitación
              </button>
              <button
                onClick={copyInviteLink}
                className="flex items-center justify-center gap-1.5 rounded-full glass-subtle px-3 py-2.5 text-xs font-medium hover:bg-glass"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar enlace
              </button>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@amigo.com"
              className="flex-1 rounded-full glass-subtle px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={invite}
              disabled={inviting}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Invitar
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="glass rounded-3xl overflow-hidden">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-glass-strong"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Moon className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="flex-1">Modo {theme === "dark" ? "claro" : "oscuro"}</span>
            <span className="text-xs text-muted-foreground">{theme === "dark" ? "Oscuro" : "Claro"}</span>
          </button>
          <div className="ml-12 h-px bg-glass-border" />
          <button
            onClick={() => navigate({ to: "/app/channels" })}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-glass-strong"
          >
            <Hash className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1">Explorar canales</span>
          </button>
          <div className="ml-12 h-px bg-glass-border" />
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toast.info("Política de privacidad disponible próximamente");
            }}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-glass-strong"
          >
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1">Política de privacidad</span>
          </a>
          <div className="ml-12 h-px bg-glass-border" />
          <button
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-glass-strong"
          >
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1">Cerrar sesión</span>
          </button>
        </div>

        <button
          onClick={() => setConfirmDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-3xl glass-subtle py-4 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" /> Eliminar cuenta
        </button>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Cerrar sesión"
        description="Tendrás que volver a iniciar sesión para acceder a tus chats y archivos."
        confirmLabel="Cerrar sesión"
        onConfirm={logout}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar cuenta"
        description="Se eliminarán tu perfil, contactos, mensajes y archivos. Esta acción es irreversible."
        confirmLabel="Eliminar todo"
        destructive
        onConfirm={deleteAccount}
      />

      {showPremium && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={() => setShowPremium(false)} />
          <div className="glass-strong relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Eurekup Premium</h2>
              </div>
              <button onClick={() => setShowPremium(false)} className="rounded-full p-1.5 hover:bg-glass" aria-label="Cerrar">
                <span aria-hidden>✕</span>
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Más espacio para tus archivos y conversaciones.
            </p>
            <div className="mt-4 -mx-1 flex-1 space-y-2 overflow-y-auto px-1">
              {[
                { size: "100 GB", price: "1,99 €", period: "/mes", highlight: false },
                { size: "200 GB", price: "2,99 €", period: "/mes", highlight: true, badge: "Popular" },
                { size: "1 TB", price: "9,99 €", period: "/mes", highlight: false },
                { size: "5 TB", price: "24,99 €", period: "/mes", highlight: false },
              ].map((plan) => (
                <button
                  key={plan.size}
                  onClick={() => toast.info("Pagos disponibles próximamente")}
                  className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${
                    plan.highlight
                      ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                      : "border-glass-border glass-subtle hover:bg-glass"
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
                      <p className="text-xs text-muted-foreground">Almacenamiento total</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{plan.price}</p>
                    <p className="text-xs text-muted-foreground">{plan.period}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Cancela cuando quieras. Precios incluyen impuestos aplicables.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
