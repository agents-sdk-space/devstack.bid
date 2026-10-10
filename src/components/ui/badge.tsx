import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "outline";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary-soft text-primary-soft-fg",
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
  info: "bg-info-soft text-info-fg",
  outline: "border border-border-strong text-muted",
};

export function Badge({
  variant = "neutral",
  size = "md",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
