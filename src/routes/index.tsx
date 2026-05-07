import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MessagesSquare, FolderClosed, Sparkles, ArrowRight, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { EurekupLogo } from "@/components/eurekup-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app/chats" });
  }, [loading, user, navigate]);

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <section className="mx-auto max-w-6xl px-5 pt-6 pb-24 sm:pt-10">
        <nav className="glass mx-auto mb-12 flex max-w-3xl items-center justify-between gap-3 rounded-full px-3 py-2 sm:px-4 sm:py-2.5">
          <Link to="/" className="flex items-center gap-2 px-1">
            <EurekupLogo className="h-7 w-auto sm:h-8" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/auth"
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              Entrar
            </Link>
          </div>
        </nav>

        <div className="text-center">
          <span className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Liquid Glass · Realtime · Privado
          </span>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-7xl">
            Tus chats y archivos,
            <br />
            <span className="text-muted-foreground">en una sola app.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Mensajería en tiempo real con la potencia de un Drive privado.
            Diseño minimalista, controles claros y +1 GB gratis por cada amigo invitado.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-soft transition hover:scale-[1.02] active:scale-[0.98] sm:w-auto"
            >
              Empezar gratis <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="glass inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-base font-medium hover:bg-glass-strong sm:w-auto"
            >
              Ver más
            </a>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-3xl sm:mt-20">
          <div className="glass-strong rounded-[2rem] p-3">
            <div className="rounded-3xl bg-card/40 p-6">
              <div className="flex items-center gap-3 border-b border-glass-border pb-4">
                <div className="h-10 w-10 rounded-full bg-glass-strong" />
                <div className="flex-1">
                  <div className="h-3 w-32 rounded-full bg-glass-strong" />
                  <div className="mt-1.5 h-2 w-20 rounded-full bg-glass" />
                </div>
                <span className="text-xs text-muted-foreground">12:34</span>
              </div>
              <div className="mt-5 space-y-3">
                <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  Te paso el informe en un segundo ✨
                </div>
                <div className="max-w-[70%] glass rounded-2xl rounded-bl-md px-4 py-2.5 text-sm">
                  Genial, también necesito el PDF de ayer
                </div>
                <div className="ml-auto max-w-[70%] glass-strong rounded-2xl rounded-br-md px-4 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                      <FolderClosed className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">Informe-Q4-2026.pdf</p>
                      <p className="text-xs text-muted-foreground">2.4 MB · Drive</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 pb-32">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: MessagesSquare, title: "Chats en tiempo real", text: "Mensajes instantáneos con doble check, leídos en vivo, canales públicos y privados, y conversaciones 1-a-1." },
            { icon: FolderClosed, title: "Drive integrado", text: "Sube, organiza con carpetas anidadas, mueve por arrastre y comparte archivos sin salir de la app." },
            { icon: Lock, title: "Privado por diseño", text: "Cifrado en tránsito, RLS por usuario, moderación de canales y solicitudes de acceso." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-3xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-glass-strong">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {[
            { title: "Notificaciones en vivo", text: "Solicitudes, mensajes y aprobaciones de canal en tu campana." },
            { title: "Búsqueda global", text: "Encuentra chats, contactos y archivos al instante." },
            { title: "Premium hasta 5 TB", text: "Planes desde 1,99 €/mes con precios al estilo Drive." },
            { title: "Modo claro y oscuro", text: "Diseño Liquid Glass coherente con animaciones de 0,2 s." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-3xl p-5">
              <h4 className="font-semibold">{f.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="glass-strong mt-10 flex flex-col items-center gap-5 rounded-[2rem] p-8 text-center sm:flex-row sm:justify-between sm:p-10 sm:text-left">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">Invita y crece tu espacio</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Cada amigo verificado te suma <span className="text-foreground font-medium">+1 GB</span> · hasta <span className="text-foreground font-medium">20 GB</span> gratis.
            </p>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
          >
            Crear cuenta <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
