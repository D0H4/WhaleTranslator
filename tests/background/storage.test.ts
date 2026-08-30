import { describe, expect, it, vi } from "vitest";
import { saveSettings } from "../../src/background/storage";

const STORAGE_KEY = "whaleTranslator.settings";

describe("provider settings storage", () => {
  it("preserves omitted keys, stores new keys, and clears requested keys", async () => {
    const area = {
      get: vi.fn().mockResolvedValue({
        [STORAGE_KEY]: {
          providers: [
            { id: "one", name: "One", baseUrl: "https://one.example/v1", model: "model-a", apiKey: "keep-me" },
            { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", apiKey: "remove-me" }
          ],
          activeProviderId: "one",
          targetLanguage: "ko"
        }
      }),
      set: vi.fn().mockResolvedValue(undefined)
    };

    const publicSettings = await saveSettings({
      providers: [
        { id: "one", name: "One renamed", baseUrl: "https://one.example/v1", model: "model-a" },
        { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", clearApiKey: true },
        { id: "three", name: "Three", baseUrl: "https://three.example/v1", model: "model-c", apiKey: "new-key" }
      ],
      activeProviderId: "three",
      targetLanguage: "ja"
    }, area as never);

    expect(publicSettings.hasApiKey).toBe(true);
    expect(publicSettings.providers.map(({ id, hasApiKey }) => [id, hasApiKey])).toEqual([
      ["one", true],
      ["two", false],
      ["three", true]
    ]);
    expect(area.set).toHaveBeenCalledWith({
      [STORAGE_KEY]: {
        providers: [
          { id: "one", name: "One renamed", baseUrl: "https://one.example/v1", model: "model-a", apiKey: "keep-me" },
          { id: "two", name: "Two", baseUrl: "https://two.example/v1", model: "model-b", apiKey: "" },
          { id: "three", name: "Three", baseUrl: "https://three.example/v1", model: "model-c", apiKey: "new-key" }
        ],
        activeProviderId: "three",
        targetLanguage: "ja"
      }
    });
  });
});
