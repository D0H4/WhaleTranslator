import { describe, expect, it, vi } from "vitest";
import { saveSettings, seedDefaultProviderPresets } from "../../src/background/storage";

const STORAGE_KEY = "whaleTranslator.settings";

describe("provider settings storage", () => {
  it("adds new default provider presets once without replacing existing profiles", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const area = {
      get: vi.fn().mockResolvedValue({
        [STORAGE_KEY]: {
          providers: [
            { id: "existing", name: "Existing", baseUrl: "https://existing.example/v1", model: "model", apiKey: "keep-me" }
          ],
          activeProviderId: "existing",
          targetLanguage: "ja"
        }
      }),
      set
    };

    await seedDefaultProviderPresets(area as never);

    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEY]: {
        providers: [
          { id: "existing", name: "Existing", baseUrl: "https://existing.example/v1", model: "model", apiKey: "keep-me" },
          {
            id: "groq",
            name: "Groq 무료 티어",
            baseUrl: "https://api.groq.com/openai/v1",
            model: "openai/gpt-oss-120b",
            apiKey: ""
          },
          {
            id: "nvidia-nim",
            name: "NVIDIA NIM 무료",
            baseUrl: "https://integrate.api.nvidia.com/v1",
            model: "deepseek-ai/deepseek-v4-flash-0731",
            apiKey: ""
          }
        ],
        activeProviderId: "existing",
        targetLanguage: "ja"
      },
      "whaleTranslator.providerPresetsVersion": 1
    });
  });

  it("does not restore provider presets after their version was seeded", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const area = {
      get: vi.fn().mockResolvedValue({
        [STORAGE_KEY]: { providers: [], activeProviderId: "", targetLanguage: "ko" },
        "whaleTranslator.providerPresetsVersion": 1
      }),
      set
    };

    await seedDefaultProviderPresets(area as never);

    expect(set).not.toHaveBeenCalled();
  });

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
