import type { PublicProviderSettings } from "../shared/settings";
import { normalizeProviderBaseUrl } from "../shared/settings";

export interface ProviderDraft extends PublicProviderSettings {
  apiKey: string;
  clearApiKey: boolean;
}

export type ProviderField = "name" | "baseUrl" | "model";
export type ProviderEditorState = "idle" | "loading" | "error" | "success";

export function providerDraftFromPublic(provider: PublicProviderSettings): ProviderDraft {
  return { ...provider, apiKey: "", clearApiKey: false };
}

export function providerFieldError(provider: ProviderDraft, field: ProviderField): string | null {
  if (field === "name") return provider.name.trim() ? null : "프로바이더 이름을 입력해 주세요.";
  if (field === "baseUrl") {
    return normalizeProviderBaseUrl(provider.baseUrl)
      ? null
      : "쿼리나 인증 정보가 없는 HTTP(S) Base URL을 입력해 주세요.";
  }
  return provider.model.trim() ? null : "요청에 사용할 모델을 입력해 주세요.";
}

interface ProviderSettingsEditorProps {
  providers: ProviderDraft[];
  activeProviderId: string;
  touchedFields: ReadonlySet<string>;
  busy: boolean;
  state?: ProviderEditorState;
  previewState?: "default" | "hover" | "focus" | "active" | "disabled" | "loading" | "error" | "success";
  idPrefix?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: Partial<ProviderDraft>) => void;
  onTouch: (id: string, field: ProviderField) => void;
  onTest: (id: string) => void;
}

export function ProviderSettingsEditor({
  providers,
  activeProviderId,
  touchedFields,
  busy,
  state = "idle",
  previewState,
  idPrefix = "",
  onSelect,
  onAdd,
  onRemove,
  onChange,
  onTouch,
  onTest
}: ProviderSettingsEditorProps) {
  const provider = providers.find(({ id }) => id === activeProviderId) ?? providers[0];
  if (!provider) return null;

  const hasUsableKey = Boolean(provider.apiKey.trim() || (provider.hasApiKey && !provider.clearApiKey));
  const fieldState = (field: ProviderField) => {
    const error = providerFieldError(provider, field);
    return touchedFields.has(`${provider.id}:${field}`) && error ? error : null;
  };
  const nameError = fieldState("name");
  const baseUrlError = fieldState("baseUrl");
  const modelError = fieldState("model");
  const headingId = `${idPrefix}provider-heading`;
  const nameId = `${idPrefix}provider-name`;
  const nameHelpId = `${idPrefix}provider-name-help`;
  const baseUrlId = `${idPrefix}provider-base-url`;
  const baseUrlHelpId = `${idPrefix}provider-base-url-help`;
  const modelId = `${idPrefix}provider-model`;
  const modelHelpId = `${idPrefix}provider-model-help`;
  const apiKeyId = `${idPrefix}provider-api-key`;

  return (
    <section className="popup-section provider-section" aria-labelledby={headingId}>
      <div className="section-heading provider-heading-row">
        <div>
          <h2 id={headingId}>프로바이더</h2>
          <p>OpenAI 호환 API 프로필</p>
        </div>
        <button className="add-provider-button" type="button" disabled={busy} onClick={onAdd}>추가</button>
      </div>

      <div className="provider-switcher" role="list" aria-label="저장할 프로바이더">
        {providers.map((item) => (
          <div role="listitem" key={item.id}>
            <button
              className={`provider-option ${item.id === provider.id ? "is-active" : ""}`}
              type="button"
              aria-pressed={item.id === provider.id}
              onClick={() => onSelect(item.id)}
            >
              <span className="provider-option-copy">
                <strong>{item.name || "이름 없는 프로바이더"}</strong>
                <small>{item.model || "모델 미설정"}</small>
              </span>
              <span className={`key-indicator ${(item.hasApiKey && !item.clearApiKey) || item.apiKey.trim() ? "has-key" : ""}`}>
                {(item.hasApiKey && !item.clearApiKey) || item.apiKey.trim() ? "키 있음" : "키 없음"}
              </span>
            </button>
          </div>
        ))}
      </div>

      <div className={`provider-editor ${previewState ? `preview-${previewState}` : ""}`} data-state={state}>
        <div className="provider-editor-heading">
          <strong>활성 프로필 편집</strong>
          <button
            className="remove-provider-button"
            type="button"
            disabled={busy || providers.length === 1}
            onClick={() => onRemove(provider.id)}
          >삭제</button>
        </div>

        <label className="field-label" htmlFor={nameId}>프로바이더 이름</label>
        <input
          className="text-field"
          id={nameId}
          value={provider.name}
          maxLength={64}
          required
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameHelpId}
          onBlur={() => onTouch(provider.id, "name")}
          onChange={(event) => onChange(provider.id, { name: event.target.value })}
        />
        <p className={`field-help ${nameError ? "is-error" : ""}`} id={nameHelpId}>{nameError ?? "목록에서 구분할 이름입니다."}</p>

        <label className="field-label" htmlFor={baseUrlId}>Base URL</label>
        <input
          className="text-field mono-field"
          id={baseUrlId}
          type="url"
          inputMode="url"
          value={provider.baseUrl}
          placeholder="https://api.example.com/v1"
          maxLength={2_048}
          required
          spellCheck={false}
          aria-invalid={Boolean(baseUrlError)}
          aria-describedby={baseUrlHelpId}
          onBlur={() => onTouch(provider.id, "baseUrl")}
          onChange={(event) => onChange(provider.id, { baseUrl: event.target.value })}
        />
        <p className={`field-help ${baseUrlError ? "is-error" : ""}`} id={baseUrlHelpId}>{baseUrlError ?? "요청 시 /chat/completions가 자동으로 붙습니다."}</p>

        <label className="field-label" htmlFor={modelId}>모델</label>
        <input
          className="text-field mono-field"
          id={modelId}
          value={provider.model}
          placeholder="model-name"
          maxLength={200}
          required
          spellCheck={false}
          aria-invalid={Boolean(modelError)}
          aria-describedby={modelHelpId}
          onBlur={() => onTouch(provider.id, "model")}
          onChange={(event) => onChange(provider.id, { model: event.target.value })}
        />
        <p className={`field-help ${modelError ? "is-error" : ""}`} id={modelHelpId}>{modelError ?? "프로바이더가 제공하는 정확한 모델 ID를 입력하세요."}</p>

        <label className="field-label" htmlFor={apiKeyId}>API 키</label>
        <div className="key-field">
          <input
            id={apiKeyId}
            name="apiKey"
            type="password"
            value={provider.apiKey}
            placeholder={provider.hasApiKey && !provider.clearApiKey ? "새 키를 입력할 때만 변경됩니다" : "API 키 입력"}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange(provider.id, { apiKey: event.target.value, clearApiKey: false })}
          />
          {provider.hasApiKey && (
            <button
              type="button"
              aria-pressed={provider.clearApiKey}
              onClick={() => onChange(provider.id, { clearApiKey: !provider.clearApiKey, apiKey: "" })}
            >{provider.clearApiKey ? "유지" : "지우기"}</button>
          )}
        </div>
        <p className={`field-help ${provider.clearApiKey ? "is-warning" : ""}`}>
          {provider.clearApiKey ? "저장하면 기존 키가 삭제됩니다." : "키는 화면에 다시 표시되지 않습니다."}
        </p>

        <button
          className={`test-provider-button ${state === "loading" ? "is-loading" : ""}`}
          type="button"
          disabled={busy || !hasUsableKey}
          data-state={state}
          onClick={() => onTest(provider.id)}
        >{state === "loading" ? "연결 확인 중…" : "이 프로바이더 연결 테스트"}</button>
      </div>
    </section>
  );
}
