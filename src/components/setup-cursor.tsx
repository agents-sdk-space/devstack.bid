"use client";

import { Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { Button, Dialog, DialogContent, DialogTrigger, Textarea } from "@/components/ui";
import { askPrompt, createPrompt, CURSOR_DOWNLOAD_URL, cursorPromptUrl } from "@/lib/cursor-link";
import { useLang } from "./prefs";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

/** Create-or-ask form. Used on /learn and inside the header dialog. */
export function CursorSetupPanel() {
  const { t, lang } = useLang();
  const questionId = useId();
  const [question, setQuestion] = useState("");
  const trimmed = question.trim();
  const createHref = cursorPromptUrl(createPrompt(lang));
  const askHref = trimmed ? cursorPromptUrl(askPrompt(lang, trimmed)) : "";

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-fg">{t("cursor.createTitle")}</h3>
        <p className="text-sm leading-relaxed text-muted">{t("cursor.createBody")}</p>
        <Button asChild variant="primary">
          <a href={createHref} {...external}>
            <Sparkles className="h-4 w-4" aria-hidden />
            {t("cursor.createAction")}
            <span className="sr-only"> ({t("cursor.openLabel")})</span>
          </a>
        </Button>
      </section>
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-fg">{t("cursor.askTitle")}</h3>
        <p className="text-sm leading-relaxed text-muted">{t("cursor.askBody")}</p>
        <label htmlFor={questionId} className="block text-sm font-medium text-fg">
          {t("cursor.askLabel")}
        </label>
        <Textarea
          id={questionId}
          value={question}
          maxLength={800}
          placeholder={t("cursor.askPlaceholder")}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {askHref ? (
          <Button asChild variant="secondary">
            <a href={askHref} {...external}>
              {t("cursor.askAction")}
              <span className="sr-only"> ({t("cursor.openLabel")})</span>
            </a>
          </Button>
        ) : (
          <Button variant="secondary" disabled>
            {t("cursor.askAction")}
          </Button>
        )}
      </section>
      <p className="text-sm leading-relaxed text-muted">{t("cursor.review")}</p>
      <p className="text-sm leading-relaxed text-muted">
        {t("cursor.downloadBody")}{" "}
        <a href={CURSOR_DOWNLOAD_URL} className="link" {...external}>
          {t("cursor.download")}
          <span className="sr-only"> ({t("cursor.openLabel")})</span>
        </a>
      </p>
    </div>
  );
}

/** Header, menu, and footer control that opens the create-or-ask dialog. */
export function SetupCursor({ appearance = "header" }: { appearance?: "header" | "menu" }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  const trigger =
    appearance === "menu" ? (
      <Button variant="secondary" className="w-full justify-start">
        <Sparkles className="h-4 w-4" aria-hidden />
        {t("cursor.dialogTitle")}
      </Button>
    ) : (
      <Button variant="secondary" size="icon" aria-label={t("cursor.setup")} title={t("cursor.setup")}>
        <Sparkles className="h-4 w-4" aria-hidden />
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={t("cursor.dialogTitle")} description={t("cursor.dialogBody")} closeLabel={t("nav.close")}>
        <CursorSetupPanel />
      </DialogContent>
    </Dialog>
  );
}
