import { getPublicError, toPublicError, WhaleTranslatorError, type PublicError } from "../shared/errors";
import type { LanguageCode } from "../shared/languages";
import { collectPageText, createBatches, type PageTextEntry } from "./page-text";

export type PageTranslationState =
  | { status: "idle" }
  | { status: "running"; completed: number; total: number }
  | { status: "paused"; completed: number; total: number; failedBatch: number; error: PublicError }
  | { status: "complete"; completed: number; total: number };

export type PageBatchGateway = (options: {
  items: readonly { id: string; text: string }[];
  targetLanguage: LanguageCode;
  repair: boolean;
  signal: AbortSignal;
}) => Promise<string>;

export function parsePageResponse(raw: string, expectedIds: readonly string[]): Map<string, string> {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new WhaleTranslatorError("invalid-response");
  }

  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new WhaleTranslatorError("invalid-response");
  const translations = new Map<string, string>();
  for (const item of items) {
    if (!item || typeof item !== "object") throw new WhaleTranslatorError("invalid-response");
    const { id, text } = item as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || typeof text !== "string" || text.length === 0 || translations.has(id)) {
      throw new WhaleTranslatorError("invalid-response");
    }
    translations.set(id, text);
  }
  if (translations.size !== expectedIds.length || expectedIds.some((id) => !translations.has(id))) {
    throw new WhaleTranslatorError("invalid-response");
  }
  return translations;
}

export class PageTranslator {
  private readonly gateway: PageBatchGateway;
  private readonly concurrency: number;
  private listeners = new Set<(state: PageTranslationState) => void>();
  private state: PageTranslationState = { status: "idle" };
  private entries: PageTextEntry[] = [];
  private batches: PageTextEntry[][] = [];
  private completed = new Set<number>();
  private applied = new Map<Text, { original: string; translated: string }>();
  private controller: AbortController | null = null;
  private targetLanguage: LanguageCode = "ko";

  constructor(gateway: PageBatchGateway, concurrency = 2) {
    this.gateway = gateway;
    this.concurrency = Math.max(1, concurrency);
  }

  getState(): PageTranslationState {
    return this.state;
  }

  subscribe(listener: (state: PageTranslationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(state: PageTranslationState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  async start(root: HTMLElement, targetLanguage: LanguageCode): Promise<void> {
    this.restore();
    this.targetLanguage = targetLanguage;
    this.entries = collectPageText(root);
    this.batches = createBatches(this.entries);
    this.completed.clear();
    if (this.batches.length === 0) {
      this.setState({ status: "complete", completed: 0, total: 0 });
      return;
    }
    await this.run(this.batches.map((_, index) => index));
  }

  async retry(): Promise<void> {
    const pending = this.batches.map((_, index) => index).filter((index) => !this.completed.has(index));
    if (pending.length === 0) return;
    await this.run(pending);
  }

  cancel(): void {
    if (this.state.status !== "running") return;
    this.controller?.abort();
    const failedBatch = this.batches.findIndex((_, index) => !this.completed.has(index));
    this.setState({
      status: "paused",
      completed: this.completed.size,
      total: this.batches.length,
      failedBatch: Math.max(0, failedBatch),
      error: getPublicError("cancelled")
    });
  }

  restore(): void {
    this.controller?.abort();
    this.controller = null;
    for (const [node, { original, translated }] of this.applied) {
      if (node.isConnected && node.data === translated) node.data = original;
    }
    this.applied.clear();
    this.entries = [];
    this.batches = [];
    this.completed.clear();
    this.setState({ status: "idle" });
  }

  private async translateBatch(batchIndex: number, signal: AbortSignal): Promise<void> {
    const batch = this.batches[batchIndex];
    if (!batch) return;
    const items = batch.map(({ id, translatableText: text }) => ({ id, text }));
    let translations: Map<string, string> | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.gateway({
          items,
          targetLanguage: this.targetLanguage,
          repair: attempt === 1,
          signal
        });
        translations = parsePageResponse(response, batch.map(({ id }) => id));
        break;
      } catch (error) {
        if (!(error instanceof WhaleTranslatorError && error.code === "invalid-response") || attempt === 1) throw error;
      }
    }

    if (!translations) throw new WhaleTranslatorError("invalid-response");
    if (signal.aborted) throw new WhaleTranslatorError("cancelled");
    for (const entry of batch) {
      if (!entry.node.isConnected || entry.node.data !== entry.originalText) continue;
      const translated = `${entry.leadingWhitespace}${translations.get(entry.id) ?? entry.translatableText}${entry.trailingWhitespace}`;
      entry.node.data = translated;
      this.applied.set(entry.node, { original: entry.originalText, translated });
    }
    this.completed.add(batchIndex);
    this.setState({ status: "running", completed: this.completed.size, total: this.batches.length });
  }

  private async run(indices: number[]): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.setState({ status: "running", completed: this.completed.size, total: this.batches.length });
    let cursor = 0;
    let failure: { batchIndex: number; error: unknown } | null = null;

    const worker = async () => {
      while (!controller.signal.aborted && cursor < indices.length && !failure) {
        const batchIndex = indices[cursor];
        cursor += 1;
        if (batchIndex === undefined) return;
        try {
          await this.translateBatch(batchIndex, controller.signal);
        } catch (error) {
          if (controller.signal.aborted && !failure) return;
          failure = { batchIndex, error };
          controller.abort();
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.concurrency, indices.length) }, worker));
    if (this.controller !== controller) return;

    if (failure) {
      const failed = failure as { batchIndex: number; error: unknown };
      this.setState({
        status: "paused",
        completed: this.completed.size,
        total: this.batches.length,
        failedBatch: failed.batchIndex,
        error: toPublicError(failed.error)
      });
    } else if (!controller.signal.aborted) {
      this.setState({ status: "complete", completed: this.completed.size, total: this.batches.length });
    }
  }
}
