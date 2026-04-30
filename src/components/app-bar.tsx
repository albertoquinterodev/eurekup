import { Search, MoreVertical } from "lucide-react";
import { type ReactNode } from "react";

interface AppBarProps {
  title: string;
  subtitle?: string;
  onSearch?: () => void;
  rightSlot?: ReactNode;
}

export function AppBar({ title, subtitle, onSearch, rightSlot }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 safe-top">
      <div className="glass mx-3 mt-3 flex items-center justify-between gap-3 rounded-3xl px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onSearch && (
            <button
              onClick={onSearch}
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-glass-strong hover:text-foreground"
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
          {rightSlot ?? (
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-glass-strong hover:text-foreground"
              aria-label="Menú"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
