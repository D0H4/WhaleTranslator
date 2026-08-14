import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../../src/popup/SettingsApp";

describe("SettingsApp", () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ ok: true, settings: { hasApiKey: true, targetLanguage: "ko" } });
    vi.stubGlobal("chrome", {
      runtime: { sendMessage },
      tabs: { create: vi.fn().mockResolvedValue(undefined) }
    });
  });

  it("shows the model without provider branding", async () => {
    render(<SettingsApp />);
    await screen.findByText("키 저장됨");
    const appHeading = screen.getByRole("heading", { name: "WhaleTranslator" });
    expect(appHeading.nextElementSibling).toHaveTextContent(/^deepseek-v4-flash$/);
  });

  it("does not render a saved key and preserves it when saving a blank field", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    expect(await screen.findByText("키 저장됨")).toBeInTheDocument();
    const keyInput = screen.getByLabelText("API 키");
    expect(keyInput).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "설정 저장" }));
    await waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith({ kind: "settings:save", targetLanguage: "ko" }));
  });

  it("tests a newly entered key without saving it first", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("키 저장됨");
    await user.type(screen.getByLabelText("API 키"), "new-key");
    await user.click(screen.getByRole("button", { name: "연결 테스트" }));
    await waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith({ kind: "settings:test", apiKey: "new-key" }));
  });
});
