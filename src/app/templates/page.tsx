import type { Metadata } from "next";
import { Catalog } from "@/components/catalog";
import { T } from "@/components/prefs";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold">
        <T k="catalog.title" />
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">
        <T k="catalog.subtitle" />
      </p>
      <div className="mt-8">
        <Catalog />
      </div>
    </div>
  );
}
