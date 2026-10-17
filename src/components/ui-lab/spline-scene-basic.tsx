'use client'

import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card"
import { Spotlight } from "@/components/ui/spotlight"
import { addRobotEyeGlow } from "./robot-eyes"
 
// Demo from the pasted snippet. Adjustments: the repo's existing Card is kept (no shadcn copy);
// ibelick's Spotlight has no `fill` prop (that belongs to the Aceternity variant), so it uses
// `size` and a warm tint instead; the layout stacks on small screens.
export function SplineSceneBasic() {
  return (
    <Card className="w-full md:h-[500px] bg-black/[0.96] relative overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20 from-orange-200 via-orange-300 to-orange-500/40"
        size={320}
      />
      
      <div className="flex h-full flex-col md:flex-row">
        {/* Left content */}
        <div className="flex-1 p-6 sm:p-8 relative z-10 flex flex-col justify-center">
          {/* Thai copy: lang="th" for correct shaping and line breaking; extra line-height and
              padding so tall Thai vowel/tone marks are not clipped by bg-clip-text. */}
          <h3
            lang="th"
            className="font-sans text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.35] md:leading-[1.3] tracking-normal text-balance py-1 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400"
          >
            {/* Keep Thai words and brand names whole when the line wraps. */}
            <span className="whitespace-nowrap">สร้างบนมุมมอง</span>{" "}
            <span className="whitespace-nowrap">Open Source</span>{" "}
            <span className="whitespace-nowrap">โดยนักพัฒนา</span>
            <span className="whitespace-nowrap">และ Grok Bot</span>
          </h3>
          <p lang="th" className="mt-4 text-neutral-300 max-w-lg leading-[1.7] text-pretty">
            โค้ดเปิด ใช้ได้ทุกคน และร่วมกันสร้างโดย<span className="whitespace-nowrap">นักพัฒนากับ Grok Bot</span>
          </p>
        </div>

        {/* Right content. container-type: size lets the waist panel scale in cqh: the scene
            camera scales the robot with the canvas height and keeps it centred horizontally. */}
        <div className="relative h-[340px] md:h-auto md:flex-1 [container-type:size]">
          <SplineScene 
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full"
            onLoad={(app) => { void addRobotEyeGlow(app) }}
          />
          {/* implemented.stream plate covering the robot's waist band. Decorative, click-through. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[76%] flex h-[9cqh] w-[27cqh] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.4cqh] border border-white/10 bg-[#16171b] px-[1.6cqh] shadow-[0_0.6cqh_1.6cqh_rgb(0_0_0/0.55)]"
          >
            <img src="/implemented-stream-wordmark-panel.png" alt="" width={585} height={247} decoding="async" className="h-[78%] w-auto max-w-full object-contain" draggable={false} />
          </div>
        </div>
      </div>
    </Card>
  )
}
