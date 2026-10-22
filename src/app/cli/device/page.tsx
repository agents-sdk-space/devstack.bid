import { Suspense } from "react";
import type { Metadata } from "next";
import { DeviceApprove } from "@/components/cli-device-approve";

export const metadata: Metadata = { title: "Approve CLI sign-in", robots: { index: false } };

type Query = { code?: string | string[] };

export default function CliDevicePage({ searchParams }: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<DeviceApprove />}>
      <FromQuery searchParams={searchParams} />
    </Suspense>
  );
}

async function FromQuery({ searchParams }: { searchParams: Promise<Query> }) {
  const { code } = await searchParams;
  return <DeviceApprove initialCode={typeof code === "string" ? code.replace(/[^A-Za-z0-9-]/g, "") : ""} />;
}
