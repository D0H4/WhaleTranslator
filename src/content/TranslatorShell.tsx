import { useCallback, useEffect, useMemo, useState } from "react";
import type { RuntimeCommand, SettingsRequest, SettingsResponse } from "../shared/messages";
import { DEFAULT_PROVIDER_MODEL, DEFAULT_SETTINGS, toPublicSettings, type PublicSettings } from "../shared/settings";
import { PageTranslator, type PageTranslationState } from "./page-translator";
import { requestTranslation } from "./translation-gateway";
import { CloseIcon, RetryIcon, WhaleMark } from "./panel/icons";
import { TranslatorPanel } from "./panel/TranslatorPanel";
import { captureSelectionAnchor, type SelectionAnchor } from "./panel/floating-panel";

export interface CommandBus {
  subscribe(listener: (command: RuntimeCommand) => void): () => void;
}

const FALLBACK_SETTINGS: PublicSettings = toPublicSettings(DEFAULT_SETTINGS);

export function TranslatorShell({ bus }: { bus: CommandBus }) {
  const [settings, setSettings] = useState<PublicSettings>(FALLBACK_SETTINGS);
  const [panel, setPanel] = useState<{ key: number; text: string; anchor: SelectionAnchor | null } | null>(null);
  const [pageState, setPageState] = useState<PageTranslationState>({ status: "idle" });

  const pageTranslator = useMemo(() => new PageTranslator(({ items, targetLanguage, repair, signal }) =>
    requestTranslation({ mode: "page", items, targetLanguage, repair }, signal)
  ), []);

  const refreshSettings = useCallback(async () => {
    const message: SettingsRequest = { kind: "settings:get" };
    const response = await chrome.runtime.sendMessage(message) as SettingsResponse;
    if (response.ok) {
      setSettings(response.settings);
      return response.settings;
    }
    return FALLBACK_SETTINGS;
  }, []);

  useEffect(() => pageTranslator.subscribe(setPageState), [pageTranslator]);
  useEffect(() => {
    const message: SettingsRequest = { kind: "settings:get" };
    void chrome.runtime.sendMessage(message).then((rawResponse: unknown) => {
      const response = rawResponse as SettingsResponse;
      if (response.ok) setSettings(response.settings);
    });
  }, []);

  useEffect(() => bus.subscribe((message) => {
    if (message.command === "translate-selection") {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const anchor = text ? captureSelectionAnchor(selection) : null;
      void refreshSettings().then(() => {
        setPanel((current) => ({ key: (current?.key ?? 0) + 1, text, anchor }));
      });
      return;
    }

    if (pageTranslator.getState().status !== "idle") {
      pageTranslator.restore();
      return;
    }
    void refreshSettings().then((next) => pageTranslator.start(document.body, next.targetLanguage));
  }), [bus, pageTranslator, refreshSettings]);

  const model = settings.providers.find(({ id }) => id === settings.activeProviderId)?.model
    ?? settings.providers[0]?.model
    ?? DEFAULT_PROVIDER_MODEL;

  return (
    <>
      {panel && (
        <TranslatorPanel
          key={panel.key}
          initialText={panel.text}
          anchor={panel.anchor}
          defaultTarget={settings.targetLanguage}
          model={model}
          hasApiKey={settings.hasApiKey}
          onClose={() => setPanel(null)}
        />
      )}
      {pageState.status !== "idle" && (
        <aside className={`wt-page-status is-${pageState.status}`} aria-live="polite">
          <WhaleMark className="wt-page-mark" />
          <div className="wt-page-copy">
            <strong>{pageState.status === "running" ? "페이지 번역 중" : pageState.status === "complete" ? "페이지 번역 완료" : pageState.error.title}</strong>
            {pageState.status === "running" && <span>{pageState.completed} / {pageState.total} 묶음</span>}
            {pageState.status === "paused" && <span>{pageState.error.message}</span>}
            {pageState.status === "complete" && <span>단축키를 다시 누르면 원문으로 돌아갑니다.</span>}
          </div>
          {pageState.status === "running" && (
            <button type="button" className="wt-mini-button" onClick={() => pageTranslator.cancel()}>중지</button>
          )}
          {pageState.status === "paused" && (
            <button type="button" className="wt-mini-button" onClick={() => void pageTranslator.retry()}><RetryIcon />재시도</button>
          )}
          <button type="button" className="wt-page-close" aria-label="원문 복원" onClick={() => pageTranslator.restore()}><CloseIcon /></button>
          {pageState.status === "running" && (
            <span className="wt-page-progress" style={{ "--wt-progress": `${pageState.total ? (pageState.completed / pageState.total) * 100 : 0}%` } as React.CSSProperties} />
          )}
        </aside>
      )}
    </>
  );
}
