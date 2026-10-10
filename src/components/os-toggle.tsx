"use client";

import { Segmented } from "@/components/ui";
import { useLang } from "./prefs";

export function OsToggle({ os, onChange }: { os: "posix" | "windows"; onChange: (os: "posix" | "windows") => void }) {
  const { t } = useLang();
  return (
    <Segmented
      legend={t("builder.os")}
      hideLegend
      size="sm"
      value={os}
      onChange={onChange}
      options={[
        { value: "posix", label: "macOS / Linux" },
        { value: "windows", label: "Windows PowerShell" },
      ]}
    />
  );
}
