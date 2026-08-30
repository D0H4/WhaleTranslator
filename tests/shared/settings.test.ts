import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER,
  DEFAULT_SETTINGS,
  normalizeProviderBaseUrl,
  normalizeSettings,
  resolveProviderInput,
  toPublicSettings
} from "../../src/shared/settings";

describe("settings", () => {
  it("defaults to Korean and one empty provider", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates the legacy single API key into the default provider", () => {
    expect(normalizeSettings({ apiKey: " legacy-key ", targetLanguage: "ja" })).toEqual({
      providers: [{ ...DEFAULT_PROVIDER, apiKey: "legacy-key" }],
      activeProviderId: DEFAULT_PROVIDER.id,
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
        { id: "one", name: "One", baseUrl: "https://one.example/v1", model: "model-a", apiKey: "secret" },
        { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", apiKey: "" }
      ],
      activeProviderId: "one",
      targetLanguage: "ja"
    });
    expect(publicSettings).toEqual({
      hasApiKey: true,
      providers: [
        { id: "one", name: "One", baseUrl: "https://one.example/v1", model: "model-a", hasApiKey: true },
        { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", hasApiKey: false }
      ],
      activeProviderId: "one",
      targetLanguage: "ja"
    });
    expect(JSON.stringify(publicSettings)).not.toContain("secret");
  });

  it("accepts only credential-free HTTP(S) base URLs", () => {
    expect(normalizeProviderBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeProviderBaseUrl("ftp://api.example.com/v1")).toBeNull();
    expect(normalizeProviderBaseUrl("https://key@api.example.com/v1")).toBeNull();
    expect(normalizeProviderBaseUrl("https://api.example.com/v1?key=secret")).toBeNull();
  });
});
