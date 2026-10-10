import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateDetail } from "@/components/template-detail";
import { getTemplate, TEMPLATES } from "@/data/templates";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: PageProps<"/templates/[id]">): Promise<Metadata> {
  const { id } = await params;
  const template = getTemplate(id);
  return template ? { title: template.name.en, description: template.summary.en } : {};
}

export default async function TemplatePage({ params }: PageProps<"/templates/[id]">) {
  const { id } = await params;
  if (!getTemplate(id)) notFound();
  return <TemplateDetail id={id} />;
}
