import { WhaleTranslatorError } from "../shared/errors";
import type { TranslationInput, TranslationPortInput, TranslationPortOutput } from "../shared/messages";

export interface TranslationHandle {
  requestId: string;
  promise: Promise<string>;
  cancel: () => void;
}

export function translate(
  input: TranslationInput,
  onDelta: (text: string) => void = () => undefined
): TranslationHandle {
  const requestId = crypto.randomUUID();
  const port = chrome.runtime.connect({ name: "whale-translator" });
  let settled = false;
  let resolvePromise: (text: string) => void;
  let rejectPromise: (error: unknown) => void;

  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const finish = () => {
    if (!settled) {
      settled = true;
      port.disconnect();
    }
  };

  port.onMessage.addListener((message: TranslationPortOutput) => {
    if (message.requestId !== requestId || settled) return;
    if (message.kind === "delta") onDelta(message.text);
    if (message.kind === "complete") {
      settled = true;
      resolvePromise(message.text);
      port.disconnect();
    }
    if (message.kind === "error") {
      settled = true;
      rejectPromise(new WhaleTranslatorError(message.error.code, message.error.message));
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    if (!settled) {
      settled = true;
      rejectPromise(new WhaleTranslatorError("network"));
    }
  });

  port.postMessage({ kind: "start", requestId, input } satisfies TranslationPortInput);

  return {
    requestId,
    promise,
    cancel: () => {
      if (settled) return;
      port.postMessage({ kind: "cancel", requestId } satisfies TranslationPortInput);
      rejectPromise(new WhaleTranslatorError("cancelled"));
      finish();
    }
  };
}

export function requestTranslation(input: TranslationInput, signal: AbortSignal): Promise<string> {
  const handle = translate(input);
  if (signal.aborted) {
    handle.cancel();
    return handle.promise;
  }
  signal.addEventListener("abort", handle.cancel, { once: true });
  return handle.promise.finally(() => signal.removeEventListener("abort", handle.cancel));
}
