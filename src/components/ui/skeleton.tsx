import { cn } from "./cn";

/** Placeholder block for loading content. Hidden from assistive tech; pair with a status message. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

const SPINNER_SIZES = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-6 w-6" } as const;

/**
 * Monochrome loading indicator in `currentColor`. `ring` for buttons and inline status,
 * `dots` for conversational waits (chat). With `label` it is announced (role=status);
 * without, it is decorative. Motion stops under prefers-reduced-motion (globals.css).
 */
export function Spinner({
  className,
  label,
  size,
  variant = "ring",
}: {
  className?: string;
  label?: string;
  size?: keyof typeof SPINNER_SIZES;
  variant?: "ring" | "dots";
}) {
  const a11y = label ? ({ role: "status", "aria-label": label } as const) : ({ "aria-hidden": true } as const);
  if (variant === "dots") {
    return (
      <span {...a11y} data-spinner="dots" className={cn("inline-flex items-center gap-1", className)}>
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    );
  }
  return (
    <svg {...a11y} viewBox="0 0 24 24" data-spinner="ring" className={cn("shrink-0 animate-spin", size && SPINNER_SIZES[size], className)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
