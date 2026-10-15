"use client";

import { DeployButtonPanel } from "./deploy-button-panel";
import { DirectDeployPanel } from "./direct-deploy-panel";
import { ProjectDetail } from "./project-detail";

/** Composes the project page; deploy panels plug in here. */
export function ProjectPage({ id }: { id: string }) {
  return (
    <ProjectDetail id={id}>
      {(p, x) =>
        p.repo && x.profile ? (
          <>
            <DeployButtonPanel projectId={p.id} repo={p.repo} repoPrivate={x.repoPrivate} profile={x.profile} />
            {x.profile.path !== "none" && <DirectDeployPanel projectId={p.id} profile={x.profile} />}
          </>
        ) : null
      }
    </ProjectDetail>
  );
}
