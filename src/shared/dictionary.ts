import { WhaleTranslatorError } from "./errors";
import type { LanguageCode } from "./languages";

export interface DictionarySense {
  meaning: string;
  tags: string[];
}

export interface DictionaryExample {
  sentence: string;
  translation: string;
}

export interface DictionaryEntry {
  headword: string;
  reading: string | null;
  partOfSpeech: string | null;
  primary: DictionarySense;
  others: DictionarySense[];
  examples: DictionaryExample[];
}

export interface DictionaryLookup {
  word: string;
  context: string;
  targetLanguage: LanguageCode;
}

export const MAX_LOOKUP_LENGTH = 60;
export const MAX_LOOKUP_CONTEXT = 600;

/** Collapses whitespace and rejects selections that are too long to be a dictionary term. */
export function normalizeLookupTerm(raw: string): string | null {
  const text = raw.replace(/\s+/gu, " ").trim();
  if (!text || text.length > MAX_LOOKUP_LENGTH) return null;
  return text;
}

/** Keeps the sentence around the selected term so the prompt stays small on long texts. */
export function clipLookupContext(text: string, term: string, radius = MAX_LOOKUP_CONTEXT / 2): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= radius * 2) return normalized;
  const index = normalized.indexOf(term);
  const center = index >= 0 ? index + term.length / 2 : normalized.length / 2;
  const start = Math.max(0, Math.round(center - radius));
  const end = Math.min(normalized.length, Math.round(center + radius));
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asText).filter((tag): tag is string => tag !== null).map((tag) => tag.toLowerCase()).slice(0, 3);
}

function asSense(value: unknown): DictionarySense | null {
  if (typeof value === "string") {
    const meaning = asText(value);
    return meaning ? { meaning, tags: [] } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { meaning?: unknown; definition?: unknown; tags?: unknown };
  const meaning = asText(record.meaning) ?? asText(record.definition);
  return meaning ? { meaning, tags: asTags(record.tags) } : null;
}

function asExample(value: unknown): DictionaryExample | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { sentence?: unknown; translation?: unknown };
  const sentence = asText(record.sentence);
  if (!sentence) return null;
  return { sentence, translation: asText(record.translation) ?? "" };
}

function asList<T>(value: unknown, convert: (item: unknown) => T | null, limit: number): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(convert).filter((item): item is T => item !== null).slice(0, limit);
}

export function extractJsonObject(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export function parseDictionaryEntry(text: string, fallbackWord: string): DictionaryEntry {
  let data: unknown;
  try {
    data = JSON.parse(extractJsonObject(text));
  } catch {
    throw new WhaleTranslatorError("invalid-response");
  }
  if (!data || typeof data !== "object") throw new WhaleTranslatorError("invalid-response");

  const record = data as Record<string, unknown>;
  const primary = asSense(record.primary) ?? (Array.isArray(record.meanings) ? asSense(record.meanings[0]) : null);
  if (!primary) throw new WhaleTranslatorError("invalid-response");

  return {
    headword: asText(record.headword) ?? fallbackWord,
    reading: asText(record.reading),
    partOfSpeech: asText(record.partOfSpeech)?.toLowerCase() ?? null,
    primary,
    others: asList(record.others, asSense, 5),
    examples: asList(record.examples, asExample, 3)
  };
}
