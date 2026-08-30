import { WhaleTranslatorError } from "../shared/errors";
import type { ChatMessage } from "../shared/prompts";
import {
  DEFAULT_PROVIDER_BASE_URL,
  DEFAULT_PROVIDER_MODEL,
  type ProviderSettings
} from "../shared/settings";
import { collectAssistantDeltas } from "./sse";

export const PROVIDER_BASE_URL = DEFAULT_PROVIDER_BASE_URL;
export const CHAT_COMPLETIONS_ENDPOINT = `${PROVIDER_BASE_URL}/chat/completions`;
export const TRANSLATION_MODEL = DEFAULT_PROVIDER_MODEL;

export function chatCompletionsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/chat/completions`;
}

function statusToError(status: number): WhaleTranslatorError {
  if (status === 401 || status === 403) return new WhaleTranslatorError("unauthorized");
  if (status === 408) return new WhaleTranslatorError("network");
  if (status === 429) return new WhaleTranslatorError("rate-limited");
  if (status >= 500) return new WhaleTranslatorError("service");
  return new WhaleTranslatorError("invalid-response");
}

export async function streamCompletion(options: {
  provider: Pick<ProviderSettings, "apiKey" | "baseUrl" | "model">;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(chatCompletionsEndpoint(options.provider.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.provider.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: options.provider.model,
        messages: options.messages,
        stream: true
      }),
      signal: options.signal
    });
  } catch (error) {
    if (options.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new WhaleTranslatorError("cancelled");
    }
    throw new WhaleTranslatorError("network");
  }

  if (!response.ok) throw statusToError(response.status);
  if (!response.body) throw new WhaleTranslatorError("invalid-response");

  return collectAssistantDeltas(response.body, options.onDelta);
}
