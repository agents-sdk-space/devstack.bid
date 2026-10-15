// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DstMascot,
  DST_MASCOT_EYES,
  dstMascotCanvasFromColorScheme,
} from "@/components/brand/dst-mascot";
import { MASCOT_EYES } from "@/components/brand/mascot";

describe("DstMascot", () => {
  it("renders black canvas mode with vector art and two eyes", () => {
    const { getByTestId } = render(<DstMascot size={200} canvas="black" />);
    const el = getByTestId("dst-mascot");
    expect(el.getAttribute("data-dst-canvas")).toBe("black");
    expect(el.classList.contains("dst-mascot--canvas-black")).toBe(true);
    expect(el.querySelector("rect[fill='#000000']")).toBeTruthy();
    expect(el.querySelectorAll(".dst-mascot-eye")).toHaveLength(2);
  });

  it("renders brand pink canvas mode", () => {
    const { getByTestId } = render(<DstMascot size={120} canvas="brand" />);
    const el = getByTestId("dst-mascot");
    expect(el.getAttribute("data-dst-canvas")).toBe("brand");
    expect(el.classList.contains("dst-mascot--canvas-brand")).toBe(true);
    expect(el.querySelector("rect[fill='#fb0fab']")).toBeTruthy();
  });

  it("maps color scheme to the two production canvases", () => {
    expect(dstMascotCanvasFromColorScheme("dark")).toBe("black");
    expect(dstMascotCanvasFromColorScheme("light")).toBe("brand");
  });

  it("supports transparent canvas via onBlack={false}", () => {
    const { getByTestId } = render(<DstMascot size={64} onBlack={false} />);
    expect(getByTestId("dst-mascot").getAttribute("data-dst-canvas")).toBe("transparent");
  });

  it("gradient ids are unique per instance", () => {
    const { container } = render(
      <>
        <DstMascot size={48} canvas="black" />
        <DstMascot size={96} canvas="brand" />
      </>,
    );
    const ids = [...container.querySelectorAll("radialGradient, linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("eye geometry matches the NVX mascot grid", () => {
    expect(DST_MASCOT_EYES.map((e) => [e.cx, e.cy])).toEqual(MASCOT_EYES.map((e) => [e.cx, e.cy]));
  });
});
