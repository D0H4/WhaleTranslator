import { WhaleTranslatorError } from "../shared/errors";

interface CompletionChunk {
  model?: unknown;
  choices?: Array<{
    delta?: { content?: unknown };
  }>;
}

export async function collectAssistantDeltas(
  stream: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void = () => undefined,
  onModel: (model: string) => void = () => undefined
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let eventData: string[] = [];
  let output = "";
  let stopped = false;

  const dispatchEvent = () => {
    if (eventData.length === 0) return;
    const data = eventData.join("\n").trim();
    eventData = [];
    if (!data) return;
    if (data === "[DONE]") {
      stopped = true;
      return;
    }

    let parsed: CompletionChunk;
    try {
      parsed = JSON.parse(data) as CompletionChunk;
    } catch {
      throw new WhaleTranslatorError("invalid-response", "Malformed SSE JSON");
    }

    if (typeof parsed.model === "string" && parsed.model.trim()) onModel(parsed.model.trim());
    const content = parsed.choices?.[0]?.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      output += content;
      onDelta(content);
    }
  };

  const processLines = (flush = false) => {
    const lines = buffer.split(/\r?\n/);
    buffer = flush ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (line === "") {
        dispatchEvent();
      } else if (line.startsWith("data:")) {
        eventData.push(line.slice(5).trimStart());
      }
      if (stopped) break;
    }
  };

  try {
    while (!stopped) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processLines();
    }
    buffer += decoder.decode();
    processLines(true);
    if (!stopped && eventData.length > 0) dispatchEvent();
  } finally {
    reader.releaseLock();
  }

  if (output.length === 0) {
    throw new WhaleTranslatorError("invalid-response", "Empty completion");
  }
  return output;
}
