import { cn } from "./cn";

/** Server-safe: style a <Link> or <a> like a Button without importing a client component. */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg border border-primary font-semibold uppercase tracking-wider hover:bg-primary-hover hover:border-primary-hover",
  secondary: "bg-transparent text-fg border border-border-strong hover:border-primary hover:text-primary",
  outline: "border border-primary text-primary hover:bg-primary-soft",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger-hover dark:text-bg",
  soft: "bg-primary-soft text-primary-soft-fg hover:brightness-95 dark:hover:brightness-125",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
  md: "h-10 gap-2 rounded-md px-4 text-sm",
  lg: "h-12 gap-2 rounded-lg px-6 text-base",
  icon: "h-9 w-9 rounded-md text-sm",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "focus-ring motion-fast inline-flex select-none items-center justify-center whitespace-nowrap font-mono font-medium",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    // Terminal flavour: [ BRACKETED ] labels on text buttons (decorative, silent for screen readers).
    size !== "icon" && size !== "sm" && (variant === "primary" || variant === "secondary" || variant === "outline") && "term-bracket",
    className
  );
}
