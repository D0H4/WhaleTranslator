import { describe, expect, it, vi } from "vitest";
import {
  CHAT_COMPLETIONS_ENDPOINT,
  PROVIDER_BASE_URL,
  streamCompletion
} from "../../src/background/provider-client";

function sseResponse(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`);
}

describe("streamCompletion", () => {
  it("sends the expected OpenAI-compatible request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse("번역"));
    const onDelta = vi.fn();
    const messages = [{ role: "user" as const, content: "hello" }];
    await expect(streamCompletion({
      apiKey: "secret",
      messages,
      signal: new AbortController().signal,
      onDelta,
      fetchImpl
    })).resolves.toBe("번역");

    expect(PROVIDER_BASE_URL).toBe("http://100.115.209.7:4323/v1");
    expect(CHAT_COMPLETIONS_ENDPOINT).toBe(`${PROVIDER_BASE_URL}/chat/completions`);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CHAT_COMPLETIONS_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "deepseek-v4-flash", messages, stream: true });
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
      apiKey: "secret",
      messages: [],
      signal: new AbortController().signal,
      onDelta: () => undefined,
      fetchImpl
    })).rejects.toMatchObject({ code });
  });
});
