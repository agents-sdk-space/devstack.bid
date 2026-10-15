import type { Metadata } from "next";
import { ProjectPage } from "@/components/projects/project-page";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = { title: "Project", robots: { index: false } };

export default async function ProjectRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SettingsNav />
      <ProjectPage id={id} />
    </>
  );
}
