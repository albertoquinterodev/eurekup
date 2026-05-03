import logo from "@/assets/eurekup-mark.png";

interface EurekupLogoProps {
  className?: string;
  alt?: string;
}

/**
 * Theme-adaptive logo: the source PNG is black on transparent. In dark mode we
 * invert it to white via CSS filter so it works on every surface without ever
 * loading two assets.
 */
export function EurekupLogo({ className = "h-8 w-auto", alt = "Eurekup" }: EurekupLogoProps) {
  return (
    <img
      src={logo}
      alt={alt}
      className={`select-none object-contain dark:invert ${className}`}
      draggable={false}
    />
  );
}
