import { describe, expect, it, vi } from "vitest";
import { collectAssistantDeltas } from "../../src/background/sse";

function streamFrom(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  });
}

describe("collectAssistantDeltas", () => {
  it("decodes UTF-8 and SSE records split at arbitrary byte boundaries", async () => {
    const bytes = new TextEncoder().encode(
      'data: {"choices":[{"delta":{"content":"안녕"}}]}\n\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\ndata: [DONE]\n\n'
    );
    const chunks = [bytes.slice(0, 12), bytes.slice(12, 43), bytes.slice(43, 48), bytes.slice(48)];
    const onDelta = vi.fn();
    await expect(collectAssistantDeltas(streamFrom(chunks), onDelta)).resolves.toBe("안녕!");
    expect(onDelta.mock.calls.flat()).toEqual(["안녕", "!"]);
  });

  it("rejects malformed and empty responses", async () => {
    const malformed = new TextEncoder().encode("data: nope\n\n");
    await expect(collectAssistantDeltas(streamFrom([malformed]))).rejects.toMatchObject({ code: "invalid-response" });

    const done = new TextEncoder().encode("data: [DONE]\n\n");
    await expect(collectAssistantDeltas(streamFrom([done]))).rejects.toMatchObject({ code: "invalid-response" });
  });
});
