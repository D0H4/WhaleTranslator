import { normalizeLookupTerm } from "../../shared/dictionary";
import type { SelectionAnchor } from "./floating-panel";

export interface SelectedTerm {
  text: string;
  /** Viewport rectangle of the selection, when the browser can report one. */
  rect: SelectionAnchor | null;
}

type ShadowRootWithSelection = ShadowRoot & { getSelection?: () => Selection | null };

function selectionFor(container: HTMLElement): Selection | null {
  const root = container.getRootNode() as Node | ShadowRootWithSelection;
  if (root instanceof ShadowRoot && typeof (root as ShadowRootWithSelection).getSelection === "function") {
    return (root as ShadowRootWithSelection).getSelection?.() ?? null;
  }
  return document.getSelection();
}

function toAnchor(rect: DOMRect | undefined): SelectionAnchor | null {
  if (!rect || (rect.width <= 0 && rect.height <= 0)) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** Reads the highlighted text inside a plain element such as the translation output. */
export function readElementSelection(container: HTMLElement): SelectedTerm | null {
  const selection = selectionFor(container);
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = normalizeLookupTerm(selection.toString());
  if (!text) return null;

  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  if (!element || !container.contains(element)) return null;

  let rect: SelectionAnchor | null = null;
  try {
    rect = toAnchor(range.getBoundingClientRect());
  } catch {
    rect = null;
  }
  return { text, rect };
}

/** Reads the highlighted text inside a textarea, which the document selection does not expose. */
export function readTextareaSelection(textarea: HTMLTextAreaElement): SelectedTerm | null {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) return null;
  const text = normalizeLookupTerm(value.slice(selectionStart, selectionEnd));
  return text ? { text, rect: null } : null;
}

/** Turns a pointer position into a tiny anchor so a window can open next to it. */
export function pointAnchor(x: number, y: number): SelectionAnchor {
  return { left: x, top: y, right: x, bottom: y + 20 };
}
