import { useEffect, useState } from "react";
import { LANGUAGES, type LanguageCode } from "../shared/languages";
import type { SettingsRequest, SettingsResponse } from "../shared/messages";
import type { PublicSettings } from "../shared/settings";
import { WhaleMark } from "../content/panel/icons";

type SaveState = "idle" | "saving" | "saved" | "testing" | "connected" | "error";

async function sendSettings(message: SettingsRequest): Promise<SettingsResponse> {
  return chrome.runtime.sendMessage(message) as Promise<SettingsResponse>;
}

export function SettingsApp() {
  const [settings, setSettings] = useState<PublicSettings>({ hasApiKey: false, targetLanguage: "ko" });
  const [apiKey, setApiKey] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("ko");
  const [revealKey, setRevealKey] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    void sendSettings({ kind: "settings:get" }).then((response) => {
      if (response.ok) {
        setSettings(response.settings);
        setTargetLanguage(response.settings.targetLanguage);
      } else {
        setState("error");
        setMessage(response.error.message);
      }
    });
  }, []);

  const save = async () => {
    setState("saving");
    setMessage("");
    const trimmedKey = apiKey.trim();
    const request: SettingsRequest = trimmedKey
      ? { kind: "settings:save", apiKey: trimmedKey, targetLanguage }
      : { kind: "settings:save", targetLanguage };
    const response = await sendSettings(request);
    if (response.ok) {
      setSettings(response.settings);
      setApiKey("");
      setState("saved");
      setMessage("설정을 저장했습니다.");
    } else {
      setState("error");
      setMessage(response.error.message);
    }
  };

  const testConnection = async () => {
    setState("testing");
    setMessage("");
    const trimmedKey = apiKey.trim();
    const response = await sendSettings(trimmedKey
      ? { kind: "settings:test", apiKey: trimmedKey }
      : { kind: "settings:test" });
    if (response.ok) {
      setState("connected");
      setMessage("연결을 확인했습니다.");
    } else {
      setState("error");
      setMessage(response.error.message);
    }
  };

  const removeKey = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      setMessage("한 번 더 누르면 저장된 키를 삭제합니다.");
      return;
    }
    const response = await sendSettings({ kind: "settings:save", apiKey: "", targetLanguage });
    setConfirmRemove(false);
    if (response.ok) {
      setSettings(response.settings);
      setState("saved");
      setMessage("저장된 API 키를 삭제했습니다.");
    } else {
      setState("error");
      setMessage(response.error.message);
    }
  };

  const busy = state === "saving" || state === "testing";
  return (
    <main className="popup-shell">
      <form className="popup-form" aria-label="WhaleTranslator 설정" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header className="popup-header">
        <div className="popup-brand">
          <WhaleMark />
          <div><h1>WhaleTranslator</h1><p>deepseek-v4-flash</p></div>
        </div>
        <span className={`connection-chip ${settings.hasApiKey ? "is-ready" : ""}`}>
          <i aria-hidden="true" />{settings.hasApiKey ? "키 저장됨" : "설정 필요"}
        </span>
      </header>

      <section className="popup-section" aria-labelledby="api-heading">
        <div className="section-heading"><h2 id="api-heading">API 연결</h2><span>deepseek-v4-flash</span></div>
        <label className="field-label" htmlFor="api-key">API 키</label>
        <div className="key-field">
          <input
            id="api-key"
            name="apiKey"
            type={revealKey ? "text" : "password"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={settings.hasApiKey ? "새 키를 입력할 때만 변경됩니다" : "API 키 입력"}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={() => setRevealKey((value) => !value)} aria-pressed={revealKey}>{revealKey ? "숨기기" : "보기"}</button>
        </div>
        <div className="field-actions">
          <button className="quiet-button" type="button" disabled={busy || (!settings.hasApiKey && !apiKey.trim())} onClick={() => void testConnection()}>
            {state === "testing" ? "확인 중…" : "연결 테스트"}
          </button>
          {settings.hasApiKey && <button className={`remove-button ${confirmRemove ? "is-confirming" : ""}`} type="button" disabled={busy} onClick={() => void removeKey()}>키 삭제</button>}
        </div>
      </section>

      <section className="popup-section" aria-labelledby="language-heading">
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

      <p className="privacy-note">번역을 실행하면 선택하거나 입력한 텍스트가 번역 API로 전송됩니다. API 키는 이 브라우저의 확장 로컬 저장소에만 보관되며 운영체제 키체인과는 다릅니다.</p>

      <div className="popup-footer">
        <p className={`save-message is-${state}`} role={state === "error" ? "alert" : "status"}>{message}</p>
        <button className="save-button" type="submit" disabled={busy}>{state === "saving" ? "저장 중…" : "설정 저장"}</button>
      </div>
      </form>
    </main>
  );
}
