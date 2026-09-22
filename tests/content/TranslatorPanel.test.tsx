import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPanel } from "../../src/content/panel/TranslatorPanel";
import type { TranslationHandle } from "../../src/content/translation-gateway";

function successfulGateway(result = "안녕하세요") {
  return vi.fn((_input, onDelta: (text: string) => void = () => undefined): TranslationHandle => {
    const requestId = crypto.randomUUID();
    const promise = Promise.resolve().then(() => {
      onDelta(result);
      return result;
    });
    return { requestId, promise, cancel: vi.fn() };
  });
}

describe("TranslatorPanel", () => {
  it.each([
    ["actual-model", "actual-model"],
    [null, "모델 정보 없음"],
    ["auto", "auto (실제 모델 확인 불가)"]
  ])("shows the response model after completion: %s", async (model, label) => {
    const gateway: NonNullable<Parameters<typeof TranslatorPanel>[0]["gateway"]> = (_input, _onDelta, onModel) => ({
      requestId: crypto.randomUUID(),
      promise: Promise.resolve().then(() => { onModel?.(model); return "번역"; }),
      cancel: vi.fn()
    });
    render(<TranslatorPanel initialText="Hello" defaultTarget="ko" model="configured-model" hasApiKey onClose={vi.fn()} gateway={gateway} />);
    expect(await screen.findByText(label!)).toBeInTheDocument();
    expect(screen.queryByText("configured-model")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  it("shows the active provider model", () => {
    render(<TranslatorPanel initialText="" defaultTarget="ko" model="configured-model" hasApiKey onClose={vi.fn()} gateway={successfulGateway()} />);
    expect(screen.getByText("configured-model")).toBeInTheDocument();
  });

  it("submits selected text on open and renders the result", async () => {
    const gateway = successfulGateway();
    render(<TranslatorPanel initialText="Hello" defaultTarget="ko" model="deepseek-v4-flash" hasApiKey onClose={vi.fn()} gateway={gateway} />);
    await waitFor(() => expect(gateway).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("안녕하세요")).toBeInTheDocument();
  });

  it("focuses empty input and submits with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    const gateway = successfulGateway();
    render(<TranslatorPanel initialText="" defaultTarget="ko" model="deepseek-v4-flash" hasApiKey onClose={vi.fn()} gateway={gateway} />);
    const input = screen.getByLabelText("원문");
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "Hello");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(gateway).toHaveBeenCalledTimes(1));
  });

  it("shows missing-key guidance without sending text", async () => {
    const gateway = successfulGateway();
    render(<TranslatorPanel initialText="Hello" defaultTarget="ko" model="deepseek-v4-flash" hasApiKey={false} onClose={vi.fn()} gateway={gateway} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("API 키가 필요해요");
    expect(gateway).not.toHaveBeenCalled();
  });

  it("copies completed translation", async () => {
    const user = userEvent.setup();
    render(<TranslatorPanel initialText="Hello" defaultTarget="ko" model="deepseek-v4-flash" hasApiKey onClose={vi.fn()} gateway={successfulGateway()} />);
    const copyButton = await screen.findByRole("button", { name: "번역문 복사" });
    await waitFor(() => expect(copyButton).toBeEnabled());
    await user.click(copyButton);
    expect(await screen.findByText("번역문을 복사했습니다.")).toBeInTheDocument();
  });

  it("stays modeless and allows focus and clicks to leave the panel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const pageAction = vi.fn();
    render(
      <>
        <TranslatorPanel initialText="" defaultTarget="ko" model="deepseek-v4-flash" hasApiKey onClose={onClose} gateway={successfulGateway()} />
        <button type="button" onClick={pageAction}>페이지 동작</button>
      </>
    );

    const dialog = screen.getByRole("dialog", { name: "WhaleTranslator" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(dialog.parentElement).toHaveClass("wt-floating-layer");
    expect(dialog.parentElement).not.toHaveClass("wt-backdrop");
    expect(dialog.querySelector("[data-drag-handle]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 창 이동" })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("원문")).toHaveFocus());
    const resizeHandle = screen.getByRole("button", { name: "번역 창 크기 조절" });
    resizeHandle.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "페이지 동작" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "페이지 동작" }));
    expect(pageAction).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("TranslatorPanel dictionary", () => {
  const ENTRY = JSON.stringify({
    headword: "whale",
    reading: "weɪl",
    partOfSpeech: "noun",
    primary: { meaning: "바다에 사는 거대한 포유류", tags: ["standard"] },
    others: [],
    examples: []
  });

  function dictionaryGateway() {
    return vi.fn((input: { mode: string }, onDelta: (text: string) => void = () => undefined): TranslationHandle => {
      const result = input.mode === "dictionary" ? ENTRY : "고래";
      return {
        requestId: crypto.randomUUID(),
        promise: Promise.resolve().then(() => {
          onDelta(result);
          return result;
        }),
        cancel: vi.fn()
      };
    });
  }

  function selectInTextarea(textarea: HTMLTextAreaElement, start: number, end: number) {
    textarea.setSelectionRange(start, end);
    fireEvent.pointerUp(textarea, { clientX: 120, clientY: 140 });
  }

  it("hides the source editor when opened from a selection and reveals it from the footer", async () => {
    const user = userEvent.setup();
    render(<TranslatorPanel initialText="Whale" defaultTarget="ko" model="m" hasApiKey onClose={vi.fn()} gateway={dictionaryGateway()} />);
    expect(await screen.findByText("고래")).toBeInTheDocument();
    expect(screen.queryByLabelText("원문")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByLabelText("원문")).toHaveValue("Whale");
    expect(screen.getByRole("button", { name: "원문 숨기기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("offers a dictionary lookup for a selected word and closes it with Escape first", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const gateway = dictionaryGateway();
    render(<TranslatorPanel initialText="" defaultTarget="ko" model="m" hasApiKey onClose={onClose} gateway={gateway} />);

    const input = screen.getByLabelText("원문") as HTMLTextAreaElement;
    await user.type(input, "A blue whale sings");
    expect(screen.queryByRole("button", { name: /사전에서 찾기/ })).not.toBeInTheDocument();

    selectInTextarea(input, 7, 12);
    const chip = screen.getByRole("button", { name: '"whale" 사전에서 찾기' });
    await user.click(chip);

    const dictionary = await screen.findByRole("dialog", { name: "사전: whale" });
    expect(gateway).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: "dictionary",
      word: "whale",
      context: "A blue whale sings",
      targetLanguage: "ko"
    }));
    expect(await screen.findByText("바다에 사는 거대한 포유류")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /사전에서 찾기/ })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(dictionary).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores selections that are too long for a dictionary term", async () => {
    const user = userEvent.setup();
    render(<TranslatorPanel initialText="" defaultTarget="ko" model="m" hasApiKey onClose={vi.fn()} gateway={dictionaryGateway()} />);
    const input = screen.getByLabelText("원문") as HTMLTextAreaElement;
    const passage = "word ".repeat(20).trim();
    await user.type(input, passage);

    selectInTextarea(input, 0, passage.length);
    expect(screen.queryByRole("button", { name: /사전에서 찾기/ })).not.toBeInTheDocument();
  });
});
