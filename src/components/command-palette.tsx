"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TEMPLATES } from "@/data/templates";
import { CATEGORY_LABELS } from "@/lib/i18n";
import { Dialog, DialogContent, Kbd, SearchIcon } from "@/components/ui";
import { useDarkMode, useLang } from "./prefs";
import { AppWindow, Blocks, BookOpen, Bot, FileText, FlaskConical, GraduationCap, House, Languages, Layers, LayoutGrid, MessagesSquare, Palette, SquareTerminal, SunMoon } from "lucide-react";
import docsNav from "@/generated/docs-nav.json";
import { templateTool, ToolTile } from "./brand/tool-icon";

const groupHeading =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle";
const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-fg data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-fg";

/** Global ⌘K / Ctrl+K palette: jump to pages and templates, toggle theme/language. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const { toggle } = useDarkMode();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("palette.title")} hideTitle closeLabel={t("nav.close")} className="max-w-xl p-3 sm:top-[20%] sm:translate-y-0 sm:p-4">
        <Command label={t("palette.title")} loop className="-mt-10">
          <div className="mr-10 flex items-center gap-2 border-b border-border pb-2">
            <SearchIcon className="text-subtle" />
            <Command.Input
              autoFocus
              placeholder={t("palette.placeholder")}
              className="h-9 w-full bg-transparent text-base text-fg outline-none placeholder:text-subtle"
            />
          </div>
          <Command.List className={`mt-1 max-h-[55vh] overflow-y-auto ${groupHeading}`}>
            <Command.Empty className="py-8 text-center text-sm text-muted">{t("palette.empty")}</Command.Empty>
            <Command.Group heading={t("palette.pages")}>
              {(
                [
                  ["/", House, t("nav.home")],
                  ["/learn", GraduationCap, t("nav.learn")],
                  ["/templates", LayoutGrid, t("nav.templates")],
                  ["/builder", Blocks, t("nav.builder")],
                  ["/chat", MessagesSquare, t("nav.chat")],
                  ["/chat/dev", SquareTerminal, t("nav.devChat")],
                  ["/factory", FlaskConical, t("nav.factory")],
                  ["/docs/platform", Layers, t("nav.functions")],
                  ["/docs/agents/cursor-caretakers", Bot, t("nav.agents")],
                  ["/studio/", AppWindow, t("nav.studio")],
                  ["/docs", BookOpen, t("nav.docs")],
                  ["/design", Palette, t("nav.design")],
                ] as const
              ).map(([href, Icon, label]) => (
                <Command.Item key={href} value={`page ${label} ${href}`} onSelect={() => run(() => (href === "/studio/" ? window.location.assign(href) : router.push(href)))} className={itemClass}>
                  <Icon className="h-4 w-4 text-subtle" aria-hidden />
                  {label}
                  <span className="ml-auto font-mono text-xs text-subtle">{href}</span>
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={t("palette.templates")}>
              {TEMPLATES.map((tpl) => (
                <Command.Item
                  key={tpl.id}
                  value={`template ${tpl.id} ${tpl.name.en} ${tpl.name.th} ${tpl.tags.join(" ")} ${tpl.keywords.join(" ")}`}
                  onSelect={() => run(() => router.push(`/templates/${tpl.id}`))}
                  className={itemClass}
                >
                  <ToolTile id={templateTool(tpl)} size="sm" />
                  <span className="min-w-0 truncate">{tpl.name[lang]}</span>
                  <span className="ml-auto shrink-0 text-xs text-subtle">{CATEGORY_LABELS[tpl.category][lang]}</span>
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={t("palette.build")}>
              {TEMPLATES.map((tpl) => (
                <Command.Item
                  key={`b-${tpl.id}`}
                  value={`build open builder ${tpl.id} ${tpl.name.en} ${tpl.name.th}`}
                  onSelect={() => run(() => router.push(`/builder#t=${tpl.id}`))}
                  className={itemClass}
                >
                  <Blocks className="h-4 w-4 text-subtle" aria-hidden />
                  <span className="min-w-0 truncate">
                    {t("catalog.build")}: {tpl.name[lang]}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={t("palette.docs")}>
              {docsNav.sections.flatMap((section) =>
                section.pages
                  .filter((p) => p.slug)
                  .map((p) => (
                    <Command.Item
                      key={`d-${p.slug}`}
                      value={`docs เอกสาร ${p.title} ${p.slug} ${section.label.en} ${section.label.th}`}
                      onSelect={() => run(() => router.push(`/docs/${p.slug}`))}
                      className={itemClass}
                    >
                      <FileText className="h-4 w-4 text-subtle" aria-hidden />
                      <span className="min-w-0 truncate">{p.navTitle}</span>
                      <span className="ml-auto shrink-0 text-xs text-subtle">{section.label[lang]}</span>
                    </Command.Item>
                  ))
              )}
            </Command.Group>
            <Command.Group heading={t("palette.actions")}>
              <Command.Item value="action theme dark light mode โหมดมืด" onSelect={() => run(toggle)} className={itemClass}>
                <SunMoon className="h-4 w-4 text-subtle" aria-hidden />
                {t("toggle.theme")}
              </Command.Item>
              <Command.Item value="action language thai english ภาษา" onSelect={() => run(() => setLang(lang === "en" ? "th" : "en"))} className={itemClass}>
                <Languages className="h-4 w-4 text-subtle" aria-hidden />
                {t("toggle.langLabel")}
              </Command.Item>
            </Command.Group>
          </Command.List>
          <p className="mt-2 border-t border-border pt-2 text-xs text-subtle">{t("palette.hint")}</p>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function PaletteTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useLang();
  const [mac, setMac] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only known on the client
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-keyshortcuts="Control+K Meta+K"
      aria-label={t("palette.open")}
      className="focus-ring motion-fast hidden h-9 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm text-muted hover:border-border-strong hover:text-fg md:inline-flex"
    >
      <SearchIcon />
      <span className="hidden gap-0.5 lg:ml-6 lg:flex" aria-hidden>
        <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
