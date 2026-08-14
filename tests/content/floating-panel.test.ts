import { describe, expect, it } from "vitest";
import {
  captureSelectionAnchor,
  clampPanelRect,
  getInitialPanelRect,
  movePanel,
  resizePanel
} from "../../src/content/panel/floating-panel";

const desktop = { width: 1280, height: 800 };

describe("floating panel geometry", () => {
  it("opens below the final selection rectangle", () => {
    expect(getInitialPanelRect(
      { left: 100, top: 100, right: 180, bottom: 120 },
      desktop
    )).toEqual({ x: 100, y: 128, width: 760, height: 560 });
  });

  it("opens above a selection near the bottom edge", () => {
    expect(getInitialPanelRect(
      { left: 200, top: 740, right: 280, bottom: 760 },
      desktop
    )).toEqual({ x: 200, y: 172, width: 760, height: 560 });
  });

  it("falls back to the viewport top-right", () => {
    expect(getInitialPanelRect(null, desktop))
      .toEqual({ x: 504, y: 16, width: 760, height: 560 });
  });

  it("reduces the default size for a narrow viewport", () => {
    expect(getInitialPanelRect(null, { width: 320, height: 640 }))
      .toEqual({ x: 12, y: 16, width: 296, height: 560 });
  });

  it("clamps an arbitrary rectangle inside the viewport", () => {
    expect(clampPanelRect(
      { x: -100, y: 790, width: 800, height: 900 },
      desktop
    )).toEqual({ x: 12, y: 12, width: 800, height: 776 });
  });

  it("keeps dragging and resizing inside the remaining viewport", () => {
    const start = { x: 100, y: 100, width: 760, height: 560 };
    expect(movePanel(start, 2_000, 2_000, desktop))
      .toEqual({ x: 508, y: 228, width: 760, height: 560 });
    expect(resizePanel(start, 2_000, 2_000, desktop))
      .toEqual({ x: 100, y: 100, width: 1168, height: 688 });
    expect(resizePanel(start, -2_000, -2_000, desktop))
      .toEqual({ x: 100, y: 100, width: 360, height: 360 });
  });

  it("captures the last visible client rectangle as plain coordinates", () => {
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => ({
        getClientRects: () => [
          { left: 20, top: 30, right: 80, bottom: 44, width: 60, height: 14 },
          { left: 20, top: 46, right: 52, bottom: 60, width: 32, height: 14 }
        ]
      })
    } as unknown as Selection;

    expect(captureSelectionAnchor(selection))
      .toEqual({ left: 20, top: 46, right: 52, bottom: 60 });
  });
});
