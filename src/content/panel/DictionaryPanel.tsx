import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { clipLookupContext, parseDictionaryEntry, type DictionaryEntry } from "../../shared/dictionary";
import { toPublicError, type PublicError } from "../../shared/errors";
import type { LanguageCode } from "../../shared/languages";
import type { TranslationHandle } from "../translation-gateway";
import { translate as defaultTranslate } from "../translation-gateway";
import type { PanelSizing, SelectionAnchor } from "./floating-panel";
import { CloseIcon, GripIcon, RetryIcon, StarIcon } from "./icons";
import { useFloatingPanel } from "./useFloatingPanel";

type LookupGateway = typeof defaultTranslate;
type LookupState =
  | { status: "loading" }
  | { status: "success"; entry: DictionaryEntry }
  | { status: "error"; error: PublicError };

export interface DictionaryPanelProps {
  word: string;
  context: string;
  targetLanguage: LanguageCode;
  anchor: SelectionAnchor | null;
  onClose: () => void;
  gateway?: LookupGateway;
  /** The translator window owns Escape so a single key press closes one window at a time. */
  closeOnEscape?: boolean;
}

export const DICTIONARY_SIZING: PanelSizing = { width: 440, height: 520, minSize: 260 };

function highlight(sentence: string, terms: readonly string[]): ReactNode {
  const needle = terms.map((term) => term.trim()).find((term) => term && sentence.includes(term));
  if (!needle) return sentence;
  const parts = sentence.split(needle);
  return parts.flatMap((part, index) => index === 0
    ? [part]
    : [<mark className="wt-example-hit" key={index}>{needle}</mark>, part]);
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return <div className="wt-tags">{tags.map((tag) => <span className="wt-tag" key={tag}>{tag}</span>)}</div>;
}

export function DictionaryPanel({ word, context, targetLanguage, anchor, onClose, gateway = defaultTranslate, closeOnEscape = false }: DictionaryPanelProps) {
  const [state, setState] = useState<LookupState>({ status: "loading" });
  const activeRequest = useRef<TranslationHandle | null>(null);

  const close = useCallback(() => {
    activeRequest.current?.cancel();
    onClose();
  }, [onClose]);
  const { panelRef, panelStyle, dragHandleProps, moveHandleProps, resizeHandleProps, dragging, resizing } = useFloatingPanel({
    anchor,
    onClose: close,
    sizing: DICTIONARY_SIZING,
    closeOnEscape
  });

  const startLookup = useCallback(() => {
    activeRequest.current?.cancel();
    const handle = gateway({ mode: "dictionary", word, context: clipLookupContext(context, word), targetLanguage });
    activeRequest.current = handle;
    void handle.promise.then((text) => {
      if (activeRequest.current !== handle) return;
      setState({ status: "success", entry: parseDictionaryEntry(text, word) });
    }).catch((error) => {
      if (activeRequest.current !== handle) return;
      setState({ status: "error", error: toPublicError(error) });
    }).finally(() => {
      if (activeRequest.current === handle) activeRequest.current = null;
    });
  }, [context, gateway, targetLanguage, word]);

  const retry = () => {
    setState({ status: "loading" });
    startLookup();
  };

  useEffect(() => {
    startLookup();
    return () => activeRequest.current?.cancel();
  }, [startLookup]);

  const entry = state.status === "success" ? state.entry : null;
  const headword = entry?.headword ?? word;

  return (
    <div
      className={`wt-panel wt-dictionary${dragging ? " is-dragging" : ""}${resizing ? " is-resizing" : ""}`}
      role="dialog"
      aria-label={`사전: ${word}`}
      aria-busy={state.status === "loading"}
      ref={panelRef}
      style={panelStyle}
    >
      <header className="wt-dictionary-header" data-drag-handle {...dragHandleProps}>
        <button className="wt-icon-button wt-move-button" type="button" aria-label="사전 창 이동" title="방향키로 창 이동" data-no-drag {...moveHandleProps}>
          <GripIcon />
        </button>
        <button className="wt-icon-button" type="button" onClick={close} aria-label="사전 닫기" data-no-drag>
          <CloseIcon />
        </button>
      </header>

      <div className="wt-dictionary-body" tabIndex={-1} data-initial-focus>
        <div className="wt-headword-row">
          <h2 className="wt-headword">{headword}</h2>
          {entry?.reading && <span className="wt-reading">/{entry.reading}/</span>}
          {entry?.partOfSpeech && <span className="wt-tag wt-tag-pos">{entry.partOfSpeech}</span>}
        </div>

        {state.status === "loading" && (
          <div className="wt-dictionary-loading" role="status" aria-live="polite">
            <span className="wt-skeleton" style={{ width: "42%" }} />
            <span className="wt-skeleton" />
            <span className="wt-skeleton" style={{ width: "78%" }} />
            <p>사전에서 찾는 중…</p>
          </div>
        )}

        {entry && (
          <>
            <section className="wt-sense-group">
              <h3 className="wt-dictionary-label">대표 의미 <StarIcon className="wt-star" /></h3>
              <p className="wt-sense">{entry.primary.meaning}</p>
              <Tags tags={entry.primary.tags} />
            </section>

            {entry.others.length > 0 && (
              <section className="wt-sense-group">
                <h3 className="wt-dictionary-label">다른 의미</h3>
                <ol className="wt-sense-list">
                  {entry.others.map((sense, index) => (
                    <li key={index}>
                      <p className="wt-sense">{sense.meaning}</p>
                      <Tags tags={sense.tags} />
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {entry.examples.length > 0 && (
              <section className="wt-sense-group">
                <h3 className="wt-dictionary-label">예문</h3>
                <ul className="wt-examples">
                  {entry.examples.map((example, index) => (
                    <li key={index}>
                      <p className="wt-example-sentence">{highlight(example.sentence, [entry.headword, word])}</p>
                      {example.translation && <p className="wt-example-translation">{example.translation}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {state.status === "error" && (
          <div className="wt-error" role="alert">
            <span className="wt-error-pulse" aria-hidden="true" />
            <div>
              <strong>{state.error.title}</strong>
              <p>{state.error.message}</p>
              {state.error.action && (
                <button className="wt-text-button" type="button" onClick={retry}><RetryIcon />다시 시도</button>
              )}
            </div>
          </div>
        )}
      </div>

      <button className="wt-resize-handle" type="button" aria-label="사전 창 크기 조절" {...resizeHandleProps} />
    </div>
  );
}
