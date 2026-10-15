import type { Metadata } from "next";
import { ProjectsList } from "@/components/projects/projects-list";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = { title: "Projects", description: "Repositories DevStack created in your GitHub account.", robots: { index: false } };

export default function ProjectsPage() {
  return (
    <>
      <SettingsNav />
      <ProjectsList />
    </>
  );
}
