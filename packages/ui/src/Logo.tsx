import { BRAND } from "./brand";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="af-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c7dfb" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0c1124" />
      <path
        d="M14 42c8 0 10-20 18-20s10 20 18 20"
        fill="none"
        stroke="url(#af-grad)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="14" cy="42" r="4.5" fill="#7c7dfb" />
      <circle cx="32" cy="22" r="4.5" fill="#9ea4ff" />
      <circle cx="50" cy="42" r="4.5" fill="#2dd4bf" />
    </svg>
  );
}

export function Logo({
  className = "",
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span
        className={`font-display text-lg font-semibold tracking-tight ${inverted ? "text-white" : "text-ink-900"}`}
      >
        {BRAND.name}
      </span>
    </span>
  );
}
