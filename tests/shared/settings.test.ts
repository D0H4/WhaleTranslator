import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER,
  DEFAULT_PROVIDERS,
  DEFAULT_SETTINGS,
  GROQ_PROVIDER,
  NVIDIA_PROVIDER,
  normalizeProviderBaseUrl,
  normalizeSettings,
  orderedProviders,
  resolveProviderInput,
  toPublicSettings
} from "../../src/shared/settings";

describe("settings", () => {
  it("defaults to Korean with the local, Groq, and NVIDIA provider presets", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.providers).toEqual(DEFAULT_PROVIDERS);
    expect(DEFAULT_SETTINGS.providers).toEqual([
      DEFAULT_PROVIDER,
      {
        ...GROQ_PROVIDER,
        baseUrl: "https://api.groq.com/openai/v1",
        model: "qwen/qwen3.8-27b"
      },
      {
        ...NVIDIA_PROVIDER,
        baseUrl: "https://integrate.api.nvidia.com/v1",
        model: "deepseek-ai/deepseek-v4-flash-0731"
      }
    ]);
    expect(DEFAULT_SETTINGS.providers.every(({ apiKey }) => apiKey === "")).toBe(true);
  });

  it("migrates the legacy single API key into only the local default provider", () => {
    expect(normalizeSettings({ apiKey: " legacy-key ", targetLanguage: "ja" })).toEqual({
      providers: [
        { ...DEFAULT_PROVIDER, apiKey: "legacy-key" },
        { ...GROQ_PROVIDER },
        { ...NVIDIA_PROVIDER }
      ],
      activeProviderId: DEFAULT_PROVIDER.id,
      fallbackProviderIds: [GROQ_PROVIDER.id, NVIDIA_PROVIDER.id],
      targetLanguage: "ja"
    });
  });

  it("normalizes multiple providers and selects a valid active provider", () => {
    expect(normalizeSettings({
      providers: [
        { id: "one", name: " One ", baseUrl: "https://one.example/v1/", model: " model-a ", apiKey: " key-a " },
        { id: "two", name: "Two", baseUrl: "http://localhost:4323/v1", model: "model-b", apiKey: "key-b" }
      ],
      activeProviderId: "two",
      targetLanguage: "xx"
    })).toEqual({
      providers: [
        { id: "one", name: "One", baseUrl: "https://one.example/v1", model: "model-a", apiKey: "key-a" },
        { id: "two", name: "Two", baseUrl: "http://localhost:4323/v1", model: "model-b", apiKey: "key-b" }
      ],
      activeProviderId: "two",
      fallbackProviderIds: ["one"],
      targetLanguage: "ko"
    });
  });

  it("preserves an explicitly empty provider list", () => {
    const settings = normalizeSettings({ providers: [], activeProviderId: "", targetLanguage: "ko" });

    expect(settings).toEqual({ providers: [], activeProviderId: "", fallbackProviderIds: [], targetLanguage: "ko" });
    expect(toPublicSettings(settings)).toEqual({
      hasApiKey: false,
      providers: [],
      activeProviderId: "",
      fallbackProviderIds: [],
      targetLanguage: "ko"
    });
  });

  it("preserves an existing key when an edited provider omits it", () => {
    expect(resolveProviderInput({
      id: "one",
      name: "Renamed",
      baseUrl: "https://one.example/v1",
      model: "model-b"
    }, {
      id: "one",
      name: "One",
      baseUrl: "https://one.example/v1",
      model: "model-a",
      apiKey: "secret"
    })).toEqual({
      id: "one",
      name: "Renamed",
      baseUrl: "https://one.example/v1",
      model: "model-b",
      apiKey: "secret"
    });
  });

  it("never exposes provider keys in public settings", () => {
    const publicSettings = toPublicSettings({
      providers: [
        { id: "one", name: "One", baseUrl: "https://one.example/v1", model: "model-a", apiKey: "" },
        { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", apiKey: "secret" }
      ],
      activeProviderId: "one",
      fallbackProviderIds: ["two"],
      targetLanguage: "ja"
    });
    expect(publicSettings).toEqual({
      hasApiKey: true,
      providers: [
        { id: "one", name: "One", baseUrl: "https://one.example/v1", model: "model-a", hasApiKey: false },
        { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", hasApiKey: true }
      ],
      activeProviderId: "one",
      fallbackProviderIds: ["two"],
      targetLanguage: "ja"
    });
    expect(JSON.stringify(publicSettings)).not.toContain("secret");
  });

  it("keeps the selected default first and normalizes the fallback order", () => {
    const settings = normalizeSettings({
      providers: [
        { id: "one", name: "One", baseUrl: "https://one.example/v1", model: "model-a", apiKey: "" },
        { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", apiKey: "key-b" },
        { id: "three", name: "Three", baseUrl: "https://three.example/v1", model: "model-c", apiKey: "key-c" }
      ],
      activeProviderId: "two",
      fallbackProviderIds: ["three", "missing", "three"],
      targetLanguage: "ko"
    });

    expect(settings.fallbackProviderIds).toEqual(["three", "one"]);
    expect(orderedProviders(settings).map((provider) => provider.id)).toEqual(["two", "three", "one"]);
    expect(toPublicSettings(settings).hasApiKey).toBe(true);
  });

  it("accepts only credential-free HTTP(S) base URLs", () => {
    expect(normalizeProviderBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeProviderBaseUrl("ftp://api.example.com/v1")).toBeNull();
    expect(normalizeProviderBaseUrl("https://key@api.example.com/v1")).toBeNull();
    expect(normalizeProviderBaseUrl("https://api.example.com/v1?key=secret")).toBeNull();
  });
});
