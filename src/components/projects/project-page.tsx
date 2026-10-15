"use client";

import { Download } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { Credits } from "@/components/credits/credits";
import { creditsFor } from "@/lib/deploy/credits";
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
            {x.profile.path !== "none" && (
              <a href={`/api/projects/${encodeURIComponent(p.id)}/zip`} className={buttonClasses("secondary", "md", "mt-4 self-start")} download>
                <Download className="h-4 w-4" aria-hidden />Download deploy zip
              </a>
            )}
            <Credits items={creditsFor(x.profile.id)} className="mt-6" />
          </>
        ) : null
      }
    </ProjectDetail>
  );
}
