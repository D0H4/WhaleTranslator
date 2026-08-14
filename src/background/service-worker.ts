import { streamCompletion } from "./provider-client";
import { lockStorageAccess, readPublicSettings, readSettings, saveSettings } from "./storage";
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
import { buildConnectionTestMessages, buildPageMessages, buildTextMessages } from "../shared/prompts";

const activeRequests = new Map<string, AbortController>();

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

async function apiKeyFor(input: TranslationInput): Promise<string> {
  if (input.mode === "connection-test" && input.apiKey?.trim()) return input.apiKey.trim();
  return (await readSettings()).apiKey;
}

async function runTranslation(
  requestId: string,
  input: TranslationInput,
  emit: (message: TranslationPortOutput) => void
): Promise<void> {
  const apiKey = await apiKeyFor(input);
  if (!apiKey) throw new WhaleTranslatorError("missing-key");

  const controller = new AbortController();
  activeRequests.get(requestId)?.abort();
  activeRequests.set(requestId, controller);
  emit({ kind: "started", requestId });

  try {
    const text = await streamCompletion({
      apiKey,
      messages: messagesFor(input),
      signal: controller.signal,
      onDelta: (delta) => emit({ kind: "delta", requestId, text: delta })
    });
    if (input.mode === "connection-test" && text.trim() !== "OK") {
      throw new WhaleTranslatorError("invalid-response");
    }
    emit({ kind: "complete", requestId, text });
  } finally {
    if (activeRequests.get(requestId) === controller) activeRequests.delete(requestId);
  }
}

async function handleSettingsRequest(message: SettingsRequest): Promise<SettingsResponse> {
  try {
    if (message.kind === "settings:get") {
      return { ok: true, settings: await readPublicSettings() };
    }
    if (message.kind === "settings:save") {
      const input = message.apiKey === undefined
        ? { targetLanguage: message.targetLanguage }
        : { apiKey: message.apiKey, targetLanguage: message.targetLanguage };
      return { ok: true, settings: await saveSettings(input) };
    }

    const settings = await readPublicSettings();
    const requestId = crypto.randomUUID();
    await runTranslation(
      requestId,
      message.apiKey === undefined
        ? { mode: "connection-test" }
        : { mode: "connection-test", apiKey: message.apiKey },
      () => undefined
    );
    return { ok: true, settings, tested: true };
  } catch (error) {
    return { ok: false, error: toPublicError(error) };
  }
}

function registerServiceWorker(): void {
  chrome.runtime.onInstalled.addListener(() => {
    void lockStorageAccess();
  });
  void lockStorageAccess();

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
    if (kind !== "settings:get" && kind !== "settings:save" && kind !== "settings:test") return false;
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
