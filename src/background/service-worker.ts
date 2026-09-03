import { streamCompletion } from "./provider-client";
import {
  lockStorageAccess,
  readPublicSettings,
  readSettings,
  removeProviderSettings,
  seedDefaultProviderPresets,
  saveSettings
} from "./storage";
import { toPublicError, WhaleTranslatorError } from "../shared/errors";
import type {
  PageCommand,
  RuntimeCommand,
  SettingsRequest,
  SettingsResponse,
  TranslationInput,
  TranslationPortInput,
  TranslationPortOutput
} from "../shared/messages";
import {
  buildConnectionTestMessages,
  buildPageMessages,
  buildTextMessages,
  type ChatMessage
} from "../shared/prompts";
import {
  orderedProviders,
  resolveProviderInput,
  type ProviderSettings
} from "../shared/settings";

const activeRequests = new Map<string, AbortController>();
let storageInitialization: Promise<void> = Promise.resolve();

async function initializeStorage(): Promise<void> {
  await lockStorageAccess();
  try {
    await seedDefaultProviderPresets();
  } catch {
    // Normalized settings still keep the extension usable if a one-time migration cannot be persisted.
  }
}

function supportedPage(url: string | undefined): boolean {
  return Boolean(url && /^(https?|file):/i.test(url));
}

export async function sendCommandToActiveTab(
  command: PageCommand,
  api: Pick<typeof chrome, "tabs" | "scripting"> = chrome
): Promise<void> {
  const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !supportedPage(tab.url)) {
    throw new WhaleTranslatorError("restricted-page");
  }
  await api.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  const message: RuntimeCommand = { kind: "command", command };
  await api.tabs.sendMessage(tab.id, message);
}

function messagesFor(input: TranslationInput) {
  if (input.mode === "text") return buildTextMessages(input.text, input.targetLanguage);
  if (input.mode === "page") return buildPageMessages(input.items, input.targetLanguage, input.repair);
  return buildConnectionTestMessages();
}

async function providersFor(input: TranslationInput): Promise<ProviderSettings[]> {
  await storageInitialization;
  const settings = await readSettings();
  if (input.mode === "connection-test" && input.provider) {
    const provider = resolveProviderInput(input.provider, settings.providers.find(({ id }) => id === input.provider?.id));
    if (!provider) throw new WhaleTranslatorError("invalid-provider");
    return [provider];
  }

  const providers = orderedProviders(settings);
  if (providers.length === 0) throw new WhaleTranslatorError("invalid-provider");
  return providers;
}

function canFallbackAfter(error: unknown): boolean {
  return error instanceof WhaleTranslatorError && (
    error.code === "unauthorized" ||
    error.code === "rate-limited" ||
    error.code === "network" ||
    error.code === "service" ||
    error.code === "invalid-response"
  );
}

export async function streamWithProviderFallback(options: {
  providers: readonly ProviderSettings[];
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  completion?: typeof streamCompletion;
}): Promise<string> {
  const providers = options.providers.filter((provider) => provider.apiKey.length > 0);
  if (providers.length === 0) throw new WhaleTranslatorError("missing-key");

  const completion = options.completion ?? streamCompletion;
  let lastError: unknown;
  for (const provider of providers) {
    let emittedOutput = false;
    try {
      return await completion({
        provider,
        messages: options.messages,
        signal: options.signal,
        onDelta: (delta) => {
          if (delta.length > 0) emittedOutput = true;
          options.onDelta(delta);
        }
      });
    } catch (error) {
      if (emittedOutput || !canFallbackAfter(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new WhaleTranslatorError("invalid-provider");
}

async function runTranslation(
  requestId: string,
  input: TranslationInput,
  emit: (message: TranslationPortOutput) => void
): Promise<void> {
  const providers = await providersFor(input);
  if (!providers.some((provider) => provider.apiKey.length > 0)) {
    throw new WhaleTranslatorError("missing-key");
  }

  const controller = new AbortController();
  activeRequests.get(requestId)?.abort();
  activeRequests.set(requestId, controller);
  emit({ kind: "started", requestId });

  try {
    const text = await streamWithProviderFallback({
      providers,
      messages: messagesFor(input),
      signal: controller.signal,
      onDelta: (delta) => emit({ kind: "delta", requestId, text: delta })
    });
    emit({ kind: "complete", requestId, text });
  } finally {
    if (activeRequests.get(requestId) === controller) activeRequests.delete(requestId);
  }
}

async function handleSettingsRequest(message: SettingsRequest): Promise<SettingsResponse> {
  try {
    await storageInitialization;
    if (message.kind === "settings:get") {
      return { ok: true, settings: await readPublicSettings() };
    }
    if (message.kind === "settings:save") {
      return { ok: true, settings: await saveSettings(message) };
    }
    if (message.kind === "settings:remove-provider") {
      return { ok: true, settings: await removeProviderSettings(message.providerId) };
    }

    const settings = await readPublicSettings();
    const requestId = crypto.randomUUID();
    await runTranslation(
      requestId,
      { mode: "connection-test", provider: message.provider },
      () => undefined
    );
    return { ok: true, settings, tested: true };
  } catch (error) {
    return { ok: false, error: toPublicError(error) };
  }
}

function registerServiceWorker(): void {
  chrome.runtime.onInstalled.addListener(() => {
    storageInitialization = initializeStorage();
  });
  storageInitialization = initializeStorage();

  chrome.commands.onCommand.addListener((command) => {
    if (command !== "translate-selection" && command !== "toggle-page-translation") return;
    void sendCommandToActiveTab(command).catch((error) => {
      if (!(error instanceof WhaleTranslatorError && error.code === "restricted-page")) {
        console.error("WhaleTranslator command failed");
      }
    });
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("kind" in message)) return false;
    const kind = (message as { kind?: unknown }).kind;
    if (
      kind !== "settings:get" &&
      kind !== "settings:save" &&
      kind !== "settings:remove-provider" &&
      kind !== "settings:test"
    ) return false;
    void handleSettingsRequest(message as SettingsRequest).then(sendResponse);
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "whale-translator") return;
    const ownedRequests = new Set<string>();
    let disconnected = false;
    port.onMessage.addListener((message: TranslationPortInput) => {
      if (message.kind === "cancel") {
        activeRequests.get(message.requestId)?.abort();
        return;
      }

      ownedRequests.add(message.requestId);
      void runTranslation(message.requestId, message.input, (output) => port.postMessage(output))
        .catch((error) => {
          if (disconnected) return;
          port.postMessage({
            kind: "error",
            requestId: message.requestId,
            error: toPublicError(error)
          } satisfies TranslationPortOutput);
        })
        .finally(() => ownedRequests.delete(message.requestId));
    });
    port.onDisconnect.addListener(() => {
      disconnected = true;
      for (const requestId of ownedRequests) activeRequests.get(requestId)?.abort();
    });
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  registerServiceWorker();
}

export { handleSettingsRequest, registerServiceWorker, supportedPage };
