"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./skeleton";

export { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-classes";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-classes";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
  /** Render the child element (e.g. a Next.js <Link>) with button styles. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, asChild = false, className, children, disabled, type, ...props },
  ref
) {
  if (asChild) {
    return (
      <Slot ref={ref} className={buttonClasses(variant, size, className)} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});
