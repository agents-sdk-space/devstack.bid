"use client";

import { useState } from "react";
import { Cloud } from "lucide-react";
import type { DeployCardData } from "@/lib/chat/events";
import { LiveUrl, RetryButton, StatusPill, useDeployment } from "../deploy/deploy-status";

/** Deploy status inside a chat reply (self-heal). Redeploy only happens when the customer clicks. */
export function DeployCard({ card }: { card: DeployCardData }) {
  const [retryId, setRetryId] = useState<string | null>(null);
  const retry = useDeployment(retryId);
  const status = retry?.status ?? card.status;
  const url = retry?.url ?? card.url;
  return (
    <div className="rounded-xl border border-border px-3 py-2 text-[13px]" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Cloud className="h-4 w-4 text-subtle" aria-hidden />
        <span className="font-medium text-fg">{card.repo ?? "Deploy"}</span>
        <StatusPill status={status} />
        <span className="font-mono text-[11px] text-subtle">fix {card.fixAttempts}/{card.maxFixAttempts}</span>
        {(retry?.errorCode ?? card.errorCode) && status === "failed" && <span className="font-mono text-[11px] text-subtle">{retry?.errorCode ?? card.errorCode}</span>}
      </div>
      {url && status === "live" && <div className="mt-1"><LiveUrl url={url} /></div>}
      {card.canRetry && !retryId && <div className="mt-2"><RetryButton projectId={card.projectId} refName={card.retryRef} onStarted={setRetryId} /></div>}
      {retry?.status === "failed" && <p className="mt-1 text-xs text-subtle">Still failing — ask me to read the new logs.</p>}
    </div>
  );
}
