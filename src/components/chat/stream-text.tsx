"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/components/ui";
import { markdownStablePrefix, RevealBuffer, revealStepSize } from "@/lib/chat/stream-buffer";
import { MarkdownView } from "./markdown-view";

const MD_INTERVAL_MS = 33;

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function StreamTextAnimated({ text, streaming, className }: { text: string; streaming: boolean; className?: string }) {
  const buffer = useRef(new RevealBuffer());
  /** History / completed messages: show full text immediately (set on first render only). */
  const skipReveal = useRef(Boolean(text) && !streaming);
  const [visible, setVisible] = useState("");
  const [markdownSource, setMarkdownSource] = useState("");
  const lastMdAt = useRef(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const buf = buffer.current;
      buf.setTarget(text);
      if (skipReveal.current) {
        setVisible(text);
        setMarkdownSource(markdownStablePrefix(text));
        setAnimating(false);
        frame = requestAnimationFrame(tick);
        return;
      }
      const step = revealStepSize(buf.backlog());
      const changed = buf.advance(step);
      const v = buf.visible();
      if (changed) setVisible(v);
      const now = performance.now();
      const caught = buf.caughtUp();
      if (changed && (now - lastMdAt.current >= MD_INTERVAL_MS || caught)) {
        lastMdAt.current = now;
        setMarkdownSource(markdownStablePrefix(v));
      } else if (caught) {
        setMarkdownSource(markdownStablePrefix(text));
      }
      setAnimating(!caught);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, streaming]);

  const showCaret = (streaming || animating) && text.length > 0;

  return (
    <div className={cn("relative min-w-0", className)} aria-live="polite" aria-busy={streaming || undefined}>
      <MarkdownView text={markdownSource || visible} />
      {showCaret && (
        <span
          className="ml-0.5 inline-block h-[1em] w-[0.55ch] translate-y-[0.08em] animate-pulse bg-fg motion-reduce:animate-none"
          aria-hidden
        />
      )}
    </div>
  );
}

export function StreamText({
  text,
  streaming = false,
  className,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  const reduced = useSyncExternalStore(subscribeReduced, reducedMotion, () => false);

  if (reduced) {
    return (
      <div className={cn("relative min-w-0", className)} aria-live="polite">
        <MarkdownView text={text} />
      </div>
    );
  }

  return <StreamTextAnimated text={text} streaming={streaming} className={className} />;
}
