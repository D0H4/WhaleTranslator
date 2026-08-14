import { isLanguageCode, type LanguageCode } from "./languages";

export interface ExtensionSettings {
  apiKey: string;
  targetLanguage: LanguageCode;
}

export interface PublicSettings {
  hasApiKey: boolean;
  targetLanguage: LanguageCode;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: "",
  targetLanguage: "ko"
};

export function normalizeSettings(value: unknown): ExtensionSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const candidate = value as Record<string, unknown>;
  return {
    apiKey: typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "",
    targetLanguage: isLanguageCode(candidate.targetLanguage) ? candidate.targetLanguage : "ko"
  };
}

export function toPublicSettings(settings: ExtensionSettings): PublicSettings {
  return {
    hasApiKey: settings.apiKey.length > 0,
    targetLanguage: settings.targetLanguage
  };
}
