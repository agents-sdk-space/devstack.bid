"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Accessible modal: focus trap, Escape to close, scroll lock, labelled by title/description.
 * `side="right"` renders a sheet (used for mobile navigation).
 */
export function DialogContent({
  title,
  description,
  children,
  className,
  side = "center",
  hideTitle = false,
  closeLabel = "Close",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: ReactNode;
  description?: ReactNode;
  side?: "center" | "right";
  hideTitle?: boolean;
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 border border-border bg-surface text-fg shadow-lg focus:outline-none",
          side === "center"
            ? "left-1/2 top-1/2 max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6 data-[state=open]:animate-pop-in"
            : "inset-y-0 right-0 h-full w-[min(20rem,85vw)] overflow-y-auto rounded-l-xl p-5 data-[state=open]:animate-sheet-in",
          className
        )}
        {...props}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className={cn("text-lg font-semibold", hideTitle && "sr-only")}>{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="focus-ring motion-fast -mr-2 -mt-1 grid h-8 w-8 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
            aria-label={closeLabel}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
