import logo from "@/assets/eurekup-logo.jpg";

interface EurekupLogoProps {
  className?: string;
  /** Mark-only (just the "E" curve) — for square contexts like avatars/favicons */
  markOnly?: boolean;
  alt?: string;
}

export function EurekupLogo({ className = "h-8 w-auto", alt = "Eurekup" }: EurekupLogoProps) {
  return (
    <img
      src={logo}
      alt={alt}
      className={`select-none object-contain ${className}`}
      draggable={false}
    />
  );
}
