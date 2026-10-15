import type { Metadata } from "next";
import { CliKeys } from "@/components/cli-keys";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = {
  title: "CLI setup",
  description: "Create a DevStack CLI key and set up a deploy-ready project from the macOS terminal.",
};

export default function CliSettingsPage() {
  return (
    <>
      <SettingsNav />
      <CliKeys />
    </>
  );
}
