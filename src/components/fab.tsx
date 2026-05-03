import { Plus, type LucideIcon } from "lucide-react";

interface FabProps {
  onClick: () => void;
  icon?: LucideIcon;
  label?: string;
}

export function Fab({ onClick, icon: Icon = Plus, label = "Nuevo" }: FabProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-elevated backdrop-blur-2xl backdrop-saturate-200 transition-all duration-200 hover:scale-105 active:scale-95"
      aria-label={label}
    >
      <Icon className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
