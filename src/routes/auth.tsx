import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Check, Circle, Eye, EyeOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EurekupLogo } from "@/components/eurekup-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useT } from "@/lib/i18n";
import { passwordRules } from "@/lib/password";
import { uploadAvatar } from "@/lib/avatar-upload";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · EurekUp" },
      { name: "description", content: "Inicia sesión o crea tu cuenta de EurekUp: chats y almacenamiento en un solo lugar." },
      { property: "og:title", content: "Entrar · EurekUp" },
      { property: "og:description", content: "Inicia sesión o crea tu cuenta de EurekUp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const baseSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  name: z.string().trim().min(1, "Requerido").max(60).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const { t, tr } = useT();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [nick, setNick] = useState("");
  const [nickState, setNickState] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      setReferralCode(ref.toUpperCase().slice(0, 12));
      setMode("signup");
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/app/chats" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (mode !== "signup" || !nick) return setNickState("idle");
    if (!/^[a-z0-9_]{3,24}$/.test(nick)) return setNickState("invalid");
    setNickState("checking");
    const h = window.setTimeout(async () => {
      const { data } = await supabase.rpc("username_available", { _u: nick });
      setNickState(data ? "ok" : "taken");
    }, 400);
    return () => window.clearTimeout(h);
  }, [nick, mode]);

  const checks = useMemo(
    () => ({
      length: passwordRules.length(password),
      upper: passwordRules.upper(password),
      lower: passwordRules.lower(password),
      number: passwordRules.number(password),
    }),
    [password]
  );
  const allPass = checks.length && checks.upper && checks.lower && checks.number;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = baseSchema.safeParse({ email, name: mode === "signup" ? name : undefined });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (mode === "signup" && nickState !== "ok") {
      toast.error(tr("Elige un nick disponible.", "Choose an available nick."));
      return;
    }
    if (mode === "signup" && !allPass) {
      toast.error(t("auth.mustContain"));
      return;
    }
    if (mode === "signin" && password.length < 6) {
      toast.error("Contraseña inválida");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data: su, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: name,
              username: nick,
              ...(referralCode.trim() ? { referral_code: referralCode.trim().toUpperCase() } : {}),
            },
          },
        });
        if (error) throw error;
        if (avatarFile && su.session && su.user) {
          await uploadAvatar(su.user.id, avatarFile).catch(() => undefined);
        }
      }
      navigate({ to: "/app/chats" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-5 py-10">
      <Link
        to="/"
        className="glass absolute left-5 top-5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.back")}
      </Link>
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="glass-strong w-full max-w-md rounded-[2rem] p-8 animate-slide-up">
        <div className="mb-8 text-center">
          <EurekupLogo className="mx-auto h-10 w-10 object-contain" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            {mode === "signin" ? t("auth.welcome") : t("auth.create")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin" ? t("auth.signinSub") : t("auth.signupSub")}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <Field label={t("auth.name")} value={name} onChange={setName} placeholder={t("auth.namePh")} />
          )}
          {mode === "signup" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Nick</span>
              <div className="flex items-center rounded-2xl glass-subtle px-4 focus-within:ring-2 focus-within:ring-ring">
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={nick}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => setNick(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
                  placeholder="tu_nick"
                  className="w-full bg-transparent py-3 pl-1 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                />
              </div>
              <span className={`mt-1 block text-[11px] ${nickState === "ok" ? "text-success" : nickState === "taken" || nickState === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>
                {nickState === "ok" ? tr("Disponible", "Available")
                  : nickState === "taken" ? tr("Ya está en uso", "Already taken")
                  : nickState === "checking" ? tr("Comprobando…", "Checking…")
                  : tr("3–24 caracteres: minúsculas, números y _ (sin espacios).", "3–24 characters: lowercase, numbers and _ (no spaces).")}
              </span>
            </label>
          )}
          {mode === "signup" && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl glass-subtle px-4 py-3 text-sm">
              <span className="text-muted-foreground">{tr("Foto de perfil (opcional)", "Profile photo (optional)")}</span>
              <span className="ml-auto truncate text-xs">{avatarFile?.name ?? tr("Elegir…", "Choose…")}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024) setAvatarFile(f);
                  else if (f) toast.error(tr("Imagen de máx. 5 MB.", "Image up to 5 MB."));
                }}
              />
            </label>
          )}
          <Field label={t("auth.email")} type="email" value={email} onChange={setEmail} placeholder="tu@email.com" autoComplete="email" />
          <PasswordField
            label={t("auth.password")}
            value={password}
            onChange={setPassword}
            placeholder={mode === "signup" ? t("auth.passwordNewPh") : t("auth.passwordPh")}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />

          {mode === "signin" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("auth.forgot")}
              </button>
            </div>
          )}

          {mode === "signup" && (
            <div className="glass-subtle space-y-1.5 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("auth.mustContain")}</p>
              <PassRule ok={checks.length} text={t("auth.ruleLength")} />
              <PassRule ok={checks.upper} text={t("auth.ruleUpper")} />
              <PassRule ok={checks.lower} text={t("auth.ruleLower")} />
              <PassRule ok={checks.number} text={t("auth.ruleNumber")} />
            </div>
          )}

          {mode === "signup" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("auth.referral")} <span className="opacity-60">{t("auth.referralHint")}</span>
              </span>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase().slice(0, 12))}
                placeholder="EUREKUP1"
                className="w-full rounded-2xl glass-subtle px-4 py-3 text-sm font-mono tracking-wider placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={loading || (mode === "signup" && (!allPass || nickState !== "ok"))}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-95 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? t("auth.signin") : t("auth.signup")}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {mode === "signin" ? t("auth.register") : t("auth.login")}
          </button>
        </div>
      </div>

      {forgotOpen && <ForgotModal initialEmail={email} onClose={() => setForgotOpen(false)} />}
    </div>
  );
}

function ForgotModal({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const { t } = useT();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = z.string().trim().email().max(255).safeParse(email);
    if (!ok.success) return toast.error("Email inválido");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(ok.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.linkSent"));
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" onClick={onClose} />
      <form onSubmit={send} className="glass-strong relative w-full max-w-sm space-y-4 rounded-3xl p-6 animate-slide-up">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("auth.forgotTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-full p-1.5 hover:bg-glass">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{t("auth.forgotSub")}</p>
        <Field label={t("auth.email")} type="email" value={email} onChange={setEmail} placeholder="tu@email.com" autoComplete="email" />
        <button
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("auth.sendLink")}
        </button>
      </form>
    </div>
  );
}

function PassRule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/20 text-success">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground/50" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{text}</span>
    </div>
  );
}

function PasswordField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const { t } = useT();
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{props.label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          className="w-full rounded-2xl glass-subtle px-4 py-3 pr-11 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t("auth.hide") : t("auth.show")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-2xl glass-subtle px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
