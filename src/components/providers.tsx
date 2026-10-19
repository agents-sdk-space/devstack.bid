"use client";

import type { ReactNode } from "react";
import { ToastProvider, TooltipProvider } from "@/components/ui";
import { useLang } from "./prefs";
import { PrefsSync } from "./prefs-sync";

/** App-wide UI providers: toasts (bilingual dismiss label) and tooltips. */
export function Providers({ children }: { children: ReactNode }) {
  const { t } = useLang();
  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider closeLabel={t("toast.dismiss")}>
        <PrefsSync />
        {children}
      </ToastProvider>
    </TooltipProvider>
  );
}
