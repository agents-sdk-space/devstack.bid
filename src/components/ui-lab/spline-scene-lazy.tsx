"use client";

import dynamic from "next/dynamic";

// Client-only: the Spline runtime (~MBs, WebGL) never runs during SSR / in the Worker and is
// split into its own chunk that only /ui-lab requests.
export const SplineSceneLazy = dynamic(() => import("./spline-scene-basic").then((m) => m.SplineSceneBasic), {
  ssr: false,
  loading: () => (
    <div className="grid h-[500px] w-full place-items-center rounded-xl border border-border bg-black/[0.96]">
      <span className="loader" />
    </div>
  ),
});
