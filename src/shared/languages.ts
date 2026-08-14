export const LANGUAGES = [
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "zh-CN", label: "Simplified Chinese", nativeLabel: "简体中文" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" }
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const languageCodes = new Set<string>(LANGUAGES.map(({ code }) => code));

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && languageCodes.has(value);
}

export function getLanguage(code: LanguageCode) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}
