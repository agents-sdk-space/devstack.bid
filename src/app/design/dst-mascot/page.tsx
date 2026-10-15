import type { Metadata } from "next";
import { DstMascot, DstMascotThemed } from "@/components/brand/dst-mascot";

export const metadata: Metadata = {
  title: "DST mascot (vector)",
  description: "Animated vector DevStack DST mascot — black and brand canvas modes.",
};

export default function DstMascotDesignPage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-300">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-12 px-6 py-16">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">DST vector mascot</h1>
          <p className="mt-2 max-w-lg text-sm text-zinc-400">
            สองโหมดสำหรับใช้งาน: พื้นดำ (dark) และพื้นชมพูแบรนด์ (light) — SVG เคลื่อนไหว กระพริบตา หันมองขวา
          </p>
        </header>

        <section className="grid w-full gap-10 md:grid-cols-2">
          <figure className="flex flex-col items-center gap-4 rounded-2xl bg-black p-10 ring-1 ring-white/10">
            <DstMascot size={280} canvas="black" label="DevStack DST — black canvas" />
            <figcaption className="text-center text-sm text-zinc-400">
              <code className="text-zinc-200">canvas=&quot;black&quot;</code>
              <span className="mt-1 block text-xs text-zinc-500">โหมดมืด / วางบนพื้นดำ</span>
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-4 rounded-2xl bg-white p-10">
            <DstMascot size={280} canvas="brand" label="DevStack DST — brand canvas" />
            <figcaption className="text-center text-sm text-zinc-600">
              <code className="text-zinc-900">canvas=&quot;brand&quot;</code>
              <span className="mt-1 block text-xs text-zinc-500">โหมดสว่าง / ไทล์สีชมพู #fb0fab</span>
            </figcaption>
          </figure>
        </section>

        <section className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 px-8 py-10">
          <p className="text-sm text-zinc-400">
            ใช้ <code className="text-zinc-200">DstMascotThemed</code> ให้สลับอัตโนมัติตาม class{" "}
            <code className="text-zinc-200">dark</code> บน <code className="text-zinc-200">html</code>
          </p>
          <DstMascotThemed size={160} label="DevStack DST mascot (themed)" />
        </section>
      </div>
    </main>
  );
}
