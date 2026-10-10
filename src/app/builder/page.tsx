import type { Metadata } from "next";
import { BuilderLoader } from "@/components/builder-loader";

export const metadata: Metadata = {
  title: "Stack Builder + AI Agent",
  description: "Compose ordered, de-duplicated setup commands for Node.js and Python apps, or let the AI agent plan your stack.",
};

export default function BuilderPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <BuilderLoader />
    </div>
  );
}
