"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

/** Single-choice segmented control built on native radio inputs (arrow keys work out of the box). */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  disabled,
  hint,
  size = "md",
  hideLegend = false,
}: {
  legend: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  hint?: string;
  size?: "sm" | "md";
  /** Keep the legend for screen readers only. */
  hideLegend?: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className={cn(disabled && "opacity-50")}>
      <legend className={cn(hideLegend ? "sr-only" : "mb-1.5 text-sm font-medium text-fg")}>
        {legend} {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
      </legend>
      <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "motion-fast inline-flex cursor-pointer items-center gap-1.5 rounded-md font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              size === "sm" ? "min-h-10 px-2 py-0.5 text-xs sm:min-h-0" : "min-h-10 px-2.5 py-1 text-sm sm:min-h-0",
              value === o.value ? "bg-raised text-fg shadow-sm" : "text-muted hover:text-fg"
            )}
          >
            <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
