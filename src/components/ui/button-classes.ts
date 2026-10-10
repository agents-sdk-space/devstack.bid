import { cn } from "./cn";

/** Server-safe: style a <Link> or <a> like a Button without importing a client component. */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary-hover",
  secondary: "bg-surface text-fg border border-border-strong shadow-sm hover:bg-surface-2",
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
    "focus-ring motion-fast inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className
  );
}
