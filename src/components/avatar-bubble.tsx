import { useEffect, useState } from "react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  /** true = online (green), false = offline (gray), undefined = no indicator */
  online?: boolean;
}

const sizes = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
};

function hueFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ name, url, size = "md", online }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const showImg = !!url && !broken;
  const hue = hueFor(name || "?");
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full border border-glass-border font-semibold uppercase tracking-wide",
          sizes[size]
        )}
        style={
          showImg
            ? undefined
            : { backgroundColor: `oklch(0.55 0.12 ${hue} / 0.35)`, color: "var(--foreground)" }
        }
      >
        {showImg ? (
          <img
            src={url!}
            alt={name}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{initials(name || "?")}</span>
        )}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background",
            online ? "bg-success" : "bg-muted-foreground/60"
          )}
          aria-label={online ? "online" : "offline"}
        />
      )}
    </div>
  );
}
