import { createRoot } from "react-dom/client";
import { ProviderSettingsEditor, type ProviderEditorState } from "./ProviderSettings";
import "./popup.css";

const provider = {
  id: "preview",
  name: "번역 API",
  baseUrl: "https://api.example.com/v1",
  model: "translation-model",
  apiKey: "",
  hasApiKey: true,
  clearApiKey: false
};

const states = ["default", "hover", "focus", "active", "disabled", "loading", "error", "success"] as const;

function stateFor(previewState: typeof states[number]): ProviderEditorState {
  if (previewState === "loading") return "loading";
  if (previewState === "error") return "error";
  if (previewState === "success") return "success";
  return "idle";
}

function ProviderSettingsStatePreview() {
  return (
    <main className="state-preview">
      <header className="state-preview-heading">
        <h1>Provider settings — 8 states</h1>
        <p>default · hover · focus · active · disabled · loading · error · success</p>
      </header>
      {states.map((previewState) => (
        <section className="state-preview-row" key={previewState}>
          <h2>{previewState}</h2>
          <ProviderSettingsEditor
            providers={[provider]}
            activeProviderId={provider.id}
            touchedFields={previewState === "error" ? new Set([`${provider.id}:baseUrl`]) : new Set()}
            busy={previewState === "disabled" || previewState === "loading"}
            state={stateFor(previewState)}
            previewState={previewState}
            idPrefix={`${previewState}-`}
            onSelect={() => undefined}
            onAdd={() => undefined}
            onRemove={() => undefined}
            onChange={() => undefined}
            onTouch={() => undefined}
            onTest={() => undefined}
          />
        </section>
      ))}
    </main>
  );
}

const root = document.getElementById("provider-preview-root");
if (!root) throw new Error("Provider preview root is missing");
createRoot(root).render(<ProviderSettingsStatePreview />);
