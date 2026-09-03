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
  providers: readonly ProviderDraft[];
  selectedProviderId: string;
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
  selectedProviderId,
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
  const provider = providers.find(({ id }) => id === selectedProviderId) ?? providers[0];
  const headingId = `${idPrefix}provider-heading`;
  const heading = (
    <div className="section-heading provider-heading-row">
      <div>
        <h2 id={headingId}>프로바이더</h2>
        <p>OpenAI 호환 API 프로필</p>
      </div>
      <button className="add-provider-button" type="button" disabled={busy} onClick={onAdd}>추가</button>
    </div>
  );

  if (!provider) {
    return (
      <section className="popup-section provider-section" aria-labelledby={headingId}>
        {heading}
        <p className="empty-provider-message">저장된 프로필이 없습니다. 새 프로필을 추가하거나 이 상태로 저장할 수 있습니다.</p>
      </section>
    );
  }

  const hasUsableKey = Boolean(provider.apiKey.trim() || (provider.hasApiKey && !provider.clearApiKey));
  const fieldState = (field: ProviderField) => {
    const error = providerFieldError(provider, field);
    return touchedFields.has(`${provider.id}:${field}`) && error ? error : null;
  };
  const nameError = fieldState("name");
  const baseUrlError = fieldState("baseUrl");
  const modelError = fieldState("model");
  const nameId = `${idPrefix}provider-name`;
  const nameHelpId = `${idPrefix}provider-name-help`;
  const baseUrlId = `${idPrefix}provider-base-url`;
  const baseUrlHelpId = `${idPrefix}provider-base-url-help`;
  const modelId = `${idPrefix}provider-model`;
  const modelHelpId = `${idPrefix}provider-model-help`;
  const apiKeyId = `${idPrefix}provider-api-key`;

  return (
    <section className="popup-section provider-section" aria-labelledby={headingId}>
      {heading}

      <div className="provider-switcher" role="list" aria-label="편집할 프로바이더">
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
          <strong>선택한 프로필 편집</strong>
          <button
            className="remove-provider-button"
            type="button"
            disabled={busy}
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

interface ProviderRoutingEditorProps {
  providers: readonly ProviderDraft[];
  defaultProviderId: string;
  fallbackProviderIds: readonly string[];
  busy: boolean;
  onDefaultChange: (id: string) => void;
  onMoveFallback: (id: string, direction: "up" | "down") => void;
}

export function ProviderRoutingEditor({
  providers,
  defaultProviderId,
  fallbackProviderIds,
  busy,
  onDefaultChange,
  onMoveFallback
}: ProviderRoutingEditorProps) {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const defaultProvider = providersById.get(defaultProviderId) ?? providers[0];
  const fallbackProviders = fallbackProviderIds.flatMap((id) => {
    const provider = providersById.get(id);
    return provider && provider.id !== defaultProvider?.id ? [provider] : [];
  });

  return (
    <section className="popup-section routing-section" aria-labelledby="routing-heading">
      <div className="section-heading routing-heading-row">
        <div>
          <h2 id="routing-heading">번역 경로</h2>
          <p>기본 요청과 자동 fallback 우선순위</p>
        </div>
      </div>

      {!defaultProvider ? (
        <p className="empty-provider-message">프로바이더를 추가하면 기본값과 fallback 순서를 설정할 수 있습니다.</p>
      ) : (
        <>
          <label className="field-label" htmlFor="default-provider">기본 프로바이더</label>
          <select
            id="default-provider"
            value={defaultProvider.id}
            disabled={busy}
            onChange={(event) => onDefaultChange(event.target.value)}
          >
            {providers.map((provider) => (
              <option value={provider.id} key={provider.id}>{provider.name || "이름 없는 프로바이더"}</option>
            ))}
          </select>
          <p className="field-help">API 키가 없거나 응답 전에 연결 오류가 발생하면 다음 프로바이더를 시도합니다.</p>

          <div className="fallback-heading">
            <strong>Fallback 순서</strong>
            <span>위에서부터 재시도</span>
          </div>
          {fallbackProviders.length === 0 ? (
            <p className="fallback-empty">추가 fallback 프로바이더가 없습니다.</p>
          ) : (
            <ol className="fallback-list">
              {fallbackProviders.map((provider, index) => (
                <li key={provider.id}>
                  <span className="fallback-rank" aria-hidden="true">{index + 2}</span>
                  <span className="fallback-provider-copy">
                    <strong>{provider.name || "이름 없는 프로바이더"}</strong>
                    <small>{provider.model || "모델 미설정"}</small>
                  </span>
                  <span className="fallback-actions">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      aria-label={`${provider.name || "이름 없는 프로바이더"} 우선순위 올리기`}
                      onClick={() => onMoveFallback(provider.id, "up")}
                    >↑</button>
                    <button
                      type="button"
                      disabled={busy || index === fallbackProviders.length - 1}
                      aria-label={`${provider.name || "이름 없는 프로바이더"} 우선순위 내리기`}
                      onClick={() => onMoveFallback(provider.id, "down")}
                    >↓</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
