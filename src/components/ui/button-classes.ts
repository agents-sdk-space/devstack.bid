import { cn } from "./cn";

/** Server-safe: style a <Link> or <a> like a Button without importing a client component. */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary: "bg-surface-2 text-fg border border-border hover:bg-surface-3",
  outline: "border border-primary text-link hover:bg-primary-soft",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger-hover dark:text-bg",
  soft: "bg-primary-soft text-primary-soft-fg hover:brightness-95 dark:hover:brightness-125",
};

const SIZES: Record<ButtonSize, string> = {
  // Apple-style pills.
  sm: "h-8 gap-1.5 rounded-full px-3.5 text-xs",
  md: "h-10 gap-2 rounded-full px-5 text-sm",
  lg: "h-12 gap-2 rounded-full px-7 text-[17px]",
  icon: "h-9 w-9 rounded-full text-base",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "focus-ring motion-fast inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className
  );
}
