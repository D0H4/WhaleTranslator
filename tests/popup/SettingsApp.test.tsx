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
  fallbackProviderIds: ["backup"],
  targetLanguage: "ko" as const
};

function providerList() {
  return within(screen.getByRole("list", { name: "편집할 프로바이더" }));
}

describe("SettingsApp", () => {
  const sendMessage = vi.fn();
  const requestPermission = vi.fn();
  const executeScript = vi.fn();
  const sendTabMessage = vi.fn();
  const queryTabs = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    requestPermission.mockReset();
    requestPermission.mockResolvedValue(true);
    sendMessage.mockResolvedValue({ ok: true, settings: savedSettings });
    queryTabs.mockResolvedValue([{ id: 7, url: "https://example.com/article" }]);
    executeScript.mockReset().mockResolvedValue([]);
    sendTabMessage.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      runtime: { sendMessage },
      permissions: { request: requestPermission },
      tabs: { create: vi.fn().mockResolvedValue(undefined), query: queryTabs, sendMessage: sendTabMessage },
      scripting: { executeScript }
    });
  });

  it("starts page translation and restores the active page without saving draft settings", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    await user.click(screen.getByRole("button", { name: "페이지 번역" }));
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ["content.js"] });
    expect(sendTabMessage).toHaveBeenLastCalledWith(7, { kind: "command", command: "translate-page" });
    await user.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(sendTabMessage).toHaveBeenLastCalledWith(7, { kind: "command", command: "restore-page" });
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "settings:save" }));
  });

  it("explains restricted pages without injecting a script", async () => {
    queryTabs.mockResolvedValue([{ id: 7, url: "chrome://settings" }]);
    const user = userEvent.setup();
    render(<SettingsApp />);
    await user.click(screen.getByRole("button", { name: "페이지 번역" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("브라우저 설정 화면");
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendTabMessage).not.toHaveBeenCalled();
  });

  it("reports injection failures and enables retry", async () => {
    executeScript.mockRejectedValueOnce(new Error("Cannot access this page"));
    const user = userEvent.setup();
    render(<SettingsApp />);
    await user.click(screen.getByRole("button", { name: "페이지 번역" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("브라우저 설정 화면");
    expect(screen.getByRole("button", { name: "페이지 번역" })).toBeEnabled();
    expect(sendTabMessage).not.toHaveBeenCalled();
  });

  it("shows every provider and the active model without exposing a saved key", async () => {
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    expect(providerList().getByRole("button", { name: /사내 API/ })).toHaveAttribute("aria-pressed", "true");
    expect(providerList().getByRole("button", { name: /백업 API/ })).toBeInTheDocument();
    const appHeading = screen.getByRole("heading", { name: "WhaleTranslator" });
    expect(appHeading.nextElementSibling).toHaveTextContent(/^translation-model$/);
    expect(screen.getByLabelText("API 키")).toHaveValue("");
  });

  it("selects a default provider separately from the profile being edited", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");
    await user.click(providerList().getByRole("button", { name: /백업 API/ }));
    expect(screen.getByLabelText("기본 프로바이더")).toHaveValue("default");
    await user.selectOptions(screen.getByLabelText("기본 프로바이더"), "backup");
    await user.click(screen.getByRole("button", { name: "설정 저장" }));

    await waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith({
      kind: "settings:save",
      providers: [
        { id: "default", name: "사내 API", baseUrl: "https://api.example.com/v1", model: "translation-model" },
        { id: "backup", name: "백업 API", baseUrl: "https://backup.example.com/v1", model: "backup-model" }
      ],
      activeProviderId: "backup",
      fallbackProviderIds: ["default"],
      targetLanguage: "ko"
    }));
    expect(requestPermission).toHaveBeenCalledWith({
      origins: ["https://api.example.com/*"]
    });
  });

  it("reorders fallback providers independently of the default provider", async () => {
    const thirdProvider = {
      id: "third",
      name: "세 번째 API",
      baseUrl: "https://third.example.com/v1",
      model: "third-model",
      hasApiKey: false
    };
    const threeProviderSettings = {
      ...savedSettings,
      providers: [...savedSettings.providers, thirdProvider],
      fallbackProviderIds: ["backup", "third"]
    };
    sendMessage.mockResolvedValue({ ok: true, settings: threeProviderSettings });

    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByRole("button", { name: "세 번째 API 우선순위 올리기" });
    await user.click(screen.getByRole("button", { name: "세 번째 API 우선순위 올리기" }));
    expect(screen.getByLabelText("기본 프로바이더")).toHaveValue("default");
    await user.click(screen.getByRole("button", { name: "설정 저장" }));

    await waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: "settings:save",
      activeProviderId: "default",
      fallbackProviderIds: ["third", "backup"]
    })));
  });

  it("does not request host access for provider presets without API keys", async () => {
    const emptyPresetSettings = {
      hasApiKey: false,
      providers: [
        {
          id: "groq",
          name: "Groq 무료 티어",
          baseUrl: "https://api.groq.com/openai/v1",
          model: "qwen/qwen3.8-27b",
          hasApiKey: false
        },
        {
          id: "nvidia-nim",
          name: "NVIDIA NIM 무료",
          baseUrl: "https://integrate.api.nvidia.com/v1",
          model: "deepseek-ai/deepseek-v4-flash-0731",
          hasApiKey: false
        }
      ],
      activeProviderId: "groq",
      fallbackProviderIds: ["nvidia-nim"],
      targetLanguage: "ko" as const
    };
    sendMessage.mockResolvedValue({ ok: true, settings: emptyPresetSettings });

    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByRole("list", { name: "편집할 프로바이더" });
    expect(providerList().getByRole("button", { name: /Groq 무료 티어/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "설정 저장" }));

    await waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith({
      kind: "settings:save",
      providers: [
        {
          id: "groq",
          name: "Groq 무료 티어",
          baseUrl: "https://api.groq.com/openai/v1",
          model: "qwen/qwen3.8-27b"
        },
        {
          id: "nvidia-nim",
          name: "NVIDIA NIM 무료",
          baseUrl: "https://integrate.api.nvidia.com/v1",
          model: "deepseek-ai/deepseek-v4-flash-0731"
        }
      ],
      activeProviderId: "groq",
      fallbackProviderIds: ["nvidia-nim"],
      targetLanguage: "ko"
    }));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("removes the active provider and promotes the remaining provider", async () => {
    const remainingSettings = {
      hasApiKey: false,
      providers: [savedSettings.providers[1]],
      activeProviderId: "backup",
      fallbackProviderIds: [],
      targetLanguage: "ko" as const
    };
    sendMessage.mockImplementation(async (message: { kind: string }) => message.kind === "settings:get"
      ? { ok: true, settings: savedSettings }
      : { ok: true, settings: remainingSettings });

    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");

    await user.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(providerList().queryByRole("button", { name: /사내 API/ })).not.toBeInTheDocument());
    expect(providerList().getByRole("button", { name: /백업 API/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("프로필을 삭제했습니다.")).toBeInTheDocument();
    expect(sendMessage).toHaveBeenLastCalledWith({ kind: "settings:remove-provider", providerId: "default" });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("removes and saves the last active provider", async () => {
    const emptySettings = {
      hasApiKey: false,
      providers: [],
      activeProviderId: "",
      fallbackProviderIds: [],
      targetLanguage: "ko" as const
    };
    sendMessage.mockImplementation(async (message: { kind: string }) => message.kind === "settings:get"
      ? { ok: true, settings: { ...savedSettings, providers: [savedSettings.providers[0]] } }
      : { ok: true, settings: emptySettings });

    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByRole("button", { name: /사내 API/ });

    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText(/저장된 프로필이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
    expect(sendMessage).toHaveBeenLastCalledWith({ kind: "settings:remove-provider", providerId: "default" });
    expect(screen.getByText("프로필을 삭제했습니다.")).toBeInTheDocument();
  });

  it("cancels an unsaved provider locally without sending a delete request", async () => {
    const user = userEvent.setup();
    render(<SettingsApp />);
    await screen.findByText("사용 준비됨");

    await user.click(screen.getByRole("button", { name: "추가" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(providerList().queryByRole("button", { name: /새 프로바이더/ })).not.toBeInTheDocument();
    expect(screen.getByText("새 프로필 추가를 취소했습니다.")).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "settings:remove-provider" }));
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
    expect(providerList().getByRole("button", { name: /개인 API/ })).toBeInTheDocument();
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
