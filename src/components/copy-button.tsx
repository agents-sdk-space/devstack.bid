"use client";

import { CodeBlock as UiCodeBlock, type CodeBlockProps } from "@/components/ui";
import { useLang } from "./prefs";

export { copyText } from "@/components/ui";

/** App-level CodeBlock: bilingual labels + a toast on copy. */
export function CodeBlock(props: Omit<CodeBlockProps, "copyLabel" | "copiedLabel" | "toastTitle">) {
  const { t } = useLang();
  return <UiCodeBlock copyLabel={t("step.copy")} copiedLabel={t("step.copied")} toastTitle={t("toast.copied")} {...props} />;
}
