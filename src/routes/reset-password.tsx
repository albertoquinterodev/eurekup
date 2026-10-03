import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EurekupLogo } from "@/components/eurekup-logo";
import { useT } from "@/lib/i18n";
import { isStrongPassword } from "@/lib/password";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Restablecer contraseña · EurekUp" },
      { name: "description", content: "Crea una nueva contraseña para tu cuenta de EurekUp." },
      { property: "og:title", content: "Restablecer contraseña · EurekUp" },
      { property: "og:description", content: "Crea una nueva contraseña para tu cuenta de EurekUp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { t } = useT();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => s.session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStrongPassword(pw)) return toast.error(t("auth.mustContain"));
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.resetDone"));
    navigate({ to: "/app/chats" });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <form onSubmit={save} className="glass-strong w-full max-w-md space-y-4 rounded-[2rem] p-8">
        <EurekupLogo className="mx-auto h-10 w-10 object-contain" />
        <h1 className="text-center text-2xl font-semibold">{t("auth.resetTitle")}</h1>
        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">{t("auth.resetInvalid")}</p>
        ) : (
          <>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder={t("auth.passwordNewPh")}
                autoComplete="new-password"
                className="w-full rounded-2xl glass-subtle px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            <button
              disabled={loading || !isStrongPassword(pw)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.resetSave")}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
