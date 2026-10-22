import type { Metadata } from "next";
import { NewProject, type TemplateOption } from "@/components/projects/new-project";
import { SettingsNav } from "@/components/settings-nav";
import { TEMPLATES } from "@/data/templates";
import { profileById } from "@/lib/deploy/templates";

export const metadata: Metadata = { title: "New Project", description: "Import a Git repository, upload files or start from a template.", robots: { index: false } };

export default function NewProjectPage() {
  const templates: TemplateOption[] = TEMPLATES.filter((t) => (profileById(t.id)?.path ?? "none") !== "none").map((t) => ({ id: t.id, name: t.name, target: profileById(t.id)!.target }));
  return (
    <>
      <SettingsNav />
      <NewProject templates={templates} />
    </>
  );
}
