import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../../src/popup/SettingsApp";

const savedSettings = {
  hasApiKey: true,
  providers: [
    {
      id: "default",
      name: "사내 API",
      baseUrl: "https://api.example.com/v1",
      model: "translation-model",
      hasApiKey: true
    },
    {
      id: "backup",
      name: "백업 API",
      baseUrl: "https://backup.example.com/v1",
      model: "backup-model",
      hasApiKey: false
    }
  ],
  activeProviderId: "default",
  targetLanguage: "ko" as const
};

describe("SettingsApp", () => {
  const sendMessage = vi.fn();
  const requestPermission = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    requestPermission.mockReset();
    requestPermission.mockResolvedValue(true);
    sendMessage.mockResolvedValue({ ok: true, settings: savedSettings });
    vi.stubGlobal("chrome", {
      runtime: { sendMessage },
      permissions: { request: requestPermission },
      tabs: { create: vi.fn().mockResolvedValue(undefined) }
    });
  });

  it("shows every provider and the active model without exposing a saved key", async () => {
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    expect(screen.getByRole("button", { name: /사내 API/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /백업 API/ })).toBeInTheDocument();
    const appHeading = screen.getByRole("heading", { name: "WhaleTranslator" });
    expect(appHeading.nextElementSibling).toHaveTextContent(/^translation-model$/);
    expect(screen.getByLabelText("API 키")).toHaveValue("");
  });

  it("switches the active provider and saves all profiles while preserving blank keys", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    await user.click(screen.getByRole("button", { name: /백업 API/ }));
    await user.click(screen.getByRole("button", { name: "설정 저장" }));

    await waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith({
      kind: "settings:save",
      providers: [
        { id: "default", name: "사내 API", baseUrl: "https://api.example.com/v1", model: "translation-model" },
        { id: "backup", name: "백업 API", baseUrl: "https://backup.example.com/v1", model: "backup-model" }
      ],
      activeProviderId: "backup",
      targetLanguage: "ko"
    }));
    expect(requestPermission).toHaveBeenCalledWith({
      origins: ["https://api.example.com/*", "https://backup.example.com/*"]
    });
  });

  it("adds and configures another provider", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    await user.click(screen.getByRole("button", { name: "추가" }));

    await user.clear(screen.getByLabelText("프로바이더 이름"));
    await user.type(screen.getByLabelText("프로바이더 이름"), "개인 API");
    await user.type(screen.getByLabelText("Base URL"), "https://personal.example/v1");
    await user.type(screen.getByLabelText("모델"), "personal-model");
    await user.type(screen.getByLabelText("API 키"), "new-secret");
    expect(screen.getByRole("button", { name: /개인 API/ })).toBeInTheDocument();
  });

  it("tests the edited provider without saving it first", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    await user.type(screen.getByLabelText("API 키"), "new-key");
    await user.click(screen.getByRole("button", { name: "이 프로바이더 연결 테스트" }));

    await waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith({
      kind: "settings:test",
      provider: {
        id: "default",
        name: "사내 API",
        baseUrl: "https://api.example.com/v1",
        model: "translation-model",
        apiKey: "new-key"
      }
    }));
    expect(requestPermission).toHaveBeenCalledWith({ origins: ["https://api.example.com/*"] });
  });

  it("shows provider guidance when a connection response is incompatible", async () => {
    sendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "settings:get") return { ok: true, settings: savedSettings };
      return {
        ok: false,
        error: {
          code: "invalid-response",
          title: "번역 응답을 읽지 못했어요",
          message: "원문은 그대로 유지했습니다. 다시 요청해 주세요.",
          action: "다시 시도"
        }
      };
    });

    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    await user.click(screen.getByRole("button", { name: "이 프로바이더 연결 테스트" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "프로바이더 응답을 확인하지 못했습니다. Base URL, 모델 ID 또는 응답 형식을 확인해 주세요."
    );
    expect(screen.queryByText("원문은 그대로 유지했습니다. 다시 요청해 주세요.")).not.toBeInTheDocument();
  });

  it("shows field guidance instead of sending invalid provider settings", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    await user.clear(screen.getByLabelText("Base URL"));
    await user.click(screen.getByRole("button", { name: "설정 저장" }));

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/잘못된 프로바이더/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP\(S\) Base URL/)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "settings:save" }));
  });
});
