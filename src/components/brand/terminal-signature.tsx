"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { BRAND_ICONS } from "./brand-icons.data";

/**
 * DevStack signature: a black terminal window with a thick white outline, a sidebar of four tool
 * tiles (JavaScript, curl, npm, PyPI) and a prompt that types real, working commands.
 * Pure HTML + inline SVG (simple-icons paths) sized with container-query units, so it is crisp at
 * any width. Light: a pointer-tracking radial glow on the outline (CSS vars --sig-x/--sig-y/--sig-o),
 * a text glow on hover, an idle pulse on the cursor. Touch: a tap lights the edge where you touched.
 * prefers-reduced-motion: static (no typing, no tracking, no pulse). Styles: globals.css `.sig*`.
 */

type TileId = "js" | "curl" | "npm" | "pypi";
export interface SignatureCommand {
  tile: TileId;
  text: string;
  /** Only published (real, working today) commands are shown. */
  published: boolean;
}

/**
 * Commands typed by the prompt, in order. Only entries with `published: true` are displayed; all
 * of them must be real commands that work today.
 */
export const SIGNATURE_COMMAND_CONFIG: SignatureCommand[] = [
  { tile: "js", text: "npm create vite@latest my-app", published: true },
  { tile: "curl", text: "curl -fsSL https://devstack.bid/llms.txt", published: true },
  { tile: "npm", text: "npx create-next-app@latest my-app", published: true },
  { tile: "pypi", text: "pip install fastapi", published: true },
  // MARK: nvxdev
  // Placeholders for the DevStack CLI. The packages are NOT on npm / PyPI yet, so they stay hidden.
  // To switch them on after registering the packages: set `published: true` below (optionally move
  // them first in the list), then update tests/signature.test.tsx and docs/concepts/design-system.md.
  { tile: "npm", text: "npx nvxdev init", published: false },
  { tile: "pypi", text: "pip install nvxdev", published: false },
];

/** The commands actually shown in the UI. */
export const SIGNATURE_COMMANDS = SIGNATURE_COMMAND_CONFIG.filter((c) => c.published);
/** Static frame (no motion): the curl command, or the first shown command. */
const STATIC_INDEX = Math.max(0, SIGNATURE_COMMANDS.findIndex((c) => c.tile === "curl"));

function Mark({ id }: { id: "javascript" | "npm" | "python" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="sig-mark" fill="currentColor">
      <path d={BRAND_ICONS[id].path} />
    </svg>
  );
}

const TILES: { id: TileId; label: string; body: React.ReactNode }[] = [
  { id: "js", label: "JavaScript", body: <Mark id="javascript" /> },
  { id: "curl", label: "curl", body: <span className="sig-curl">curl://</span> },
  { id: "npm", label: "npm", body: <Mark id="npm" /> },
  {
    id: "pypi",
    label: "PyPI",
    body: (
      <span className="sig-pypi">
        <Mark id="python" />
        <span>pypi</span>
      </span>
    ),
  },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export interface TerminalSignatureProps {
  className?: string;
  /** Type the rotating commands (default true). Off = shows the curl command, static. */
  animate?: boolean;
  /** Accessible name. */
  label?: string;
}

export function TerminalSignature({ className, animate = true, label = "DevStack terminal: JavaScript, curl, npm and PyPI" }: TerminalSignatureProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const live = animate && !reduced;
  const [cmd, setCmd] = useState(STATIC_INDEX);
  const [typed, setTyped] = useState("");
  const [visible, setVisible] = useState(false);

  // Only animate while on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Typewriter: type → hold → delete → next command. Static (curl command) when not live.
  useEffect(() => {
    if (!live || !visible) return;
    let i = cmd;
    let n = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = SIGNATURE_COMMANDS[i].text;
      if (!deleting) {
        n++;
        setTyped(full.slice(0, n));
        if (n >= full.length) {
          deleting = true;
          timer = setTimeout(tick, 1900);
          return;
        }
        timer = setTimeout(tick, 38 + Math.random() * 40);
      } else {
        n = Math.max(0, n - 3);
        setTyped(full.slice(0, n));
        if (n === 0) {
          deleting = false;
          i = (i + 1) % SIGNATURE_COMMANDS.length;
          setCmd(i);
          timer = setTimeout(tick, 350);
          return;
        }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when visibility/motion changes
  }, [live, visible]);

  // Pointer-tracking light. Fine pointers: glow follows the cursor within ~180px of the edge.
  // Touch / pen: a tap lights the outline at the touch point, then fades.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let raf = 0;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const place = (x: number, y: number, strength?: number) => {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const o = strength ?? Math.max(0, 1 - Math.hypot(dx, dy) / 180);
      el.style.setProperty("--sig-x", `${(((x - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--sig-y", `${(((y - r.top) / r.height) * 100).toFixed(1)}%`);
      el.style.setProperty("--sig-o", o.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !visible) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => place(e.clientX, e.clientY));
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      place(e.clientX, e.clientY, 1);
      el.dataset.touched = "true";
      clearTimeout(fade);
      fade = setTimeout(() => {
        el.style.setProperty("--sig-o", "0");
        delete el.dataset.touched;
      }, 1400);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fade);
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
    };
  }, [reduced, visible]);

  const shown = live ? typed : SIGNATURE_COMMANDS[STATIC_INDEX].text;
  const active = SIGNATURE_COMMANDS[live ? cmd : STATIC_INDEX].tile;
  return (
    <div className={cn("sig-wrap", className)}>
      <div ref={ref} className="sig" role="img" aria-label={label} data-live={live ? "true" : "false"}>
        <div className="sig-bar" aria-hidden>
          <span className="sig-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="sig-glyph">&gt;_</span>
        </div>
        <div className="sig-body" aria-hidden>
          <ul className="sig-side">
            {TILES.map((t) => (
              <li key={t.id} className="sig-tile" data-active={t.id === active ? "true" : undefined} title={t.label}>
                {t.body}
              </li>
            ))}
          </ul>
          <div className="sig-pane">
            <p className="sig-prompt">
              <span className="sig-caret">&gt;</span> <span className="sig-typed">{shown}</span>
              <span className="sig-cursor" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
