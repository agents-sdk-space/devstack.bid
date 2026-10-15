"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "focus-ring motion-fast inline-flex items-center gap-1.5 min-h-10 rounded-md px-2.5 py-1 text-sm sm:min-h-0 font-medium text-muted hover:text-fg",
        "data-[state=active]:bg-raised data-[state=active]:text-fg data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("focus-ring mt-4 rounded-md data-[state=active]:animate-fade-in", className)} {...props} />;
}
