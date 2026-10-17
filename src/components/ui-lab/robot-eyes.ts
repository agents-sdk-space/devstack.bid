import type { Application } from "@splinetool/runtime";

/**
 * Gives the Spline robot (kZDDjO5HuC9GJUM2) subtle orange "eyes": two small orange spheres with a
 * soft translucent halo on the visor and a weak warm point light, all parented to the "Head" group
 * so they follow the head as it tracks the pointer. Runtime-only (never saved to the Spline file).
 * Static: no animation is added, so prefers-reduced-motion needs no special case.
 * Safe no-op if the scene changes and "Head" is missing; idempotent if onLoad fires twice.
 */
export async function addRobotEyeGlow(app: Application): Promise<void> {
  try {
    if (!app.findObjectByName("Head") || app.findObjectByName("NVX Eye L")) return;
    const y = 51; // visor height in Head-local units
    const z = 46; // just in front of the visor surface
    for (const [name, x] of [["NVX Eye L", -13], ["NVX Eye R", 13]] as const) {
      await app.createObject("Sphere", { name, parent: "Head", position: [x, y, z], scale: 0.065, material: { color: "#ffa056", roughness: 0.1 } });
      await app.createObject("Sphere", { name: `${name} halo`, parent: "Head", position: [x, y, z - 2], scale: 0.13, material: { color: "#ff7a1a", alpha: 0.22, roughness: 1 } });
    }
    await app.createObject("PointLight", { name: "NVX Eye light", parent: "Head", position: [0, y, z + 18], color: "#ff8a3d", intensity: 0.8, distance: 60 });
  } catch {
    // Decorative only: never break the scene if the runtime API differs.
  }
}
