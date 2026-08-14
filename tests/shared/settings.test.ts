import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, toPublicSettings } from "../../src/shared/settings";

describe("settings", () => {
  it("defaults to Korean and an empty key", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("trims a key and rejects an unsupported target", () => {
    expect(normalizeSettings({ apiKey: " key ", targetLanguage: "xx" })).toEqual({
      apiKey: "key",
      targetLanguage: "ko"
    });
  });

  it("never exposes the key to public settings", () => {
    expect(toPublicSettings({ apiKey: "secret", targetLanguage: "ja" })).toEqual({
      hasApiKey: true,
      targetLanguage: "ja"
    });
  });
});
