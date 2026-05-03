import { Link, useLocation } from "@tanstack/react-router";
import { MessagesSquare, Users, FolderClosed, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/app/chats", label: "Chats", icon: MessagesSquare },
  { to: "/app/contacts", label: "Contactos", icon: Users },
  { to: "/app/storage", label: "Archivos", icon: FolderClosed },
  { to: "/app/settings", label: "Ajustes", icon: Settings },
] as const;

export function BottomNav() {
  const location = useLocation();
  return (
    <nav className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 safe-bottom max-w-[calc(100vw-1rem)]">
      <div className="frost-surface flex items-center gap-1 rounded-full border border-glass-border p-1.5 shadow-elevated backdrop-blur-2xl backdrop-saturate-200">
        {items.map((it) => {
          const active = location.pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 sm:w-auto sm:px-4 sm:gap-2",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-glass"
              )}
              aria-label={it.label}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="hidden text-sm font-medium sm:inline">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
