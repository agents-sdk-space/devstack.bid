"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export function Checkbox({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className={cn("flex items-start gap-2.5", disabled && "opacity-50")}>
      <CheckboxPrimitive.Root
        id={cid}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-describedby={description ? `${cid}-d` : undefined}
        className="focus-ring motion-fast mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-sm border border-border-strong bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <CheckboxPrimitive.Indicator className="text-primary-fg">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="m3.5 8.5 3 3 6-7" />
          </svg>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div className="text-sm leading-snug">
        <label htmlFor={cid} className={cn("font-medium text-fg", !disabled && "cursor-pointer")}>
          {label}
        </label>
        {description && (
          <p id={`${cid}-d`} className="text-xs text-subtle">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("inline-flex items-center gap-2.5", disabled && "opacity-50")}>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="focus-ring motion-base relative inline-flex h-6 w-11 shrink-0 items-center rounded-sm border border-border-strong bg-surface-3 data-[state=checked]:bg-primary"
      >
        <SwitchPrimitive.Thumb className="motion-base block h-4 w-4 translate-x-[3px] rounded-xs bg-fg data-[state=checked]:bg-primary-fg data-[state=checked]:translate-x-[23px]" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="cursor-pointer text-sm font-medium">
        {label}
      </label>
    </div>
  );
}
