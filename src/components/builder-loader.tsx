"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";
import { T } from "./prefs";

function BuilderSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">
        <T k="builder.loading" />
      </span>
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

// The builder reads the URL hash and localStorage on startup, so it renders on the client only.
export const BuilderLoader = dynamic(() => import("./builder").then((m) => m.Builder), {
  ssr: false,
  loading: BuilderSkeleton,
});
