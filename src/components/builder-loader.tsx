"use client";

import dynamic from "next/dynamic";
import { T } from "./prefs";

// The builder reads the URL hash and localStorage on startup, so it renders on the client only.
export const BuilderLoader = dynamic(() => import("./builder").then((m) => m.Builder), {
  ssr: false,
  loading: () => (
    <p className="py-20 text-center text-slate-500" role="status">
      <T k="builder.loading" />
    </p>
  ),
});
