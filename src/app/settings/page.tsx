import type { Metadata } from "next";
import { GeneralSettings } from "@/components/settings/general-settings";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = {
  title: "Settings",
  description: "Theme, language and chat display preferences for DevStack. Saved in your browser, and synced to your account when you are signed in.",
};

export default function SettingsPage() {
  return (
    <>
      <SettingsNav />
      <GeneralSettings />
    </>
  );
}
