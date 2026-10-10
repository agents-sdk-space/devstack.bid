"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { Check } from "lucide-react";

export interface StepperItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
}

/**
 * Horizontal (md+) / vertical (mobile) progress stepper. Items are buttons when `onStepChange`
 * is given; the current one has aria-current="step". Completed = index < current.
 */
export function Stepper({
  items,
  current,
  onStepChange,
  label = "Progress",
  className,
}: {
  items: StepperItem[];
  current: number;
  onStepChange?: (index: number) => void;
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex items-center">
        {items.map((item, i) => {
          const state = i < current ? "complete" : i === current ? "current" : "upcoming";
          const inner = (
            <>
              <span
                aria-hidden
                className={cn(
                  "motion-base grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold",
                  state === "complete" && "border-primary bg-primary text-primary-fg",
                  state === "current" && "border-primary bg-primary-soft text-primary-soft-fg",
                  state === "upcoming" && "border-border-strong text-subtle"
                )}
              >
                {state === "complete" ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : i + 1}
              </span>
              <span className={cn("min-w-0 text-left", state === "current" ? "block" : "sr-only md:not-sr-only md:block")}>
                <span className={cn("block whitespace-nowrap text-sm font-semibold", state === "upcoming" ? "text-muted" : "text-fg")}>{item.label}</span>
                {item.description && <span className="hidden text-xs text-subtle sm:block">{item.description}</span>}
              </span>
              <span className="sr-only">
                {state === "complete" ? "(completed)" : state === "current" ? "(current)" : ""}
              </span>
            </>
          );
          return (
            <li key={item.id} className={cn("flex items-center", (state === "current" || i < items.length - 1) && "flex-1", "md:flex-1")}>
              {onStepChange ? (
                <button
                  type="button"
                  onClick={() => onStepChange(i)}
                  aria-current={state === "current" ? "step" : undefined}
                  className="focus-ring motion-fast flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2 md:w-full"
                >
                  {inner}
                </button>
              ) : (
                <div aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-3 p-2">
                  {inner}
                </div>
              )}
              {i < items.length - 1 && (
                <span aria-hidden className={cn("mx-1 h-0.5 min-w-3 flex-1 rounded md:mx-2", i < current ? "bg-primary" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
