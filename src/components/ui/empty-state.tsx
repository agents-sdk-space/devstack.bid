import type { ReactNode } from "react";
import { cn } from "./cn";

export function EmptyState({
  icon = "✨",
  title,
  description,
  action,
  tone = "neutral",
  headingAs: Heading = "h3",
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "danger";
  /** Heading level for the title (use h1 when the empty state is the whole page). */
  headingAs?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center",
        tone === "danger" ? "border-danger/40 bg-danger-soft" : "border-border-strong bg-surface",
        className
      )}
    >
      <div aria-hidden className={cn("grid h-12 w-12 place-items-center rounded-full text-2xl", tone === "danger" ? "bg-surface" : "bg-surface-2")}>
        {icon}
      </div>
      <Heading className={cn("mt-4 text-base font-semibold text-fg", Heading === "h1" && "text-2xl", tone === "danger" && "text-danger-fg")}>{title}</Heading>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
