import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DictionaryPanel } from "../../src/content/panel/DictionaryPanel";
import type { TranslationHandle } from "../../src/content/translation-gateway";
import { WhaleTranslatorError } from "../../src/shared/errors";

const ENTRY = JSON.stringify({
  headword: "更衣",
  reading: "こうい",
  partOfSpeech: "noun",
  primary: { meaning: "천황을 모시던 후궁의 품계", tags: ["historical"] },
  others: [{ meaning: "옷을 갈아입는 일", tags: ["standard"] }],
  examples: [{ sentence: "更衣あまたさぶらひたまひける", translation: "많은 갱의가 모시고 있었다" }]
});

function gatewayReturning(results: Array<string | Error>) {
  return vi.fn((): TranslationHandle => {
    const next = results.shift() ?? ENTRY;
    return {
      requestId: crypto.randomUUID(),
      promise: next instanceof Error ? Promise.reject(next) : Promise.resolve(next),
      cancel: vi.fn()
    };
  });
}

describe("DictionaryPanel", () => {
  it("requests a dictionary entry for the word and renders it", async () => {
    const gateway = gatewayReturning([ENTRY]);
    render(<DictionaryPanel word="更衣" context="女御、更衣あまたさぶらひたまひける" targetLanguage="ko" anchor={null} onClose={vi.fn()} gateway={gateway} />);

    expect(gateway).toHaveBeenCalledWith(expect.objectContaining({ mode: "dictionary", word: "更衣", targetLanguage: "ko" }));
    expect(await screen.findByRole("heading", { level: 2, name: "更衣" })).toBeInTheDocument();
    expect(screen.getByText("/こうい/")).toBeInTheDocument();
    expect(screen.getByText("noun")).toBeInTheDocument();
    expect(screen.getByText("천황을 모시던 후궁의 품계")).toBeInTheDocument();
    expect(screen.getByText("옷을 갈아입는 일")).toBeInTheDocument();
    expect(screen.getByText("많은 갱의가 모시고 있었다")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "사전: 更衣" }).querySelector("mark")).toHaveTextContent("更衣");
  });

  it("shows an error for unreadable answers and retries", async () => {
    const user = userEvent.setup();
    const gateway = gatewayReturning(["definitely not json", ENTRY]);
    render(<DictionaryPanel word="更衣" context="" targetLanguage="ko" anchor={null} onClose={vi.fn()} gateway={gateway} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("번역 응답을 읽지 못했어요");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("천황을 모시던 후궁의 품계")).toBeInTheDocument();
    expect(gateway).toHaveBeenCalledTimes(2);
  });

  it("maps gateway failures to public errors and closes from the header", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DictionaryPanel word="x" context="" targetLanguage="ko" anchor={null} onClose={onClose} gateway={gatewayReturning([new WhaleTranslatorError("rate-limited")])} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("요청이 잠시 제한됐어요");
    await user.click(screen.getByRole("button", { name: "사전 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
