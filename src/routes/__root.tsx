import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { I18nProvider, useT } from "@/lib/i18n";
import { PresenceProvider } from "@/hooks/use-presence";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  const { tr } = useT();
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass-strong max-w-md rounded-3xl p-10 text-center">
        <h1 className="text-7xl font-bold tracking-tight">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {tr("Esta página no existe o se ha movido.", "This page doesn't exist or has moved.")}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          {tr("Ir al inicio", "Go home")}
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0F172A" },
      { title: "Eurekup — Mensajería y archivos en uno" },
      {
        name: "description",
        content:
          "Eurekup combina chats en tiempo real con almacenamiento de archivos. Diseño Liquid Glass minimalista, canales públicos y privados, y +1GB por cada amigo invitado.",
      },
      { property: "og:title", content: "Eurekup — Mensajería y archivos en uno" },
      {
        property: "og:description",
        content: "Chats, archivos y canales en una experiencia premium.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Eurekup — Mensajería y archivos en uno" },
      { name: "twitter:description", content: "Chats, archivos y canales en una experiencia premium." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <PresenceProvider>
            <Outlet />
            <Toaster />
          </PresenceProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
