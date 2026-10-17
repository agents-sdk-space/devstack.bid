"use client";

import { Boxes, Rocket, TerminalSquare } from "lucide-react";
import { GlowCard } from "@/components/ui/spotlight-card";

const ITEMS = [
  { icon: TerminalSquare, title: "Pick a stack", body: "Choose a template or describe your app. Every setup command, in order." },
  { icon: Boxes, title: "Add what you need", body: "Runtimes, databases, auth and tests as add-ons. Drag to reorder steps." },
  { icon: Rocket, title: "Ship it", body: "Copy, download or open in the Builder. Deploy when you are ready." },
];

export function GlowCardsDemo() {
  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-between">
      {ITEMS.map(({ icon: Icon, title, body }) => (
        <GlowCard key={title} glowColor="orange" size="md" className="w-full max-w-xs sm:w-64">
          <div className="flex flex-col justify-end gap-3 self-end">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface-2 text-fg">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="text-lg font-semibold text-fg">{title}</h3>
            <p className="text-sm leading-relaxed text-muted">{body}</p>
          </div>
        </GlowCard>
      ))}
    </div>
  );
}
