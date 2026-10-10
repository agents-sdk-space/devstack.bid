"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Bell, Check, Info, TriangleAlert, type LucideIcon } from "lucide-react";

export type ToastVariant = "default" | "success" | "error" | "info";
export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}
interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((t: ToastOptions) => void) | null>(null);

const ICON: Record<ToastVariant, LucideIcon> = { default: Bell, success: Check, error: TriangleAlert, info: Info };
const TONE: Record<ToastVariant, string> = {
  default: "bg-surface-3 text-fg",
  success: "bg-success-soft text-success-fg",
  error: "bg-danger-soft text-danger-fg",
  info: "bg-info-soft text-info-fg",
};

/** Wrap the app once. Toasts are announced politely to screen readers (errors assertively). */
export function ToastProvider({ children, closeLabel = "Dismiss" }: { children: ReactNode; closeLabel?: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: ToastOptions) => {
    setItems((list) => [...list.slice(-3), { ...t, id: Date.now() + Math.random() }]);
  }, []);
  const remove = (id: number) => setItems((list) => list.filter((i) => i.id !== id));
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={3500}>
        {children}
        {items.map((t) => {
          const variant = t.variant ?? "default";
          return (
            <ToastPrimitive.Root
              key={t.id}
              type={variant === "error" ? "foreground" : "background"}
              duration={t.duration}
              onOpenChange={(open) => !open && remove(t.id)}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 pr-10 text-fg shadow-lg data-[state=open]:animate-slide-in data-[swipe=end]:opacity-0"
            >
              <span aria-hidden className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", TONE[variant])}>
                {(() => {
                  const Icon = ICON[variant];
                  return <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />;
                })()}
              </span>
              <div className="min-w-0">
                <ToastPrimitive.Title className="text-sm font-semibold">{t.title}</ToastPrimitive.Title>
                {t.description && <ToastPrimitive.Description className="mt-0.5 text-xs text-muted">{t.description}</ToastPrimitive.Description>}
              </div>
              <ToastPrimitive.Close
                aria-label={closeLabel}
                className="focus-ring absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-subtle hover:bg-surface-2"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast({ title: "Copied", variant: "success" })` */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** Like useToast, but returns a no-op outside a provider (for library components such as CodeBlock). */
export function useToastOptional() {
  return useContext(ToastContext) ?? (() => {});
}
