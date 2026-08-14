import { describe, expect, it, vi } from "vitest";
import { PageTranslator, parsePageResponse } from "../../src/content/page-translator";

describe("parsePageResponse", () => {
  it("requires exact IDs", () => {
    expect(parsePageResponse('{"items":[{"id":"wt-0","text":"안녕"}]}', ["wt-0"]).get("wt-0")).toBe("안녕");
    expect(() => parsePageResponse('{"items":[]}', ["wt-0"])).toThrow();
    expect(() => parsePageResponse('{"items":[{"id":"wrong","text":"x"}]}', ["wt-0"])).toThrow();
  });
});

describe("PageTranslator", () => {
  it("translates and restores connected nodes exactly", async () => {
    document.body.innerHTML = "<p> Hello world </p>";
    const gateway = vi.fn().mockResolvedValue('{"items":[{"id":"wt-0","text":"안녕하세요"}]}');
    const translator = new PageTranslator(gateway);
    await translator.start(document.body, "ko");
    expect(document.querySelector("p")?.textContent).toBe(" 안녕하세요 ");
    expect(translator.getState()).toMatchObject({ status: "complete" });
    translator.restore();
    expect(document.querySelector("p")?.textContent).toBe(" Hello world ");
  });

  it("retries invalid JSON once before pausing", async () => {
    document.body.innerHTML = "<p>Hello</p>";
    const gateway = vi.fn().mockResolvedValue("not-json");
    const translator = new PageTranslator(gateway);
    await translator.start(document.body, "ko");
    expect(gateway).toHaveBeenCalledTimes(2);
    expect(translator.getState()).toMatchObject({ status: "paused", failedBatch: 0 });
    expect(document.body.textContent).toBe("Hello");
  });
});
