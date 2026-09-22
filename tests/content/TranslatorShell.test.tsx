import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorShell } from "../../src/content/TranslatorShell";
import { createCommandBus } from "../../src/content/command-bus";
import { requestTranslation } from "../../src/content/translation-gateway";
import { DEFAULT_SETTINGS, toPublicSettings } from "../../src/shared/settings";

vi.mock("../../src/content/translation-gateway", () => ({ requestTranslation: vi.fn() }));

const settingsResponse = { ok: true, settings: toPublicSettings(DEFAULT_SETTINGS) };
const translatedResponse = JSON.stringify({ items: [{ id: "wt-0", text: "안녕하세요" }] });

function setup() {
  const paragraph = document.createElement("p");
  paragraph.textContent = "Hello";
  document.body.append(paragraph);
  const host = document.createElement("div");
  host.dataset.whaleTranslatorRoot = "";
  document.body.append(host);
  const runtime = createCommandBus();
  render(<TranslatorShell bus={runtime.bus} />, { container: host });
  return { paragraph, ...runtime };
}

describe("page translation commands", () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = "";
    sendMessage.mockReset().mockResolvedValue(settingsResponse);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.mocked(requestTranslation).mockReset().mockResolvedValue(translatedResponse);
  });

  it("translates once, preserves the translation on repeated starts, and restores explicitly", async () => {
    const { dispatch, paragraph } = setup();
    await act(async () => dispatch({ kind: "command", command: "translate-page" }));
    expect(paragraph.textContent).toBe("안녕하세요");
    expect(screen.getByText("페이지 번역 완료")).toBeInTheDocument();
    await act(async () => dispatch({ kind: "command", command: "translate-page" }));
    expect(requestTranslation).toHaveBeenCalledOnce();
    expect(paragraph.textContent).toBe("안녕하세요");
    await act(async () => dispatch({ kind: "command", command: "restore-page" }));
    expect(paragraph.textContent).toBe("Hello");
    expect(screen.queryByText("페이지 번역 완료")).not.toBeInTheDocument();
  });

  it("cancels a pending start when restore is requested while settings load", async () => {
    const { dispatch, paragraph } = setup();
    let resolveSettings!: (value: typeof settingsResponse) => void;
    sendMessage.mockImplementation(() => new Promise((resolve) => { resolveSettings = resolve; }));
    await act(async () => {
      dispatch({ kind: "command", command: "translate-page" });
      dispatch({ kind: "command", command: "restore-page" });
      resolveSettings(settingsResponse);
    });
    expect(requestTranslation).not.toHaveBeenCalled();
    expect(paragraph.textContent).toBe("Hello");
  });

  it("keeps the keyboard shortcut as a translate/restore toggle", async () => {
    const { dispatch, paragraph } = setup();
    await act(async () => dispatch({ kind: "command", command: "toggle-page-translation" }));
    expect(paragraph.textContent).toBe("안녕하세요");
    await act(async () => dispatch({ kind: "command", command: "toggle-page-translation" }));
    expect(paragraph.textContent).toBe("Hello");
  });
});
