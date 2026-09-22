export interface SelectionAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PANEL_MARGIN = 12;
export const PANEL_GAP = 8;
export const PANEL_FALLBACK_OFFSET = 16;
export const PANEL_DEFAULT_WIDTH = 480;
export const PANEL_DEFAULT_HEIGHT = 400;
export const PANEL_MIN_SIZE = 300;

export interface PanelSizing {
  width: number;
  height: number;
  minSize: number;
}

export const DEFAULT_PANEL_SIZING: PanelSizing = {
  width: PANEL_DEFAULT_WIDTH,
  height: PANEL_DEFAULT_HEIGHT,
  minSize: PANEL_MIN_SIZE
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function availableSize(viewport: ViewportSize): ViewportSize {
  return {
    width: Math.max(0, viewport.width - PANEL_MARGIN * 2),
    height: Math.max(0, viewport.height - PANEL_MARGIN * 2)
  };
}

export function captureSelectionAnchor(selection: Selection | null = window.getSelection()): SelectionAnchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  try {
    const rectangles = selection.getRangeAt(0).getClientRects();
    for (let index = rectangles.length - 1; index >= 0; index -= 1) {
      const rectangle = rectangles[index] ?? rectangles.item?.(index);
      if (!rectangle || (rectangle.width <= 0 && rectangle.height <= 0)) continue;
      return {
        left: rectangle.left,
        top: rectangle.top,
        right: rectangle.right,
        bottom: rectangle.bottom
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function clampPanelRect(rect: PanelRect, viewport: ViewportSize, minSize = PANEL_MIN_SIZE): PanelRect {
  const available = availableSize(viewport);
  const minimumWidth = Math.min(minSize, available.width);
  const minimumHeight = Math.min(minSize, available.height);
  const width = clamp(rect.width, minimumWidth, available.width);
  const height = clamp(rect.height, minimumHeight, available.height);
  const maximumX = viewport.width - PANEL_MARGIN - width;
  const maximumY = viewport.height - PANEL_MARGIN - height;

  return {
    x: clamp(rect.x, PANEL_MARGIN, maximumX),
    y: clamp(rect.y, PANEL_MARGIN, maximumY),
    width,
    height
  };
}

export function getInitialPanelRect(
  anchor: SelectionAnchor | null,
  viewport: ViewportSize,
  sizing: PanelSizing = DEFAULT_PANEL_SIZING
): PanelRect {
  const available = availableSize(viewport);
  const width = Math.min(sizing.width, available.width);
  const height = Math.min(sizing.height, available.height);

  if (!anchor) {
    return clampPanelRect({
      x: viewport.width - PANEL_FALLBACK_OFFSET - width,
      y: PANEL_FALLBACK_OFFSET,
      width,
      height
    }, viewport, sizing.minSize);
  }

  const spaceBelow = viewport.height - PANEL_MARGIN - anchor.bottom - PANEL_GAP;
  const spaceAbove = anchor.top - PANEL_MARGIN - PANEL_GAP;
  const opensAbove = height > spaceBelow && spaceAbove > spaceBelow;

  return clampPanelRect({
    x: anchor.left,
    y: opensAbove ? anchor.top - PANEL_GAP - height : anchor.bottom + PANEL_GAP,
    width,
    height
  }, viewport, sizing.minSize);
}

export function movePanel(
  start: PanelRect,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize,
  minSize = PANEL_MIN_SIZE
): PanelRect {
  return clampPanelRect({
    ...start,
    x: start.x + deltaX,
    y: start.y + deltaY
  }, viewport, minSize);
}

export function resizePanel(
  start: PanelRect,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize,
  minSize = PANEL_MIN_SIZE
): PanelRect {
  const maximumWidth = Math.max(0, viewport.width - PANEL_MARGIN - start.x);
  const maximumHeight = Math.max(0, viewport.height - PANEL_MARGIN - start.y);
  const minimumWidth = Math.min(minSize, maximumWidth);
  const minimumHeight = Math.min(minSize, maximumHeight);

  return {
    x: start.x,
    y: start.y,
    width: clamp(start.width + deltaX, minimumWidth, maximumWidth),
    height: clamp(start.height + deltaY, minimumHeight, maximumHeight)
  };
}
