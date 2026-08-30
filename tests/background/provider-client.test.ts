import { describe, expect, it, vi } from "vitest";
import {
  chatCompletionsEndpoint,
  streamCompletion
} from "../../src/background/provider-client";

function sseResponse(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`);
}

describe("streamCompletion", () => {
  it("uses the selected OpenAI-compatible provider URL, key, and model", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse("번역"));
    const onDelta = vi.fn();
    const messages = [{ role: "user" as const, content: "hello" }];
    await expect(streamCompletion({
      provider: {
        apiKey: "secret",
        baseUrl: "https://provider.example/v1/",
        model: "translation-model"
      },
      messages,
      signal: new AbortController().signal,
      onDelta,
      fetchImpl
    })).resolves.toBe("번역");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(chatCompletionsEndpoint("https://provider.example/v1/"));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "translation-model", messages, stream: true });
    expect(onDelta).toHaveBeenCalledWith("번역");
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate-limited"],
    [503, "service"]
  ])("maps HTTP %s to %s", async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status }));
    await expect(streamCompletion({
      provider: { apiKey: "secret", baseUrl: "https://provider.example/v1", model: "model" },
      messages: [],
      signal: new AbortController().signal,
      onDelta: () => undefined,
      fetchImpl
    })).rejects.toMatchObject({ code });
  });
});
