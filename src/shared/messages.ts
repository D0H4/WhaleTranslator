import type { PublicError } from "./errors";
import type { LanguageCode } from "./languages";
import type { ProviderSettingsInput, PublicSettings } from "./settings";

export type PageCommand = "translate-selection" | "toggle-page-translation";

export interface RuntimeCommand {
  kind: "command";
  command: PageCommand;
}

export type SettingsRequest =
  | { kind: "settings:get" }
  | {
    kind: "settings:save";
    providers: ProviderSettingsInput[];
    activeProviderId: string;
    fallbackProviderIds: string[];
    targetLanguage: LanguageCode;
  }
  | { kind: "settings:remove-provider"; providerId: string }
  | { kind: "settings:test"; provider: ProviderSettingsInput };

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
  | { mode: "connection-test"; provider?: ProviderSettingsInput };

export type TranslationPortInput =
  | { kind: "start"; requestId: string; input: TranslationInput }
  | { kind: "cancel"; requestId: string };

export type TranslationPortOutput =
  | { kind: "started"; requestId: string }
  | { kind: "delta"; requestId: string; text: string }
  | { kind: "complete"; requestId: string; text: string; model?: string | null }
  | { kind: "error"; requestId: string; error: PublicError };
