"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/components/ui";

/** Eye capsules on the 1024px art grid (same layout as the NVX master logo). */
export const DST_MASCOT_EYES = [
  { cx: 575.6, cy: 406.3, rx: 60, ry: 136, tilt: -21 },
  { cx: 802.1, cy: 341.3, rx: 59, ry: 134, tilt: -22 },
] as const;

/** Square canvas behind the sphere — pick one per UI mode. */
export type DstMascotCanvas = "black" | "brand" | "transparent";

const CANVAS_FILL: Record<Exclude<DstMascotCanvas, "transparent">, string> = {
  black: "#000000",
  brand: "#fb0fab",
};

/** Map site color scheme to the mascot tile (dark → black canvas, light → brand pink). */
export function dstMascotCanvasFromColorScheme(scheme: "light" | "dark"): Exclude<DstMascotCanvas, "transparent"> {
  return scheme === "dark" ? "black" : "brand";
}

export interface DstMascotProps {
  /** Rendered size in CSS px (square). */
  size: number;
  /** Black or brand-pink square canvas; `transparent` for no fill (legacy: `onBlack`). */
  canvas?: DstMascotCanvas;
  /** @deprecated Prefer `canvas="black"` or `canvas="transparent"`. */
  onBlack?: boolean;
  /** Accessible name; omit for decorative use (aria-hidden). */
  label?: string;
  className?: string;
}

function resolveCanvas(canvas: DstMascotCanvas | undefined, onBlack: boolean | undefined): DstMascotCanvas {
  if (canvas) return canvas;
  if (onBlack === false) return "transparent";
  return "black";
}

/**
 * DevStack “DST” mascot as pure SVG: glossy pink sphere, gradient lettering, glossy eyes.
 * CSS in globals.css (`.dst-mascot*`) — idle float, a turn toward the right, and blinking.
 */
export function DstMascot({ size, canvas, onBlack, label, className }: DstMascotProps) {
  const uid = useId().replace(/:/g, "");
  const resolved = resolveCanvas(canvas, onBlack);

  return (
    <span
      className={cn(
        "dst-mascot",
        resolved === "black" && "dst-mascot--canvas-black",
        resolved === "brand" && "dst-mascot--canvas-brand",
        className,
      )}
      style={{ width: size, height: size }}
      data-testid="dst-mascot"
      data-dst-canvas={resolved}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <span className="dst-mascot-float">
        <svg viewBox="0 0 1024 1024" className="dst-mascot-svg" aria-hidden focusable="false">
          {resolved !== "transparent" ? (
            <rect width="1024" height="1024" fill={CANVAS_FILL[resolved]} />
          ) : null}

          <defs>
            <radialGradient id={`${uid}-sphere`} cx="0.38" cy="0.32" r="0.62">
              <stop offset="0" stopColor="#ff9de8" />
              <stop offset="0.35" stopColor="#ff3ec8" />
              <stop offset="0.72" stopColor="#fb0fab" />
              <stop offset="1" stopColor="#a8006e" />
            </radialGradient>
            <radialGradient id={`${uid}-shine`} cx="0.42" cy="0.28" r="0.35">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="0.55" stopColor="#ffd8f3" stopOpacity="0.35" />
              <stop offset="1" stopColor="#fb0fab" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-rim`} cx="0.5" cy="0.92" r="0.55">
              <stop offset="0" stopColor="#ff7ad6" stopOpacity="0" />
              <stop offset="0.45" stopColor="#ff4fc4" stopOpacity="0.45" />
              <stop offset="1" stopColor="#5c0038" stopOpacity="0.85" />
            </radialGradient>
            <linearGradient id={`${uid}-letter-d`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#67e8f9" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
            <linearGradient id={`${uid}-letter-s`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fef08a" />
              <stop offset="1" stopColor="#f97316" />
            </linearGradient>
            <linearGradient id={`${uid}-letter-t`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#fda4af" />
              <stop offset="1" stopColor="#fb0fab" />
            </linearGradient>
            <radialGradient id={`${uid}-iris`} cx="0.45" cy="0.55" r="0.6">
              <stop offset="0" stopColor="#0b0408" />
              <stop offset="0.72" stopColor="#14060f" />
              <stop offset="1" stopColor="#3d0d30" />
            </radialGradient>
            <radialGradient id={`${uid}-eye-shine`} cx="0.45" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#ffd0ef" />
              <stop offset="1" stopColor="#ff4fc4" stopOpacity="0.85" />
            </radialGradient>
            <clipPath id={`${uid}-ball`}>
              <circle cx="512" cy="512" r="418" />
            </clipPath>
          </defs>

          <g className="dst-mascot-body">
            <circle cx="512" cy="512" r="418" fill={`url(#${uid}-sphere)`} />
            <circle cx="512" cy="512" r="418" fill={`url(#${uid}-rim)`} />
            <ellipse cx="420" cy="340" rx="200" ry="160" fill={`url(#${uid}-shine)`} />

            <g clipPath={`url(#${uid}-ball)`} className="dst-mascot-face">
              <g className="dst-mascot-turn">
                <text
                  x="248"
                  y="548"
                  fontSize="248"
                  fontWeight="900"
                  fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
                  letterSpacing="-6"
                  transform="rotate(-8 420 480) skewX(-14)"
                  stroke={resolved === "brand" ? "#ffffff" : "#ff2db8"}
                  strokeWidth="14"
                  paintOrder="stroke fill"
                >
                  <tspan fill={`url(#${uid}-letter-d)`}>D</tspan>
                  <tspan dx="-8" fill={`url(#${uid}-letter-s)`}>
                    S
                  </tspan>
                  <tspan dx="-6" fill={`url(#${uid}-letter-t)`}>
                    T
                  </tspan>
                </text>

                <g className="dst-mascot-look">
                  {DST_MASCOT_EYES.map((e, i) => {
                    const { rx, ry } = e;
                    const x0 = rx * 0.14;
                    const shine = `M ${x0 - rx * 0.44} ${-ry * 0.58} C ${x0 - rx * 0.46} ${-ry * 0.9} ${x0 + rx * 0.44} ${-ry * 0.92} ${x0 + rx * 0.42} ${-ry * 0.6} L ${x0 + rx * 0.2} ${-ry * 0.02} Q ${x0 + rx * 0.04} ${ry * 0.08} ${x0 - rx * 0.1} ${-ry * 0.08} Z`;
                    return (
                      <g key={i} transform={`translate(${e.cx} ${e.cy}) rotate(${e.tilt})`}>
                        <g className="dst-mascot-eye">
                          <rect
                            x={-rx - 10}
                            y={-ry - 10}
                            width={(rx + 10) * 2}
                            height={(ry + 10) * 2}
                            rx={rx + 10}
                            fill="#b5067f"
                          />
                          <rect
                            x={-rx}
                            y={-ry}
                            width={rx * 2}
                            height={ry * 2}
                            rx={rx}
                            fill={`url(#${uid}-iris)`}
                            stroke="#2a0820"
                            strokeWidth="4"
                          />
                          <path d={shine} fill={`url(#${uid}-eye-shine)`} opacity="0.95" />
                          <ellipse cx={x0 + rx * 0.08} cy={-ry * 0.14} rx={rx * 0.08} ry={rx * 0.1} fill="#fff" opacity="0.9" />
                        </g>
                      </g>
                    );
                  })}
                </g>
              </g>
            </g>
          </g>
        </svg>
      </span>
    </span>
  );
}

export interface DstMascotThemedProps extends Omit<DstMascotProps, "canvas" | "onBlack"> {
  /** Override auto theme detection. */
  colorScheme?: "light" | "dark";
}

/** Picks `canvas="black"` in dark mode and `canvas="brand"` in light mode. */
export function DstMascotThemed({ colorScheme, ...props }: DstMascotThemedProps) {
  const [scheme, setScheme] = useState<"light" | "dark">(colorScheme ?? "dark");

  useEffect(() => {
    if (colorScheme) {
      setScheme(colorScheme);
      return;
    }
    const root = document.documentElement;
    const read = () => setScheme(root.classList.contains("dark") ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [colorScheme]);

  return <DstMascot {...props} canvas={dstMascotCanvasFromColorScheme(scheme)} />;
}
