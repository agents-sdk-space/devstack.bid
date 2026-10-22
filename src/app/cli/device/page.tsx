import type { Metadata } from "next";
import { DeviceApprove } from "@/components/cli-device-approve";

export const metadata: Metadata = { title: "Approve CLI sign-in", robots: { index: false } };

/** The code is never taken from the URL: the user types what their own terminal shows (anti-phishing). */
export default function CliDevicePage() {
  return <DeviceApprove />;
}
