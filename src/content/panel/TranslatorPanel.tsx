import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { getPublicError, toPublicError, type PublicError } from "../../shared/errors";
import { getLanguage, LANGUAGES, type LanguageCode } from "../../shared/languages";
import type { TranslationHandle } from "../translation-gateway";
import { translate as defaultTranslate } from "../translation-gateway";
import { DictionaryPanel } from "./DictionaryPanel";
import type { SelectionAnchor } from "./floating-panel";
import { ArrowIcon, BookIcon, ChevronIcon, CloseIcon, CopyIcon, GripIcon, RetryIcon, SoundIcon, StopIcon, WhaleMark } from "./icons";
import { pointAnchor, readElementSelection, readTextareaSelection, type SelectedTerm } from "./text-selection";
import { useFloatingPanel } from "./useFloatingPanel";
import { useSpeech } from "./useSpeech";

type PanelStatus = "idle" | "streaming" | "success" | "error";
type TranslateGateway = typeof defaultTranslate;
type TextChannel = "source" | "translation";

interface PointerPoint {
  x: number;
  y: number;
}

interface LookupCandidate extends SelectedTerm {
  context: string;
  point: PointerPoint | null;
  /** Chip position relative to the panel, computed when the selection is captured. */
  style: CSSProperties;
}

interface DictionaryRequest {
  key: number;
  word: string;
  context: string;
  anchor: SelectionAnchor | null;
}

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

function pointOf(event: ReactPointerEvent<HTMLElement>): PointerPoint {
  return { x: event.clientX, y: event.clientY };
}

const CHIP_INSET = 64;

function chipStyle(term: SelectedTerm, point: PointerPoint | null, panel: HTMLElement | null): CSSProperties {
  const bounds = panel?.getBoundingClientRect() ?? { left: 0, top: 0, width: 480, height: 400 };
  const centerX = term.rect ? (term.rect.left + term.rect.right) / 2 : point?.x ?? bounds.left + bounds.width / 2;
  const bottom = term.rect ? term.rect.bottom : (point?.y ?? bounds.top + 80) + 8;
  const left = Math.min(Math.max(centerX - bounds.left, CHIP_INSET), Math.max(CHIP_INSET, bounds.width - CHIP_INSET));
  const top = Math.min(Math.max(bottom - bounds.top + 6, 48), Math.max(48, bounds.height - 56));
  return { left: `${left}px`, top: `${top}px` };
}

export function TranslatorPanel({ initialText, defaultTarget, model, hasApiKey, onClose, anchor = null, gateway = defaultTranslate }: TranslatorPanelProps) {
  const [source, setSource] = useState(initialText);
  const [sourceOpen, setSourceOpen] = useState(!initialText.trim());
  const [targetLanguage, setTargetLanguage] = useState(defaultTarget);
  const [translation, setTranslation] = useState("");
  const [responseModel, setResponseModel] = useState<string | null>(null);
  const [status, setStatus] = useState<PanelStatus>(hasApiKey ? "idle" : "error");
  const [error, setError] = useState<PublicError | null>(hasApiKey ? null : getPublicError("missing-key"));
  const [copyStatus, setCopyStatus] = useState("");
  const [candidate, setCandidate] = useState<LookupCandidate | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryRequest | null>(null);
  const dictionaryOpen = useRef(false);
  const activeRequest = useRef<TranslationHandle | null>(null);
  const activeRequestId = useRef<string | null>(null);
  const submittedInitialText = useRef(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const speech = useSpeech();
  const stopSpeech = speech.stop;

  const close = useCallback(() => {
    activeRequest.current?.cancel();
    stopSpeech();
    onClose();
  }, [onClose, stopSpeech]);
  const closeDictionary = useCallback(() => {
    dictionaryOpen.current = false;
    setDictionary(null);
  }, []);
  const handleEscape = useCallback(() => {
    if (dictionaryOpen.current) {
      closeDictionary();
      return;
    }
    close();
  }, [close, closeDictionary]);
  const {
    panelRef,
    panelStyle,
    dragHandleProps,
    moveHandleProps,
    resizeHandleProps,
    dragging,
    resizing
  } = useFloatingPanel({ anchor, onClose: handleEscape });

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
    setCandidate(null);
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

  const toggleSource = () => {
    setSourceOpen((open) => {
      if (!open) requestAnimationFrame(() => sourceRef.current?.focus());
      return !open;
    });
  };

  const captureCandidate = (channel: TextChannel, point: PointerPoint | null) => {
    const term = channel === "source"
      ? (sourceRef.current ? readTextareaSelection(sourceRef.current) : null)
      : (outputRef.current ? readElementSelection(outputRef.current) : null);
    if (!term) {
      setCandidate(null);
      return;
    }
    setCandidate({
      ...term,
      context: channel === "source" ? source : translation,
      point,
      style: chipStyle(term, point, panelRef.current)
    });
  };

  const openDictionary = () => {
    if (!candidate) return;
    const bounds = panelRef.current?.getBoundingClientRect();
    const fallback = bounds ? { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom } : null;
    const lookupAnchor = candidate.rect ?? (candidate.point ? pointAnchor(candidate.point.x, candidate.point.y) : fallback);
    dictionaryOpen.current = true;
    setDictionary((current) => ({
      key: (current?.key ?? 0) + 1,
      word: candidate.text,
      context: candidate.context,
      anchor: lookupAnchor
    }));
    setCandidate(null);
  };

  const target = getLanguage(targetLanguage);
  const modelLabel = status === "success"
    ? responseModel === "auto" ? "auto (실제 모델 확인 불가)" : responseModel ?? "모델 정보 없음"
    : status === "streaming" ? "응답 모델 확인 중…" : model;
  const showRetry = status === "error" && error?.action === "다시 시도";

  return (
    <div className="wt-floating-layer">
      <div
        className={`wt-panel wt-translator${dragging ? " is-dragging" : ""}${resizing ? " is-resizing" : ""}`}
        role="dialog"
        aria-labelledby="wt-title"
        ref={panelRef}
        style={panelStyle}
      >
        <header className="wt-header" data-drag-handle {...dragHandleProps}>
          <div className="wt-brand">
            <WhaleMark className="wt-mark" />
            <h1 id="wt-title">WhaleTranslator</h1>
          </div>
          <div className="wt-window-controls" data-no-drag>
            <button className="wt-icon-button wt-move-button" type="button" aria-label="번역 창 이동" title="방향키로 창 이동" {...moveHandleProps}>
              <GripIcon />
            </button>
            <button className="wt-icon-button wt-close" type="button" onClick={close} aria-label="번역 창 닫기">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="wt-language-bar">
          <span className="wt-language wt-source-language">자동 감지</span>
          <ArrowIcon className="wt-direction" />
          <label className="wt-language wt-language-select">
            <span className="wt-visually-hidden">번역할 언어</span>
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value as LanguageCode)}>
              {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.nativeLabel}</option>)}
            </select>
            <ChevronIcon />
          </label>
        </div>

        <div className="wt-stream-track" data-active={status === "streaming" || undefined} aria-hidden="true"><span /></div>

        <div className="wt-body" onScroll={() => setCandidate(null)} onPointerDown={() => setCandidate(null)}>
          {sourceOpen && (
            <section className="wt-source" id="wt-source-section">
              <div className="wt-pane-heading">
                <label htmlFor="wt-source">원문</label>
                <span>{countCharacters(source).toLocaleString()}자</span>
              </div>
              <textarea
                id="wt-source"
                ref={sourceRef}
                data-initial-focus
                value={source}
                rows={3}
                placeholder="번역할 내용을 입력하거나 붙여넣으세요"
                onChange={(event) => setSource(event.target.value)}
                onPointerUp={(event) => captureCandidate("source", pointOf(event))}
                onKeyUp={() => captureCandidate("source", null)}
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
          )}

          <section className="wt-result" aria-busy={status === "streaming"} aria-label={`${target.nativeLabel} 번역문`}>
            <div
              ref={outputRef}
              className={`wt-output${!translation ? " is-empty" : ""}`}
              tabIndex={0}
              data-initial-focus={sourceOpen ? undefined : ""}
              onPointerUp={(event) => captureCandidate("translation", pointOf(event))}
              onKeyUp={() => captureCandidate("translation", null)}
            >
              {translation || (status === "streaming" ? "번역을 시작하고 있어요…" : "번역문이 여기에 표시됩니다.")}
            </div>
            {error && status === "error" && (
              <div className={`wt-error wt-error-${error.code}`} role="alert">
                <span className="wt-error-pulse" aria-hidden="true" />
                <div><strong>{error.title}</strong><p>{error.message}</p></div>
              </div>
            )}
          </section>
        </div>

        {candidate && (
          <button
            className="wt-lookup-chip"
            type="button"
            style={candidate.style}
            onClick={openDictionary}
            aria-label={`"${candidate.text}" 사전에서 찾기`}
          >
            <BookIcon />사전
          </button>
        )}

        <footer className="wt-footer">
          <div className="wt-footer-status">
            {status === "streaming" && <button className="wt-text-button" type="button" onClick={stop}><StopIcon />중지</button>}
            {showRetry && <button className="wt-text-button" type="button" onClick={submit}><RetryIcon />다시 시도</button>}
            {status !== "streaming" && !showRetry && <span className="wt-model" title="번역 모델">{modelLabel}</span>}
            {translation && status === "success" && <span className="wt-count">{countCharacters(translation).toLocaleString()}자</span>}
            {copyStatus && <span className="wt-copy-status" role="status" aria-live="polite">{copyStatus}</span>}
          </div>
          <div className="wt-footer-actions">
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
            <button
              className={`wt-icon-button wt-source-toggle${sourceOpen ? " is-open" : ""}`}
              type="button"
              aria-expanded={sourceOpen}
              aria-controls="wt-source-section"
              aria-label={sourceOpen ? "원문 숨기기" : "원문 보기"}
              onClick={toggleSource}
            >
              <ChevronIcon />
            </button>
            <button className="wt-icon-button wt-copy" type="button" onClick={() => void copy()} disabled={!translation} aria-label="번역문 복사">
              <CopyIcon />
            </button>
          </div>
        </footer>

        <p className="wt-live" aria-live="polite">{status === "streaming" ? "번역 중" : ""}</p>
        <button
          className="wt-resize-handle"
          type="button"
          aria-label="번역 창 크기 조절"
          {...resizeHandleProps}
        />
      </div>

      {dictionary && (
        <DictionaryPanel
          key={dictionary.key}
          word={dictionary.word}
          context={dictionary.context}
          targetLanguage={targetLanguage}
          anchor={dictionary.anchor}
          gateway={gateway}
          onClose={closeDictionary}
        />
      )}
    </div>
  );
}
