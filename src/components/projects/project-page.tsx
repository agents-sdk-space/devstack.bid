"use client";

import { ProjectDetail } from "./project-detail";

/** Composes the project page; deploy panels plug in here. */
export function ProjectPage({ id }: { id: string }) {
  return <ProjectDetail id={id} />;
}
