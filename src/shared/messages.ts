import type { PublicError } from "./errors";
import type { LanguageCode } from "./languages";
import type { PublicSettings } from "./settings";

export type PageCommand = "translate-selection" | "toggle-page-translation";

export interface RuntimeCommand {
  kind: "command";
  command: PageCommand;
}

export type SettingsRequest =
  | { kind: "settings:get" }
  | { kind: "settings:save"; apiKey?: string; targetLanguage: LanguageCode }
  | { kind: "settings:test"; apiKey?: string };

export type SettingsResponse =
  | { ok: true; settings: PublicSettings; tested?: boolean }
  | { ok: false; error: PublicError };

export interface PageTranslationItem {
  id: string;
  text: string;
}

export type TranslationInput =
  | { mode: "text"; text: string; targetLanguage: LanguageCode }
  | { mode: "page"; items: readonly PageTranslationItem[]; targetLanguage: LanguageCode; repair?: boolean }
  | { mode: "connection-test"; apiKey?: string };

export type TranslationPortInput =
  | { kind: "start"; requestId: string; input: TranslationInput }
  | { kind: "cancel"; requestId: string };

export type TranslationPortOutput =
  | { kind: "started"; requestId: string }
  | { kind: "delta"; requestId: string; text: string }
  | { kind: "complete"; requestId: string; text: string }
  | { kind: "error"; requestId: string; error: PublicError };
