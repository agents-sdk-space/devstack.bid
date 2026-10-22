import { Suspense } from "react";
import type { Metadata } from "next";
import { NewProject, type TemplateOption } from "@/components/projects/new-project";
import { SettingsNav } from "@/components/settings-nav";
import { TEMPLATES } from "@/data/templates";
import { profileById } from "@/lib/deploy/templates";

export const metadata: Metadata = { title: "New Project", description: "Import a Git repository, upload files or start from a template.", robots: { index: false } };

type NewQuery = { mode?: string | string[] };

export default function NewProjectPage({ searchParams }: { searchParams: Promise<NewQuery> }) {
  const templates: TemplateOption[] = TEMPLATES.filter((t) => (profileById(t.id)?.path ?? "none") !== "none").map((t) => ({ id: t.id, name: t.name, target: profileById(t.id)!.target }));
  return (
    <>
      <SettingsNav />
      <Suspense fallback={<NewProject templates={templates} />}>
        <NewProjectFromQuery templates={templates} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewProjectFromQuery({ templates, searchParams }: { templates: TemplateOption[]; searchParams: Promise<NewQuery> }) {
  const { mode } = await searchParams;
  return <NewProject templates={templates} initialMode={typeof mode === "string" ? mode : null} />;
}
