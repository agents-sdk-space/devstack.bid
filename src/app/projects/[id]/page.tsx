import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectPage } from "@/components/projects/project-page";
import { SettingsNav } from "@/components/settings-nav";

export const instant = false;

export const metadata: Metadata = { title: "Project", robots: { index: false } };

async function ProjectById({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectPage id={id} />;
}

export default function ProjectRoute({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SettingsNav />
      <Suspense fallback={null}>
        <ProjectById params={params} />
      </Suspense>
    </>
  );
}
