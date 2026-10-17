"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide decorative background: a faint warm glow near the top and a soft spotlight that
 * follows the pointer. Pure CSS gradients driven by two CSS variables (--mx / --my), updated at
 * most once per animation frame. No framer-motion, no Spline: this ships on every page.
 * Styles: `.nvx-ambient` in globals.css. Reduced motion and touch devices keep it static.
 */
export function BackgroundGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)");
    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (still.matches || e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      el.dataset.active = "true";
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      el.dataset.active = "false";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="nvx-ambient" aria-hidden="true" data-active="false">
      <div className="nvx-ambient__spot" />
    </div>
  );
}
