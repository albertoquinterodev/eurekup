import { Search, MoreVertical, Bookmark, UserPen, Settings as SettingsIcon, Sun, Moon, Hash } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { EurekupLogo } from "@/components/eurekup-logo";
import { NotificationsBell } from "@/components/notifications-bell";
import { useTheme } from "@/hooks/use-theme";

interface AppBarProps {
  title: string;
  subtitle?: string;
  onSearch?: () => void;
  rightSlot?: ReactNode;
  /** Hide the kebab menu (e.g. inside a chat room with its own actions). */
  hideMenu?: boolean;
}

export function AppBar({ title, subtitle, onSearch, rightSlot, hideMenu }: AppBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 safe-top">
      <div className="glass mx-3 mt-3 flex items-center justify-between gap-3 rounded-3xl px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <EurekupLogo className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onSearch && (
            <button
              onClick={onSearch}
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-glass-strong hover:text-foreground"
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
          {rightSlot}
          {!hideMenu && (
            <div className="relative" ref={ref}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-glass-strong hover:text-foreground"
                aria-label="Menú"
                aria-expanded={open}
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {open && (
                <div className="glass-strong absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-2xl p-1 animate-slide-up">
                  <MenuItem
                    icon={theme === "dark" ? Sun : Moon}
                    label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
                    onClick={() => { toggle(); setOpen(false); }}
                  />
                  <MenuItem
                    icon={Hash}
                    label="Nuevo canal"
                    onClick={() => { setOpen(false); navigate({ to: "/app/channels" }); }}
                  />
                  <MenuItem
                    icon={Bookmark}
                    label="Mensajes guardados"
                    onClick={() => { setOpen(false); navigate({ to: "/app/chats" }); }}
                  />
                  <MenuItem
                    icon={UserPen}
                    label="Editar perfil"
                    onClick={() => { setOpen(false); navigate({ to: "/app/settings" }); }}
                  />
                  <MenuItem
                    icon={SettingsIcon}
                    label="Ajustes"
                    onClick={() => { setOpen(false); navigate({ to: "/app/settings" }); }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-glass"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
    </button>
  );
}
