import { cn } from "./cn";

/** Small inline icons (decorative: aria-hidden). Size follows the font size via 1em. */
export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("h-[1em] w-[1em]", className)} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 3.5 3.5" />
    </svg>
  );
}
