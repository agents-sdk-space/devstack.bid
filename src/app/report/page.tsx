import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportForm } from "@/components/aisite/report-form";

export const metadata: Metadata = { title: "Report a site", robots: { index: false } };

type Q = { site?: string | string[] };

export default function ReportPage({ searchParams }: { searchParams: Promise<Q> }) {
  return (
    <Suspense fallback={null}>
      <ReportFromQuery searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportFromQuery({ searchParams }: { searchParams: Promise<Q> }) {
  const { site } = await searchParams;
  return <ReportForm site={typeof site === "string" ? site.toLowerCase().slice(0, 100) : ""} />;
}
