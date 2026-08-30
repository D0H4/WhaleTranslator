import { useEffect, useMemo, useState } from "react";
import { LANGUAGES, type LanguageCode } from "../shared/languages";
import type { SettingsRequest, SettingsResponse } from "../shared/messages";
import {
  DEFAULT_SETTINGS,
  normalizeProviderBaseUrl,
  toPublicSettings,
  type ProviderSettingsInput
} from "../shared/settings";
import { WhaleMark } from "../content/panel/icons";
import {
  ProviderSettingsEditor,
  providerDraftFromPublic,
  providerFieldError,
  type ProviderDraft,
  type ProviderEditorState,
  type ProviderField
} from "./ProviderSettings";

type SaveState = "idle" | "saving" | "saved" | "testing" | "connected" | "error";

const INITIAL_SETTINGS = toPublicSettings(DEFAULT_SETTINGS);
const INVALID_CONNECTION_RESPONSE_MESSAGE =
  "프로바이더 응답을 확인하지 못했습니다. Base URL, 모델 ID 또는 응답 형식을 확인해 주세요.";

async function sendSettings(message: SettingsRequest): Promise<SettingsResponse> {
  return chrome.runtime.sendMessage(message) as Promise<SettingsResponse>;
}

function providerInput(provider: ProviderDraft): ProviderSettingsInput {
  const input: ProviderSettingsInput = {
    id: provider.id,
    name: provider.name.trim(),
    baseUrl: provider.baseUrl.trim(),
    model: provider.model.trim()
  };
  const apiKey = provider.apiKey.trim();
  if (apiKey) input.apiKey = apiKey;
  if (provider.clearApiKey) input.clearApiKey = true;
  return input;
}

function originPattern(baseUrl: string): string | null {
  const normalized = normalizeProviderBaseUrl(baseUrl);
  return normalized ? `${new URL(normalized).origin}/*` : null;
}

async function requestProviderHostAccess(providers: readonly ProviderDraft[]): Promise<boolean> {
  if (!chrome.permissions?.request) return true;
  const origins = [...new Set(providers.flatMap((provider) => {
    const pattern = originPattern(provider.baseUrl);
    return pattern ? [pattern] : [];
  }))];
  return origins.length === 0 || chrome.permissions.request({ origins });
}

function allFields(providers: readonly ProviderDraft[]): Set<string> {
  return new Set(providers.flatMap((provider) => (["name", "baseUrl", "model"] as ProviderField[])
    .map((field) => `${provider.id}:${field}`)));
}

function validProviders(providers: readonly ProviderDraft[]): boolean {
  return providers.length > 0 && providers.every((provider) =>
    !providerFieldError(provider, "name") &&
    !providerFieldError(provider, "baseUrl") &&
    !providerFieldError(provider, "model"));
}

function newProviderId(): string {
  return `provider-${crypto.randomUUID()}`;
}

export function SettingsApp() {
  const [providers, setProviders] = useState<ProviderDraft[]>(() => INITIAL_SETTINGS.providers.map(providerDraftFromPublic));
  const [activeProviderId, setActiveProviderId] = useState(INITIAL_SETTINGS.activeProviderId);
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>(INITIAL_SETTINGS.targetLanguage);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  const activeProvider = useMemo(
    () => providers.find(({ id }) => id === activeProviderId) ?? providers[0],
    [activeProviderId, providers]
  );
  const activeHasKey = Boolean(activeProvider && (
    activeProvider.apiKey.trim() || (activeProvider.hasApiKey && !activeProvider.clearApiKey)
  ));

  useEffect(() => {
    void sendSettings({ kind: "settings:get" }).then((response) => {
      if (response.ok) {
        setProviders(response.settings.providers.map(providerDraftFromPublic));
        setActiveProviderId(response.settings.activeProviderId);
        setTargetLanguage(response.settings.targetLanguage);
      } else {
        setState("error");
        setMessage(response.error.message);
      }
    });
  }, []);

  const updateProvider = (id: string, patch: Partial<ProviderDraft>) => {
    setProviders((current) => current.map((provider) => provider.id === id ? { ...provider, ...patch } : provider));
    if (state !== "idle") {
      setState("idle");
      setMessage("");
    }
  };

  const touchProviderField = (id: string, field: ProviderField) => {
    setTouchedFields((current) => new Set(current).add(`${id}:${field}`));
  };

  const addProvider = () => {
    const id = newProviderId();
    setProviders((current) => [...current, {
      id,
      name: "새 프로바이더",
      baseUrl: "",
      model: "",
      apiKey: "",
      hasApiKey: false,
      clearApiKey: false
    }]);
    setActiveProviderId(id);
    setState("idle");
    setMessage("새 프로바이더 정보를 입력해 주세요.");
  };

  const removeProvider = (id: string) => {
    setProviders((current) => {
      if (current.length === 1) return current;
      const next = current.filter((provider) => provider.id !== id);
      if (id === activeProviderId) setActiveProviderId(next[0]?.id ?? "");
      return next;
    });
    setState("idle");
    setMessage("설정을 저장하면 이 프로바이더가 삭제됩니다.");
  };

  const save = async () => {
    if (!validProviders(providers)) {
      setTouchedFields(allFields(providers));
      setState("error");
      setMessage("입력하지 않았거나 잘못된 프로바이더 항목을 확인해 주세요.");
      return;
    }

    setState("saving");
    setMessage("");
    try {
      if (!(await requestProviderHostAccess(providers))) {
        setState("error");
        setMessage("선택한 API 호스트 접근 권한이 필요합니다.");
        return;
      }
      const response = await sendSettings({
        kind: "settings:save",
        providers: providers.map(providerInput),
        activeProviderId,
        targetLanguage
      });
      if (response.ok) {
        setProviders(response.settings.providers.map(providerDraftFromPublic));
        setActiveProviderId(response.settings.activeProviderId);
        setTouchedFields(new Set());
        setState("saved");
        setMessage("프로바이더 설정을 저장했습니다.");
      } else {
        setState("error");
        setMessage(response.error.message);
      }
    } catch {
      setState("error");
      setMessage("API 호스트 권한을 요청하지 못했습니다.");
    }
  };

  const testConnection = async (id: string) => {
    const provider = providers.find((item) => item.id === id);
    if (!provider || !validProviders([provider])) {
      setTouchedFields((current) => new Set([...current, ...allFields(provider ? [provider] : [])]));
      setState("error");
      setMessage("연결할 프로바이더 정보를 먼저 완성해 주세요.");
      return;
    }

    setState("testing");
    setMessage("");
    try {
      if (!(await requestProviderHostAccess([provider]))) {
        setState("error");
        setMessage("이 API 호스트에 연결하려면 접근 권한이 필요합니다.");
        return;
      }
      const response = await sendSettings({ kind: "settings:test", provider: providerInput(provider) });
      if (response.ok) {
        setState("connected");
        setMessage(`${provider.name} 연결을 확인했습니다.`);
      } else {
        setState("error");
        setMessage(response.error.code === "invalid-response"
          ? INVALID_CONNECTION_RESPONSE_MESSAGE
          : response.error.message);
      }
    } catch {
      setState("error");
      setMessage("API 호스트 권한을 확인하지 못했습니다.");
    }
  };

  const busy = state === "saving" || state === "testing";
  const editorState: ProviderEditorState = state === "testing"
    ? "loading"
    : state === "connected"
      ? "success"
      : state === "error"
        ? "error"
        : "idle";

  return (
    <main className="popup-shell">
      <form className="popup-form" aria-label="WhaleTranslator 설정" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <header className="popup-header">
          <div className="popup-brand">
            <WhaleMark />
            <div>
              <h1>WhaleTranslator</h1>
              <p>{activeProvider?.model || "프로바이더 설정"}</p>
            </div>
          </div>
          <span className={`connection-chip ${activeHasKey ? "is-ready" : ""}`}>
            <i aria-hidden="true" />{activeHasKey ? "사용 준비됨" : "키 필요"}
          </span>
        </header>

        <ProviderSettingsEditor
          providers={providers}
          activeProviderId={activeProviderId}
          touchedFields={touchedFields}
          busy={busy}
          state={editorState}
          onSelect={(id) => { setActiveProviderId(id); setState("idle"); setMessage(""); }}
          onAdd={addProvider}
          onRemove={removeProvider}
          onChange={updateProvider}
          onTouch={touchProviderField}
          onTest={(id) => void testConnection(id)}
        />

        <section className="popup-section language-section" aria-labelledby="language-heading">
          <h2 id="language-heading">기본 번역 언어</h2>
          <label className="field-label" htmlFor="target-language">도착 언어</label>
          <select id="target-language" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value as LanguageCode)}>
            {LANGUAGES.map((language) => <option value={language.code} key={language.code}>{language.nativeLabel} · {language.label}</option>)}
          </select>
        </section>

        <section className="shortcut-strip" aria-label="단축키 안내">
          <div><kbd>Alt T</kbd><span>선택 영역 또는 직접 입력</span></div>
          <div><kbd>Alt ⇧ T</kbd><span>페이지 번역 · 원문 복원</span></div>
          <button type="button" onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>단축키 관리</button>
        </section>

        <p className="privacy-note">활성 프로바이더로 번역할 텍스트가 전송됩니다. API 키는 이 브라우저의 확장 로컬 저장소에만 보관되며 운영체제 키체인과는 다릅니다.</p>

        <div className="popup-footer">
          <p className={`save-message is-${state}`} role={state === "error" ? "alert" : "status"} aria-live="polite">{message}</p>
          <button className={`save-button ${state === "saving" ? "is-loading" : ""}`} type="submit" disabled={busy} data-state={state}>
            {state === "saving" ? "저장 중…" : "설정 저장"}
          </button>
        </div>
      </form>
    </main>
  );
}
