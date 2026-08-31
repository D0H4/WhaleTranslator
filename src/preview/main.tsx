import { createRoot } from "react-dom/client";
import { WhaleTranslatorError } from "../shared/errors";
import { DEFAULT_PROVIDER_MODEL } from "../shared/settings";
import type { TranslationHandle } from "../content/translation-gateway";
import { TranslatorPanel } from "../content/panel/TranslatorPanel";
import panelStyles from "../content/panel/panel.css?inline";
import "./preview.css";

const state = new URLSearchParams(location.search).get("state") ?? "success";

function previewGateway(_input: unknown, onDelta: (text: string) => void): TranslationHandle {
  const requestId = crypto.randomUUID();
  let cancelled = false;
  const result = "고래는 깊은 바다에서도 서로의 목소리를 알아봅니다.";
  const promise = new Promise<string>((resolve, reject) => {
    if (state === "error") {
      queueMicrotask(() => reject(new WhaleTranslatorError("network")));
      return;
    }
    if (state === "streaming") {
      setTimeout(() => { if (!cancelled) onDelta("고래는 깊은 바다에서도 "); }, 120);
      return;
    }
    queueMicrotask(() => {
      if (!cancelled) {
        onDelta(result);
        resolve(result);
      }
    });
  });
  return {
    requestId,
    promise,
    cancel: () => {
      cancelled = true;
    }
  };
}

const root = document.getElementById("preview-root");
if (!root) throw new Error("Preview root is missing");
const shadow = root.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = panelStyles;
const mount = document.createElement("div");
shadow.append(style, mount);

createRoot(mount).render(
  <TranslatorPanel
    initialText={state === "idle" ? "" : "Whales recognize each other's voices even in the deep ocean."}
    anchor={{ left: 72, top: 72, right: 260, bottom: 94 }}
    defaultTarget="ko"
    model={DEFAULT_PROVIDER_MODEL}
    hasApiKey={state !== "missing-key"}
    gateway={previewGateway as never}
    onClose={() => undefined}
  />
);
