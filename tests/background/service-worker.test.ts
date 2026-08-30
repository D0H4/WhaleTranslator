import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSettingsRequest } from "../../src/background/service-worker";

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
});
