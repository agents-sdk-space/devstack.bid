import type { Metadata } from "next";
import { EnvironmentPanel } from "@/components/environment-panel";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = {
  title: "Environment",
  description: "Secrets you chose to remember. Names and dates only; values are never shown.",
  robots: { index: false },
};

export default function EnvironmentSettingsPage() {
  return (
    <>
      <SettingsNav />
      <EnvironmentPanel />
    </>
  );
}
