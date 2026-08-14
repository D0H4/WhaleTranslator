const EXCLUDED_SELECTOR = [
  "script",
  "style",
  "noscript",
  "template",
  "code",
  "pre",
  "textarea",
  "input",
  "select",
  "option",
  "svg",
  "canvas",
  "[contenteditable]",
  "[translate='no']",
  "[hidden]",
  "[aria-hidden='true']",
  "[inert]",
  "[data-whale-translator-root]"
].join(",");

export interface PageTextEntry {
  id: string;
  node: Text;
  originalText: string;
  leadingWhitespace: string;
  trailingWhitespace: string;
  translatableText: string;
}

function isRendered(element: Element, root: HTMLElement): boolean {
  let current: Element | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") {
      return false;
    }
    if (current === root) break;
    current = current.parentElement;
  }
  return true;
}

function splitWhitespace(value: string) {
  const leadingWhitespace = value.match(/^\s*/u)?.[0] ?? "";
  const trailingWhitespace = value.match(/\s*$/u)?.[0] ?? "";
  const end = trailingWhitespace.length > 0 ? value.length - trailingWhitespace.length : value.length;
  return {
    leadingWhitespace,
    trailingWhitespace,
    translatableText: value.slice(leadingWhitespace.length, end)
  };
}

function isTranslatable(value: string): boolean {
  if (!value || !/\p{L}/u.test(value)) return false;
  if (/^(?:https?:\/\/|www\.)\S+$/iu.test(value)) return false;
  return true;
}

export function collectPageText(root: HTMLElement): PageTextEntry[] {
  const entries: PageTextEntry[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (parent && !parent.closest(EXCLUDED_SELECTOR) && isRendered(parent, root)) {
      const pieces = splitWhitespace(textNode.data);
      if (isTranslatable(pieces.translatableText)) {
        entries.push({
          id: `wt-${entries.length}`,
          node: textNode,
          originalText: textNode.data,
          ...pieces
        });
      }
    }
    node = walker.nextNode();
  }

  return entries;
}

export function createBatches(entries: readonly PageTextEntry[]): PageTextEntry[][] {
  const batches: PageTextEntry[][] = [];
  let batch: PageTextEntry[] = [];
  let characters = 0;

  for (const entry of entries) {
    const entryCharacters = Array.from(entry.translatableText).length;
    if (batch.length > 0 && (batch.length >= 24 || characters + entryCharacters > 6_000)) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(entry);
    characters += entryCharacters;
    if (entryCharacters > 6_000) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
