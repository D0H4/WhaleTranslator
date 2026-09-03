import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSettingsRequest, streamWithProviderFallback } from "../../src/background/service-worker";
import { WhaleTranslatorError } from "../../src/shared/errors";
import { streamCompletion } from "../../src/background/provider-client";

const storedSettings = {
  providers: [{
    id: "default",
    name: "테스트 프로바이더",
    baseUrl: "https://provider.example/v1",
    model: "auto",
    apiKey: "saved-key"
  }],
  activeProviderId: "default",
  targetLanguage: "ko"
};

function streamingResponse(text: string): Response {
  return new Response([
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    "",
    "data: [DONE]",
    ""
  ].join("\n"), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

describe("handleSettingsRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts any non-empty OpenAI-compatible completion for a connection test", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ "whaleTranslator.settings": storedSettings }),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamingResponse("CONNECTED")));

    await expect(handleSettingsRequest({
      kind: "settings:test",
      provider: {
        id: "default",
        name: "테스트 프로바이더",
        baseUrl: "https://provider.example/v1",
        model: "auto"
      }
    })).resolves.toMatchObject({ ok: true, tested: true });
  });

  it("deletes an active provider and persists the replacement atomically", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            "whaleTranslator.settings": {
              providers: [
                ...storedSettings.providers,
                {
                  id: "backup",
                  name: "백업 프로바이더",
                  baseUrl: "https://backup.example/v1",
                  model: "backup-model",
                  apiKey: "backup-key"
                }
              ],
              activeProviderId: "default",
              targetLanguage: "ko"
            }
          }),
          set
        }
      }
    });

    await expect(handleSettingsRequest({
      kind: "settings:remove-provider",
      providerId: "default"
    })).resolves.toMatchObject({
      ok: true,
      settings: {
        activeProviderId: "backup",
        providers: [{ id: "backup" }]
      }
    });
    expect(set).toHaveBeenCalledWith({
      "whaleTranslator.settings": {
        providers: [{
          id: "backup",
          name: "백업 프로바이더",
          baseUrl: "https://backup.example/v1",
          model: "backup-model",
          apiKey: "backup-key"
        }],
        activeProviderId: "backup",
        fallbackProviderIds: [],
        targetLanguage: "ko"
      }
    });
  });
});

describe("streamWithProviderFallback", () => {
  const providers = [
    { id: "default", name: "Default", baseUrl: "https://one.example/v1", model: "one", apiKey: "key-one" },
    { id: "backup", name: "Backup", baseUrl: "https://two.example/v1", model: "two", apiKey: "key-two" }
  ];

  it("tries the next configured provider when the first one fails before output", async () => {
    const completion = vi.fn(async (options: Parameters<typeof streamCompletion>[0]) => {
      if (options.provider.model === "one") throw new WhaleTranslatorError("rate-limited");
      options.onDelta("translated");
      return "translated";
    });
    const deltas: string[] = [];

    await expect(streamWithProviderFallback({
      providers,
      messages: [],
      signal: new AbortController().signal,
      onDelta: (delta) => deltas.push(delta),
      completion
    })).resolves.toBe("translated");

    expect(completion.mock.calls.map(([options]) => options.provider.model)).toEqual(["one", "two"]);
    expect(deltas).toEqual(["translated"]);
  });

  it("skips providers without an API key", async () => {
    const completion = vi.fn(async (options: Parameters<typeof streamCompletion>[0]) => {
      options.onDelta("backup");
      return "backup";
    });

    await expect(streamWithProviderFallback({
      providers: [{ ...providers[0]!, apiKey: "" }, providers[1]!],
      messages: [],
      signal: new AbortController().signal,
      onDelta: () => undefined,
      completion
    })).resolves.toBe("backup");
    expect(completion).toHaveBeenCalledOnce();
    expect(completion.mock.calls[0]?.[0].provider.model).toBe("two");
  });

  it("does not mix providers after output has started", async () => {
    const completion = vi.fn(async (options: Parameters<typeof streamCompletion>[0]) => {
      options.onDelta("partial");
      throw new WhaleTranslatorError("network");
    });

    await expect(streamWithProviderFallback({
      providers,
      messages: [],
      signal: new AbortController().signal,
      onDelta: () => undefined,
      completion
    })).rejects.toMatchObject({ code: "network" });
    expect(completion).toHaveBeenCalledOnce();
  });

  it("does not fallback after cancellation", async () => {
    const completion = vi.fn(async () => {
      throw new WhaleTranslatorError("cancelled");
    });

    await expect(streamWithProviderFallback({
      providers,
      messages: [],
      signal: new AbortController().signal,
      onDelta: () => undefined,
      completion
    })).rejects.toMatchObject({ code: "cancelled" });
    expect(completion).toHaveBeenCalledOnce();
  });

  it("reports a missing key when no configured provider can authenticate", async () => {
    await expect(streamWithProviderFallback({
      providers: providers.map((provider) => ({ ...provider, apiKey: "" })),
      messages: [],
      signal: new AbortController().signal,
      onDelta: () => undefined
    })).rejects.toMatchObject({ code: "missing-key" });
  });
});
