"use client";

import { Checkbox } from "@/components/ui";
import { useLang } from "@/components/prefs";

/**
 * "Remember" checkbox next to a token input. Default off: the token is used once for this request and
 * never stored. On: it is encrypted (CREDENTIALS_KEY v2) into the user's Environment (/settings/environment).
 */
export function RememberToggle({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  const { lang } = useLang();
  const th = lang === "th";
  return (
    <Checkbox
      label={th ? "จำไว้" : "Remember"}
      description={
        checked ? (
          <>
            {th ? "เก็บแบบเข้ารหัสใน " : "Stored encrypted in "}
            <a href="/settings/environment" className="underline underline-offset-4 hover:text-fg">Environment</a>
          </>
        ) : th ? (
          "ใช้ครั้งเดียว ไม่บันทึก"
        ) : (
          "Used once, not saved"
        )
      }
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    />
  );
}
