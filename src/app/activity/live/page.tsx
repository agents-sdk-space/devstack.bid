import type { Metadata } from "next";
import { LiveActivity } from "./live-activity";

export const metadata: Metadata = { title: "Live activity", robots: { index: false, follow: false } };

export default function Page() {
  return <LiveActivity />;
}
