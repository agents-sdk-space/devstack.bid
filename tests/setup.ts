import { afterEach } from "vitest";

// Only DOM tests need cleanup/polyfills; node-environment tests skip this block.
if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());

  // jsdom lacks a few APIs Radix primitives touch.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
