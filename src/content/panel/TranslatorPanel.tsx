import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicError, toPublicError, type PublicError } from "../../shared/errors";
import { getLanguage, LANGUAGES, type LanguageCode } from "../../shared/languages";
import type { TranslationHandle } from "../translation-gateway";
import { translate as defaultTranslate } from "../translation-gateway";
import type { SelectionAnchor } from "./floating-panel";
import { ArrowIcon, ChevronIcon, CloseIcon, CopyIcon, MoveIcon, RetryIcon, SoundIcon, StopIcon, WhaleMark } from "./icons";
import { useFloatingPanel } from "./useFloatingPanel";
import { useSpeech } from "./useSpeech";

type PanelStatus = "idle" | "streaming" | "success" | "error";
type TranslateGateway = typeof defaultTranslate;

export interface TranslatorPanelProps {
  initialText: string;
  defaultTarget: LanguageCode;
  model: string;
  hasApiKey: boolean;
  onClose: () => void;
  anchor?: SelectionAnchor | null;
  gateway?: TranslateGateway;
}

function countCharacters(value: string): number {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }
  return Array.from(value).length;
}

export function TranslatorPanel({ initialText, defaultTarget, model, hasApiKey, onClose, anchor = null, gateway = defaultTranslate }: TranslatorPanelProps) {
  const [source, setSource] = useState(initialText);
  const [targetLanguage, setTargetLanguage] = useState(defaultTarget);
  const [translation, setTranslation] = useState("");
  const [responseModel, setResponseModel] = useState<string | null>(null);
  const [status, setStatus] = useState<PanelStatus>(hasApiKey ? "idle" : "error");
  const [error, setError] = useState<PublicError | null>(hasApiKey ? null : getPublicError("missing-key"));
  const [copyStatus, setCopyStatus] = useState("");
  const activeRequest = useRef<TranslationHandle | null>(null);
  const activeRequestId = useRef<string | null>(null);
  const submittedInitialText = useRef(false);
  const speech = useSpeech();
  const stopSpeech = speech.stop;

  const close = useCallback(() => {
    activeRequest.current?.cancel();
    stopSpeech();
    onClose();
  }, [onClose, stopSpeech]);
  const {
    panelRef,
    panelStyle,
    dragHandleProps,
    moveHandleProps,
    resizeHandleProps,
    dragging,
    resizing
  } = useFloatingPanel({ anchor, onClose: close });

  const submit = useCallback(() => {
    const text = source.trim();
    if (!hasApiKey) {
      setError(getPublicError("missing-key"));
      setStatus("error");
      return;
    }
    if (!text) return;

    activeRequest.current?.cancel();
    setTranslation("");
    setResponseModel(null);
    setError(null);
    setCopyStatus("");
    setStatus("streaming");
    const handle = gateway({ mode: "text", text, targetLanguage }, (delta) => {
      if (activeRequestId.current === handle.requestId) setTranslation((current) => current + delta);
    }, (value) => {
      if (activeRequestId.current === handle.requestId) setResponseModel(value);
    });
    activeRequest.current = handle;
    activeRequestId.current = handle.requestId;
    void handle.promise.then((result) => {
      if (activeRequestId.current !== handle.requestId) return;
      setTranslation(result);
      setStatus("success");
      activeRequest.current = null;
    }).catch((requestError) => {
      if (activeRequestId.current !== handle.requestId) return;
      setError(toPublicError(requestError));
      setStatus("error");
      activeRequest.current = null;
    });
  }, [gateway, hasApiKey, source, targetLanguage]);

  useEffect(() => {
    if (initialText.trim() && !submittedInitialText.current) {
      submittedInitialText.current = true;
      submit();
    }
  }, [initialText, submit]);

  useEffect(() => () => activeRequest.current?.cancel(), []);

  const stop = () => {
    activeRequest.current?.cancel();
    activeRequest.current = null;
    setError(getPublicError("cancelled"));
    setStatus("error");
  };

  const copy = async () => {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopyStatus("번역문을 복사했습니다.");
    } catch {
      setCopyStatus("복사하지 못했습니다.");
    }
  };

  const target = getLanguage(targetLanguage);
  return (
    <div className="wt-floating-layer">
      <div
        className={`wt-panel${dragging ? " is-dragging" : ""}${resizing ? " is-resizing" : ""}`}
        role="dialog"
        aria-labelledby="wt-title"
        ref={panelRef}
        style={panelStyle}
      >
        <header className="wt-header" data-drag-handle {...dragHandleProps}>
          <div className="wt-brand">
            <WhaleMark className="wt-mark" />
            <div>
              <h1 id="wt-title">WhaleTranslator</h1>
              <p>{status === "success"
                ? responseModel === "auto" ? "auto (실제 모델 확인 불가)" : responseModel ?? "모델 정보 없음"
                : status === "streaming" ? "응답 모델 확인 중…" : model}</p>
            </div>
          </div>
          <div className="wt-window-controls" data-no-drag>
            <button className="wt-icon-button wt-move-button" type="button" aria-label="번역 창 이동" title="방향키로 창 이동" {...moveHandleProps}>
              <MoveIcon />
            </button>
            <button className="wt-icon-button wt-close" type="button" onClick={close} aria-label="번역 창 닫기">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="wt-language-bar">
          <span className="wt-source-language">자동 감지</span>
          <ArrowIcon className="wt-direction" />
          <label className="wt-language-select">
            <span className="wt-visually-hidden">번역할 언어</span>
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value as LanguageCode)}>
              {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.nativeLabel}</option>)}
            </select>
            <ChevronIcon />
          </label>
        </div>

        {status === "streaming" && <div className="wt-stream-track" aria-hidden="true"><span /></div>}

        <main className="wt-workspace">
          <section className="wt-text-pane wt-source-pane">
            <div className="wt-pane-heading">
              <label htmlFor="wt-source">원문</label>
              <span>{countCharacters(source).toLocaleString()}자</span>
            </div>
            <textarea
              id="wt-source"
              data-initial-focus
              value={source}
              placeholder="번역할 내용을 입력하거나 붙여넣으세요"
              onChange={(event) => setSource(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <div className="wt-pane-actions">
              <button
                className="wt-icon-button"
                type="button"
                aria-label={speech.speaking === "source" ? "원문 읽기 중지" : "원문 읽기"}
                aria-pressed={speech.speaking === "source"}
                disabled={!speech.supported || !source.trim()}
                onClick={() => speech.toggle("source", source)}
              >
                {speech.speaking === "source" ? <StopIcon /> : <SoundIcon />}
              </button>
              <span className="wt-shortcut">⌘/Ctrl ↵</span>
              {status === "streaming"
                ? <button className="wt-secondary-button" type="button" onClick={stop}>중지</button>
                : <button className="wt-primary-button" type="button" disabled={!source.trim()} onClick={submit}>번역</button>}
            </div>
          </section>

          <section className="wt-text-pane wt-result-pane" aria-busy={status === "streaming"}>
            <div className="wt-pane-heading">
              <span>{target.nativeLabel}</span>
              <span>{countCharacters(translation).toLocaleString()}자</span>
            </div>
            <div className={`wt-output ${!translation ? "is-empty" : ""}`} tabIndex={0}>
              {translation || (status === "streaming" ? "번역을 시작하고 있어요…" : "번역문이 여기에 표시됩니다.")}
            </div>
            <div className="wt-pane-actions">
              <button
                className="wt-icon-button"
                type="button"
                aria-label={speech.speaking === "translation" ? "번역문 읽기 중지" : "번역문 읽기"}
                aria-pressed={speech.speaking === "translation"}
                disabled={!speech.supported || !translation}
                onClick={() => speech.toggle("translation", translation, targetLanguage)}
              >
                {speech.speaking === "translation" ? <StopIcon /> : <SoundIcon />}
              </button>
              {status === "error" && error?.action === "다시 시도" && (
                <button className="wt-text-button" type="button" onClick={submit}><RetryIcon />다시 시도</button>
              )}
              {copyStatus && <span className="wt-copy-status" role="status" aria-live="polite">{copyStatus}</span>}
              <button className="wt-icon-button wt-copy" type="button" onClick={() => void copy()} disabled={!translation} aria-label="번역문 복사">
                <CopyIcon />
              </button>
            </div>
          </section>
        </main>

        {error && status === "error" && (
          <div className="wt-message-slot">
            <div className={`wt-error wt-error-${error.code}`} role="alert">
              <span className="wt-error-pulse" aria-hidden="true" />
              <div><strong>{error.title}</strong><p>{error.message}</p></div>
            </div>
          </div>
        )}
        <p className="wt-live" aria-live="polite">{status === "streaming" ? "번역 중" : ""}</p>
        <button
          className="wt-resize-handle"
          type="button"
          aria-label="번역 창 크기 조절"
          {...resizeHandleProps}
        />
      </div>
    </div>
  );
}
