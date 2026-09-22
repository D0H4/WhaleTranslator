import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeCommand, SettingsRequest, SettingsResponse } from "../shared/messages";
import { DEFAULT_PROVIDER_MODEL, DEFAULT_SETTINGS, toPublicSettings, type PublicSettings } from "../shared/settings";
import { PageTranslator, type PageTranslationState } from "./page-translator";
import { requestTranslation } from "./translation-gateway";
import { RetryIcon, WhaleMark } from "./panel/icons";
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
  const pendingPageStart = useRef<object | null>(null);

  const pageTranslator = useMemo(() => new PageTranslator(({ items, targetLanguage, repair, signal }) =>
    requestTranslation({ mode: "page", items, targetLanguage, repair }, signal)
  ), []);

  const refreshSettings = useCallback(async () => {
    const message: SettingsRequest = { kind: "settings:get" };
    const response = await chrome.runtime.sendMessage(message).catch(() => null) as SettingsResponse | null;
    if (response?.ok) {
      setSettings(response.settings);
      return response.settings;
    }
    return FALLBACK_SETTINGS;
  }, []);

  const restorePage = useCallback(() => {
    pendingPageStart.current = null;
    pageTranslator.restore();
  }, [pageTranslator]);

  useEffect(() => pageTranslator.subscribe(setPageState), [pageTranslator]);
  useEffect(() => {
    const message: SettingsRequest = { kind: "settings:get" };
    void chrome.runtime.sendMessage(message).then((rawResponse: unknown) => {
      const response = rawResponse as SettingsResponse;
      if (response.ok) setSettings(response.settings);
    }).catch(() => undefined);
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

    if (message.command === "restore-page") {
      restorePage();
      return;
    }
    if (message.command !== "translate-page" && message.command !== "toggle-page-translation") return;

    const status = pageTranslator.getState().status;
    if (message.command === "toggle-page-translation" && (status !== "idle" || pendingPageStart.current)) {
      restorePage();
      return;
    }
    if (pendingPageStart.current || status === "running" || status === "complete") return;
    if (status === "paused") {
      void pageTranslator.retry();
      return;
    }
    const pending = {};
    pendingPageStart.current = pending;
    void refreshSettings().then((next) => {
      if (pendingPageStart.current !== pending) return;
      pendingPageStart.current = null;
      return pageTranslator.start(document.body, next.targetLanguage);
    });
  }), [bus, pageTranslator, refreshSettings, restorePage]);

  useEffect(() => () => restorePage(), [restorePage]);

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
            {pageState.status === "paused" && <span>{pageState.error.code === "cancelled" ? "번역한 부분은 유지됩니다. 재시도하면 이어서 번역합니다." : pageState.error.message}</span>}
            {pageState.status === "complete" && <span>{pageState.total === 0 ? "번역할 텍스트가 없습니다." : "원문 보기 버튼으로 되돌릴 수 있습니다."}</span>}
          </div>
          {pageState.status === "running" && (
            <button type="button" className="wt-mini-button" onClick={() => pageTranslator.cancel()}>중지</button>
          )}
          {pageState.status === "paused" && (
            <button type="button" className="wt-mini-button" onClick={() => void pageTranslator.retry()}><RetryIcon />재시도</button>
          )}
          <button type="button" className="wt-mini-button" onClick={restorePage}>원문 보기</button>
          {pageState.status === "running" && (
            <span className="wt-page-progress" style={{ "--wt-progress": `${pageState.total ? (pageState.completed / pageState.total) * 100 : 0}%` } as React.CSSProperties} />
          )}
        </aside>
      )}
    </>
  );
}
