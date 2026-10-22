import type { Metadata } from "next";
import { Suspense } from "react";
import { DeploymentDetail } from "@/components/deploy/deployment-detail";
import { SettingsNav } from "@/components/settings-nav";

export const instant = false;

export const metadata: Metadata = { title: "Deployment", robots: { index: false } };

async function DeploymentById({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeploymentDetail id={id} />;
}

export default function DeploymentRoute({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SettingsNav />
      <Suspense fallback={null}>
        <DeploymentById params={params} />
      </Suspense>
    </>
  );
}
