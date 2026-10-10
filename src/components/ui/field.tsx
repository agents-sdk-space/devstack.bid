"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const CONTROL =
  "focus-ring motion-fast w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger";

export type ControlSize = "sm" | "md" | "lg";
const HEIGHT: Record<ControlSize, string> = { sm: "h-8 text-xs", md: "h-10", lg: "h-12 text-base" };

export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: ControlSize; invalid?: boolean }>(
  function Input({ className, size = "md", invalid, ...props }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(CONTROL, HEIGHT[size], className)} {...props} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(CONTROL, "min-h-20 resize-y py-2", className)} {...props} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: ControlSize }>(
  function Select({ className, size = "md", children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(CONTROL, HEIGHT[size], "appearance-none pr-9", className)} {...props}>
          {children}
        </select>
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle">
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </div>
    );
  }
);

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-medium text-fg", className)}>
      {children}
    </label>
  );
}

/**
 * Label + control + hint/error, with ids wired for screen readers.
 * The render prop receives the props to spread onto the control.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
