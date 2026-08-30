import { WhaleTranslatorError } from "../shared/errors";
import {
  normalizeSettings,
  resolveProviderInput,
  toPublicSettings,
  type ExtensionSettings,
  type ProviderSettingsInput,
  type PublicSettings
} from "../shared/settings";
import type { LanguageCode } from "../shared/languages";

const STORAGE_KEY = "whaleTranslator.settings";

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
