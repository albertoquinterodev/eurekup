import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-strong max-w-md rounded-3xl p-10 text-center">
        <h1 className="text-7xl font-bold tracking-tight">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Esta página no existe o se ha movido.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Ir al inicio
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
      { name: "theme-color", content: "#1f1f1f" },
      { title: "Eurekup — Mensajería y archivos en uno" },
      {
        name: "description",
        content:
          "Nebula combina chats en tiempo real con almacenamiento de archivos. Diseño Liquid Glass minimalista, canales públicos y privados, y +1GB por cada amigo invitado.",
      },
      { property: "og:title", content: "Eurekup — Mensajería y archivos en uno" },
      {
        property: "og:description",
        content: "Chats, archivos y canales en una experiencia premium.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Eurekup — Mensajería y archivos en uno" },
      { name: "description", content: "Teledrive is a web app that merges Telegram's messaging with Google Drive's file management." },
      { property: "og:description", content: "Teledrive is a web app that merges Telegram's messaging with Google Drive's file management." },
      { name: "twitter:description", content: "Teledrive is a web app that merges Telegram's messaging with Google Drive's file management." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e145e321-d0d2-4fea-a29a-c06bc6c77b81/id-preview-478bd498--557cc3de-693d-4ad6-8626-398eec50cd33.lovable.app-1777588049820.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e145e321-d0d2-4fea-a29a-c06bc6c77b81/id-preview-478bd498--557cc3de-693d-4ad6-8626-398eec50cd33.lovable.app-1777588049820.png" },
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
    <AuthProvider>
      <Outlet />
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          className: "!glass-strong !rounded-2xl !text-foreground !border-glass-border",
        }}
      />
    </AuthProvider>
  );
}
