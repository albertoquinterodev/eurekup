import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Check, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EurekupLogo } from "@/components/eurekup-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const passwordRules = {
  length: (p: string) => p.length >= 8,
  upper: (p: string) => /[A-Z]/.test(p),
  lower: (p: string) => /[a-z]/.test(p),
  number: (p: string) => /[0-9]/.test(p),
};

const baseSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  name: z.string().trim().min(1, "Requerido").max(60).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Read ?ref=CODE from URL — pre-fill referral and switch to signup.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setReferralCode(ref.toUpperCase().slice(0, 12));
      setMode("signup");
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/app/chats" });
  }, [user, authLoading, navigate]);

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
    if (mode === "signup" && !allPass) {
      toast.error("La contraseña no cumple los requisitos");
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
        toast.success("Bienvenido de vuelta");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada");
      }
      navigate({ to: "/app/chats" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
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
        <ArrowLeft className="h-3.5 w-3.5" /> Volver
      </Link>
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="glass-strong w-full max-w-md rounded-[2rem] p-8 animate-slide-up">
        <div className="mb-8 text-center">
          <EurekupLogo className="mx-auto h-10 w-10 object-contain" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            {mode === "signin" ? "Bienvenido" : "Crea tu cuenta"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin" ? "Accede para continuar" : "Empieza con 5 GB gratis"}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <Field label="Nombre" value={name} onChange={setName} placeholder="Tu nombre" />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="tu@email.com"
            autoComplete="email"
          />
          <Field
            label="Contraseña"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={mode === "signup" ? "Mínimo 8 caracteres" : "Tu contraseña"}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />

          {mode === "signup" && (
            <div className="glass-subtle space-y-1.5 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Tu contraseña debe contener
              </p>
              <PassRule ok={checks.length} text="Al menos 8 caracteres" />
              <PassRule ok={checks.upper} text="Una letra mayúscula (A–Z)" />
              <PassRule ok={checks.lower} text="Una letra minúscula (a–z)" />
              <PassRule ok={checks.number} text="Un número (0–9)" />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (mode === "signup" && !allPass)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-95 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "Regístrate" : "Inicia sesión"}
          </button>
        </div>
      </div>
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
