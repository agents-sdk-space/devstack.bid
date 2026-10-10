"use client";

import { useId } from "react";
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
  options: readonly { value: T; label: string }[];
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
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "motion-fast cursor-pointer rounded-md font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
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
