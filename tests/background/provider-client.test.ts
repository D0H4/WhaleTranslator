import { describe, expect, it, vi } from "vitest";
import {
  chatCompletionsEndpoint,
  streamCompletion
} from "../../src/background/provider-client";

function sseResponse(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`);
}

describe("streamCompletion", () => {
  it.each([false, true])("reads the returned model from JSON or SSE (JSON: %s)", async (json) => {
    const data = { model: "actual-model", choices: [{ message: { content: "번역" }, delta: { content: "번역" } }] };
    const response = json ? Response.json(data) : new Response(`data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n`);
    const onModel = vi.fn();
    await expect(streamCompletion({
      provider: { apiKey: "secret", baseUrl: "https://proxy.example/v1", model: "auto" },
      messages: [], signal: new AbortController().signal, onDelta: vi.fn(), onModel,
      fetchImpl: vi.fn().mockResolvedValue(response)
    })).resolves.toBe("번역");
    expect(onModel).toHaveBeenCalledWith("actual-model");
  });

  it.each(["actual-model", null, "auto"])("looks up job response_model: %s", async (model) => {
    const response = sseResponse("번역");
    response.headers.set("X-DSProxy-Job-ID", "job/123");
    const fetchImpl = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(Response.json({ status: "completed", response_model: model }));
    const onModel = vi.fn();
    await streamCompletion({
      provider: { apiKey: "secret", baseUrl: "https://proxy.example/v1/", model: "auto" },
      messages: [], signal: new AbortController().signal, onDelta: vi.fn(), onModel, fetchImpl
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://proxy.example/jobs/job%2F123", expect.objectContaining({
      headers: { Authorization: "Bearer secret" }
    }));
    expect(onModel).toHaveBeenCalledWith(model);
  });

  it("preserves translation and stream model when job lookup fails", async () => {
    const response = new Response('data: {"model":"stream-model","choices":[{"delta":{"content":"번역"}}]}\n\ndata: [DONE]\n\n');
    response.headers.set("X-DSProxy-Job-ID", "123");
    const onModel = vi.fn();
    await expect(streamCompletion({
      provider: { apiKey: "secret", baseUrl: "https://proxy.example/v1", model: "auto" },
      messages: [], signal: new AbortController().signal, onDelta: vi.fn(), onModel,
      fetchImpl: vi.fn().mockResolvedValueOnce(response).mockRejectedValueOnce(new Error("offline"))
    })).resolves.toBe("번역");
    expect(onModel).toHaveBeenCalledWith("stream-model");
  });

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
