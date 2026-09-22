import { createRoot } from "react-dom/client";
import { WhaleTranslatorError } from "../shared/errors";
import type { TranslationInput } from "../shared/messages";
import { DEFAULT_PROVIDER_MODEL } from "../shared/settings";
import type { TranslationHandle } from "../content/translation-gateway";
import { DictionaryPanel } from "../content/panel/DictionaryPanel";
import { TranslatorPanel } from "../content/panel/TranslatorPanel";
import panelStyles from "../content/panel/panel.css?inline";
import "./preview.css";

const state = new URLSearchParams(location.search).get("state") ?? "success";

const SAMPLE_SOURCE = "いづれの御時にか、女御、更衣あまたさぶらひたまひけるなかに、いとやむごとなき際にはあらぬが、すぐれて時めきたまふありけり。";
const SAMPLE_TRANSLATION = "어느 임금의 시대였던가. 궁중에서 모시던 많은 여어와 갱의 가운데, 신분이 그리 높지는 않으면서도 특별히 임금의 총애를 받는 이가 있었다.";
const SAMPLE_ENTRY = JSON.stringify({
  headword: "更衣",
  reading: "こうい",
  partOfSpeech: "noun",
  primary: {
    meaning: "고대 일본 궁중에서 천황을 모시던 후궁의 품계로, 여어(女御)보다 낮은 지위입니다. 원래는 천황의 옷 갈아입기를 돕던 관직에서 비롯되었으며, 겐지 이야기에서 주인공의 어머니 신분으로 잘 알려져 있습니다.",
    tags: ["historical", "literary"]
  },
  others: [
    { meaning: "옷을 갈아입는 일. 특히 계절에 맞추어 옷차림을 바꾸는 것을 가리킵니다.", tags: ["standard"] },
    { meaning: "옷을 갈아입기 위해 마련된 방이나 공간. 탈의실.", tags: ["standard"] }
  ],
  examples: [
    { sentence: SAMPLE_SOURCE, translation: SAMPLE_TRANSLATION },
    { sentence: "六月一日に更衣をする。", translation: "6월 1일에 옷을 갈아입는다(계절 옷차림을 바꾼다)." }
  ]
});

function previewGateway(input: TranslationInput, onDelta: (text: string) => void = () => undefined): TranslationHandle {
  const requestId = crypto.randomUUID();
  let cancelled = false;
  const result = input.mode === "dictionary" ? SAMPLE_ENTRY : SAMPLE_TRANSLATION;
  const promise = new Promise<string>((resolve, reject) => {
    if (state === "error") {
      queueMicrotask(() => reject(new WhaleTranslatorError("network")));
      return;
    }
    if (state === "streaming") {
      setTimeout(() => { if (!cancelled) onDelta("어느 임금의 시대였던가. 궁중에서 모시던 "); }, 120);
      return;
    }
    if (state === "dictionary-loading") return;
    setTimeout(() => {
      if (!cancelled) {
        onDelta(result);
        resolve(result);
      }
    }, 0);
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

const gateway = previewGateway as never;

createRoot(mount).render(
  state.startsWith("dictionary")
    ? (
      <div className="wt-floating-layer">
        <DictionaryPanel
          word="更衣"
          context={SAMPLE_SOURCE}
          targetLanguage="ko"
          anchor={{ left: 72, top: 72, right: 160, bottom: 94 }}
          gateway={gateway}
          onClose={() => undefined}
        />
      </div>
    )
    : (
      <TranslatorPanel
        initialText={state === "idle" ? "" : SAMPLE_SOURCE}
        anchor={{ left: 72, top: 72, right: 260, bottom: 94 }}
        defaultTarget="ko"
        model={DEFAULT_PROVIDER_MODEL}
        hasApiKey={state !== "missing-key"}
        gateway={gateway}
        onClose={() => undefined}
      />
    )
);
