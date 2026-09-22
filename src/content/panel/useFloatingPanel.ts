import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import {
  clampPanelRect,
  DEFAULT_PANEL_SIZING,
  getInitialPanelRect,
  movePanel,
  resizePanel,
  type PanelRect,
  type PanelSizing,
  type SelectionAnchor,
  type ViewportSize
} from "./floating-panel";

const INTERACTIVE_SELECTOR = "button, a[href], input, textarea, select, [contenteditable], [data-no-drag]";

interface PointerSession {
  kind: "drag" | "resize";
  pointerId: number;
  originX: number;
  originY: number;
  startRect: PanelRect;
}

export interface UseFloatingPanelOptions {
  anchor: SelectionAnchor | null;
  onClose: () => void;
  /** Default size and minimum size for this window. */
  sizing?: PanelSizing;
  /** Set to false when a parent window already decides what Escape closes. */
  closeOnEscape?: boolean;
}

function getViewport(): ViewportSize {
  return { width: window.innerWidth, height: window.innerHeight };
}

function toPanelStyle(rect: PanelRect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  };
}

function applyPanelRect(panel: HTMLDivElement | null, rect: PanelRect): void {
  if (!panel) return;
  panel.style.left = `${rect.x}px`;
  panel.style.top = `${rect.y}px`;
  panel.style.width = `${rect.width}px`;
  panel.style.height = `${rect.height}px`;
}

export function useFloatingPanel({ anchor, onClose, sizing = DEFAULT_PANEL_SIZING, closeOnEscape = true }: UseFloatingPanelOptions) {
  const minSize = sizing.minSize;
  const [initialRect] = useState(() => getInitialPanelRect(anchor, getViewport(), sizing));
  const panelRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef(initialRect);
  const panelStyle = useMemo<CSSProperties>(() => toPanelStyle(initialRect), [initialRect]);
  const pointerSession = useRef<PointerSession | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const updateRect = useCallback((rect: PanelRect) => {
    rectRef.current = rect;
    applyPanelRect(panelRef.current, rect);
  }, []);

  const beginPointerSession = useCallback((
    kind: PointerSession["kind"],
    event: PointerEvent<HTMLElement>,
    allowInteractiveTarget = false
  ) => {
    if (event.button !== 0) return;
    if (kind === "drag" && !allowInteractiveTarget && event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;

    event.preventDefault();
    pointerSession.current = {
      kind,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startRect: rectRef.current
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already have ended between event delivery and capture.
    }
    setDragging(kind === "drag");
    setResizing(kind === "resize");
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const session = pointerSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - session.originX;
    const deltaY = event.clientY - session.originY;
    updateRect(session.kind === "drag"
      ? movePanel(session.startRect, deltaX, deltaY, getViewport(), minSize)
      : resizePanel(session.startRect, deltaX, deltaY, getViewport(), minSize));
  }, [minSize, updateRect]);

  const endPointerSession = useCallback((event: PointerEvent<HTMLElement>) => {
    const session = pointerSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointerSession.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Releasing a pointer that the browser already released is harmless.
    }
    setDragging(false);
    setResizing(false);
  }, []);

  const onResizeKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const amount = event.shiftKey ? 48 : 16;
    let deltaX = 0;
    let deltaY = 0;
    if (event.key === "ArrowLeft") deltaX = -amount;
    if (event.key === "ArrowRight") deltaX = amount;
    if (event.key === "ArrowUp") deltaY = -amount;
    if (event.key === "ArrowDown") deltaY = amount;
    if (deltaX === 0 && deltaY === 0) return;
    event.preventDefault();
    updateRect(resizePanel(rectRef.current, deltaX, deltaY, getViewport(), minSize));
  }, [minSize, updateRect]);

  const onMoveKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const amount = event.shiftKey ? 48 : 16;
    let deltaX = 0;
    let deltaY = 0;
    if (event.key === "ArrowLeft") deltaX = -amount;
    if (event.key === "ArrowRight") deltaX = amount;
    if (event.key === "ArrowUp") deltaY = -amount;
    if (event.key === "ArrowDown") deltaY = amount;
    if (deltaX === 0 && deltaY === 0) return;
    event.preventDefault();
    updateRect(movePanel(rectRef.current, deltaX, deltaY, getViewport(), minSize));
  }, [minSize, updateRect]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = panelRef.current?.querySelector<HTMLElement>("[data-initial-focus]");
    queueMicrotask(() => initial?.focus());

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const onViewportResize = () => updateRect(clampPanelRect(rectRef.current, getViewport(), minSize));

    if (closeOnEscape) document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onViewportResize);
    return () => {
      if (closeOnEscape) document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onViewportResize);
      previous?.focus();
    };
  }, [closeOnEscape, minSize, onClose, updateRect]);

  return {
    panelRef,
    panelStyle,
    dragHandleProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => beginPointerSession("drag", event),
      onPointerMove,
      onPointerUp: endPointerSession,
      onPointerCancel: endPointerSession
    },
    moveHandleProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => beginPointerSession("drag", event, true),
      onPointerMove,
      onPointerUp: endPointerSession,
      onPointerCancel: endPointerSession,
      onKeyDown: onMoveKeyDown
    },
    resizeHandleProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => beginPointerSession("resize", event),
      onPointerMove,
      onPointerUp: endPointerSession,
      onPointerCancel: endPointerSession,
      onKeyDown: onResizeKeyDown
    },
    dragging,
    resizing
  };
}
