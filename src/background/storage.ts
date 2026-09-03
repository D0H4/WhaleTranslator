import { WhaleTranslatorError } from "../shared/errors";
import {
  ADDITIONAL_DEFAULT_PROVIDERS,
  GROQ_PROVIDER,
  GROQ_PROVIDER_BASE_URL,
  GROQ_PROVIDER_ID,
  GROQ_PROVIDER_MODEL,
  normalizeSettings,
  resolveProviderInput,
  toPublicSettings,
  type ExtensionSettings,
  type ProviderSettingsInput,
  type PublicSettings
} from "../shared/settings";
import type { LanguageCode } from "../shared/languages";

const STORAGE_KEY = "whaleTranslator.settings";
const PROVIDER_PRESETS_VERSION_KEY = "whaleTranslator.providerPresetsVersion";
const PROVIDER_PRESETS_VERSION = 2;
const PREVIOUS_GROQ_PROVIDER_MODEL = "openai/gpt-oss-120b";

type LocalStorageArea = Pick<chrome.storage.StorageArea, "get" | "set"> & {
  setAccessLevel?: (options: { accessLevel: "TRUSTED_CONTEXTS" }) => Promise<void>;
};

function storageArea(): LocalStorageArea {
  return chrome.storage.local as LocalStorageArea;
}

export async function lockStorageAccess(area: LocalStorageArea = storageArea()): Promise<void> {
  try {
    await area.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // Older Chromium builds do not expose setAccessLevel. Content code still never reads storage.
  }
}

export async function readSettings(area: LocalStorageArea = storageArea()): Promise<ExtensionSettings> {
  const result = await area.get(STORAGE_KEY);
  return normalizeSettings(result[STORAGE_KEY]);
}

export async function readPublicSettings(area: LocalStorageArea = storageArea()): Promise<PublicSettings> {
  return toPublicSettings(await readSettings(area));
}

export async function seedDefaultProviderPresets(area: LocalStorageArea = storageArea()): Promise<void> {
  const result = await area.get([STORAGE_KEY, PROVIDER_PRESETS_VERSION_KEY]);
  const seededVersion = typeof result[PROVIDER_PRESETS_VERSION_KEY] === "number"
    ? result[PROVIDER_PRESETS_VERSION_KEY]
    : 0;
  if (seededVersion >= PROVIDER_PRESETS_VERSION) return;

  const current = normalizeSettings(result[STORAGE_KEY]);
  const migratedProviders = current.providers.map((provider) => (
    provider.id === GROQ_PROVIDER_ID &&
    provider.name === GROQ_PROVIDER.name &&
    provider.baseUrl === GROQ_PROVIDER_BASE_URL &&
    provider.model === PREVIOUS_GROQ_PROVIDER_MODEL
      ? { ...provider, model: GROQ_PROVIDER_MODEL }
      : provider
  ));
  const existingIds = new Set(migratedProviders.map(({ id }) => id));
  const providers = seededVersion === 0
    ? [
      ...migratedProviders,
      ...ADDITIONAL_DEFAULT_PROVIDERS
        .filter(({ id }) => !existingIds.has(id))
        .map((provider) => ({ ...provider }))
    ]
    : migratedProviders;
  const next = normalizeSettings({ ...current, providers });
  await area.set({
    [STORAGE_KEY]: next,
    [PROVIDER_PRESETS_VERSION_KEY]: PROVIDER_PRESETS_VERSION
  });
}

export async function saveSettings(
  input: {
    providers: readonly ProviderSettingsInput[];
    activeProviderId: string;
    targetLanguage: LanguageCode;
  },
  area: LocalStorageArea = storageArea()
): Promise<PublicSettings> {
  const current = await readSettings(area);
  const existingById = new Map(current.providers.map((provider) => [provider.id, provider]));
  const providers = input.providers.map((provider) => resolveProviderInput(provider, existingById.get(provider.id)));
  const inputIds = new Set(input.providers.map((provider) => provider.id.trim()));
  if (providers.length === 0 || providers.some((provider) => provider === null) || inputIds.size !== providers.length) {
    throw new WhaleTranslatorError("invalid-provider");
  }
  const validProviders = providers.filter((provider) => provider !== null);
  if (!validProviders.some((provider) => provider.id === input.activeProviderId)) {
    throw new WhaleTranslatorError("invalid-provider");
  }
  const next = normalizeSettings({ providers: validProviders, activeProviderId: input.activeProviderId, targetLanguage: input.targetLanguage });
  await area.set({ [STORAGE_KEY]: next });
  return toPublicSettings(next);
}
