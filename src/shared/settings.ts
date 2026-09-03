import { isLanguageCode, type LanguageCode } from "./languages";

export const DEFAULT_PROVIDER_ID = "default";
export const DEFAULT_PROVIDER_BASE_URL = "http://100.115.209.7:4323/v1";
export const DEFAULT_PROVIDER_MODEL = "deepseek-v4-flash";
export const GROQ_PROVIDER_ID = "groq";
export const GROQ_PROVIDER_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_PROVIDER_MODEL = "qwen/qwen3.8-27b";
export const NVIDIA_PROVIDER_ID = "nvidia-nim";
export const NVIDIA_PROVIDER_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_PROVIDER_MODEL = "deepseek-ai/deepseek-v4-flash-0731";

export interface ProviderSettings {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface PublicProviderSettings extends Omit<ProviderSettings, "apiKey"> {
  hasApiKey: boolean;
}

export interface ProviderSettingsInput extends Omit<ProviderSettings, "apiKey"> {
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface ExtensionSettings {
  providers: ProviderSettings[];
  activeProviderId: string;
  targetLanguage: LanguageCode;
}

export interface PublicSettings {
  hasApiKey: boolean;
  providers: PublicProviderSettings[];
  activeProviderId: string;
  targetLanguage: LanguageCode;
}

export const DEFAULT_PROVIDER: ProviderSettings = {
  id: DEFAULT_PROVIDER_ID,
  name: "기본 프로바이더",
  baseUrl: DEFAULT_PROVIDER_BASE_URL,
  model: DEFAULT_PROVIDER_MODEL,
  apiKey: ""
};

export const GROQ_PROVIDER: ProviderSettings = {
  id: GROQ_PROVIDER_ID,
  name: "Groq 무료 티어",
  baseUrl: GROQ_PROVIDER_BASE_URL,
  model: GROQ_PROVIDER_MODEL,
  apiKey: ""
};

export const NVIDIA_PROVIDER: ProviderSettings = {
  id: NVIDIA_PROVIDER_ID,
  name: "NVIDIA NIM 무료",
  baseUrl: NVIDIA_PROVIDER_BASE_URL,
  model: NVIDIA_PROVIDER_MODEL,
  apiKey: ""
};

export const ADDITIONAL_DEFAULT_PROVIDERS: readonly ProviderSettings[] = [
  GROQ_PROVIDER,
  NVIDIA_PROVIDER
];

export const DEFAULT_PROVIDERS: readonly ProviderSettings[] = [
  DEFAULT_PROVIDER,
  ...ADDITIONAL_DEFAULT_PROVIDERS
];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  providers: DEFAULT_PROVIDERS.map((provider) => ({ ...provider })),
  activeProviderId: DEFAULT_PROVIDER_ID,
  targetLanguage: "ko"
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeProviderBaseUrl(value: unknown): string | null {
  const text = cleanText(value, 2_048);
  if (!text) return null;

  try {
    const url = new URL(text);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    if (url.search || url.hash) return null;
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function normalizeStoredProvider(value: unknown): ProviderSettings | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = cleanText(candidate.id, 128);
  const name = cleanText(candidate.name, 64);
  const baseUrl = normalizeProviderBaseUrl(candidate.baseUrl);
  const model = cleanText(candidate.model, 200);
  if (!id || !name || !baseUrl || !model) return null;

  return {
    id,
    name,
    baseUrl,
    model,
    apiKey: cleanText(candidate.apiKey, 8_192)
  };
}

export function resolveProviderInput(
  input: ProviderSettingsInput,
  existing?: ProviderSettings
): ProviderSettings | null {
  return normalizeStoredProvider({
    ...input,
    apiKey: input.clearApiKey ? "" : (input.apiKey === undefined ? existing?.apiKey ?? "" : input.apiKey)
  });
}

export function activeProvider(settings: ExtensionSettings): ProviderSettings {
  return settings.providers.find((provider) => provider.id === settings.activeProviderId) ?? settings.providers[0] ?? {
    ...DEFAULT_PROVIDER
  };
}

export function normalizeSettings(value: unknown): ExtensionSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS, providers: DEFAULT_SETTINGS.providers.map((provider) => ({ ...provider })) };
  }

  const candidate = value as Record<string, unknown>;
  const seen = new Set<string>();
  const providers = Array.isArray(candidate.providers)
    ? candidate.providers.flatMap((provider) => {
      const normalized = normalizeStoredProvider(provider);
      if (!normalized || seen.has(normalized.id)) return [];
      seen.add(normalized.id);
      return [normalized];
    })
    : [];

  if (providers.length === 0) {
    const legacyApiKey = cleanText(candidate.apiKey, 8_192);
    providers.push(...DEFAULT_PROVIDERS.map((provider) => ({
      ...provider,
      apiKey: provider.id === DEFAULT_PROVIDER_ID ? legacyApiKey : ""
    })));
  }

  const requestedActiveId = cleanText(candidate.activeProviderId, 128);
  const activeProviderId = providers.some((provider) => provider.id === requestedActiveId)
    ? requestedActiveId
    : providers[0]?.id ?? DEFAULT_PROVIDER_ID;

  return {
    providers,
    activeProviderId,
    targetLanguage: isLanguageCode(candidate.targetLanguage) ? candidate.targetLanguage : "ko"
  };
}

export function toPublicSettings(settings: ExtensionSettings): PublicSettings {
  const currentProvider = activeProvider(settings);
  return {
    hasApiKey: currentProvider.apiKey.length > 0,
    providers: settings.providers.map(({ apiKey, ...provider }) => ({
      ...provider,
      hasApiKey: apiKey.length > 0
    })),
    activeProviderId: currentProvider.id,
    targetLanguage: settings.targetLanguage
  };
}
