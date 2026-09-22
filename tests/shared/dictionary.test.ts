import { describe, expect, it } from "vitest";
import { clipLookupContext, normalizeLookupTerm, parseDictionaryEntry } from "../../src/shared/dictionary";
import { WhaleTranslatorError } from "../../src/shared/errors";
import { buildDictionaryMessages } from "../../src/shared/prompts";

describe("dictionary lookups", () => {
  it("normalizes a short selection and rejects long passages", () => {
    expect(normalizeLookupTerm("  更衣 \n ")).toBe("更衣");
    expect(normalizeLookupTerm("look   up")).toBe("look up");
    expect(normalizeLookupTerm("")).toBeNull();
    expect(normalizeLookupTerm("a".repeat(61))).toBeNull();
  });

  it("clips long context around the selected term", () => {
    const text = `${"앞 ".repeat(400)}更衣${" 뒤".repeat(400)}`;
    const clipped = clipLookupContext(text, "更衣", 50);
    expect(clipped).toContain("更衣");
    expect(clipped.length).toBeLessThanOrEqual(102);
    expect(clipped.startsWith("…")).toBe(true);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipLookupContext("short text", "text", 50)).toBe("short text");
  });

  it("parses a fenced JSON entry and normalizes tags", () => {
    const entry = parseDictionaryEntry([
      "```json",
      JSON.stringify({
        headword: "更衣",
        reading: "こうい",
        partOfSpeech: "Noun",
        primary: { meaning: "후궁의 품계", tags: ["Historical", "literary"] },
        others: [{ meaning: "옷을 갈아입는 일", tags: ["standard"] }, "탈의실"],
        examples: [{ sentence: "更衣あまた", translation: "많은 갱의" }]
      }),
      "```"
    ].join("\n"), "更衣");

    expect(entry.partOfSpeech).toBe("noun");
    expect(entry.primary).toEqual({ meaning: "후궁의 품계", tags: ["historical", "literary"] });
    expect(entry.others).toEqual([
      { meaning: "옷을 갈아입는 일", tags: ["standard"] },
      { meaning: "탈의실", tags: [] }
    ]);
    expect(entry.examples).toEqual([{ sentence: "更衣あまた", translation: "많은 갱의" }]);
  });

  it("falls back to the selected word and rejects entries without a meaning", () => {
    expect(parseDictionaryEntry('{"primary":{"meaning":"뜻"}}', "선택").headword).toBe("선택");
    expect(() => parseDictionaryEntry("not json", "선택")).toThrow(WhaleTranslatorError);
    expect(() => parseDictionaryEntry('{"headword":"x"}', "선택")).toThrowError(expect.objectContaining({ code: "invalid-response" }));
  });

  it("builds a prompt that explains in the target language and passes the selection as data", () => {
    const [system, user] = buildDictionaryMessages({ word: "更衣", context: "更衣あまたさぶらひたまひける", targetLanguage: "ko" });
    expect(system!.content).toContain("Korean (한국어)");
    expect(system!.content).toContain("strict JSON");
    expect(JSON.parse(user!.content)).toEqual({ selection: "更衣", context: "更衣あまたさぶらひたまひける" });
  });
});
