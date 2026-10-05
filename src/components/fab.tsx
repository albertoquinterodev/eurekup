import { Plus, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";

interface FabProps {
  onClick: () => void;
  icon?: LucideIcon;
  label?: string;
}

export function Fab({ onClick, icon: Icon = Plus, label }: FabProps) {
  const { tr } = useT();
  const resolvedLabel = label ?? tr("Nuevo", "New");
  return (
    <button
      onClick={onClick}
      className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevated transition-all duration-200 hover:scale-105 active:scale-95"
      aria-label={resolvedLabel}
    >
      <Icon className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
