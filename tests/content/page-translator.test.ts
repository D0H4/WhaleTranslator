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
  it("preserves text updated by the page while a request is pending", async () => {
    document.body.innerHTML = "<p>Hello</p>";
    const node = document.querySelector("p")!.firstChild as Text;
    const translator = new PageTranslator(async () => {
      node.data = "Live update";
      return '{"items":[{"id":"wt-0","text":"안녕하세요"}]}';
    });
    await translator.start(document.body, "ko");
    expect(node.data).toBe("Live update");
    translator.restore();
    expect(node.data).toBe("Live update");
  });

  it("does not restore stale text over a live page update", async () => {
    document.body.innerHTML = "<p>Hello</p>";
    const node = document.querySelector("p")!.firstChild as Text;
    const translator = new PageTranslator(async () => '{"items":[{"id":"wt-0","text":"안녕하세요"}]}');
    await translator.start(document.body, "ko");
    node.data = "Live update";
    translator.restore();
    expect(node.data).toBe("Live update");
  });

  it("ignores a late response after restoring during translation", async () => {
    document.body.innerHTML = "<p>Hello</p>";
    let resolveResponse!: (value: string) => void;
    const translator = new PageTranslator(() => new Promise((resolve) => { resolveResponse = resolve; }));
    const running = translator.start(document.body, "ko");
    translator.restore();
    resolveResponse('{"items":[{"id":"wt-0","text":"안녕하세요"}]}');
    await running;
    expect(document.body.textContent).toBe("Hello");
    expect(translator.getState()).toEqual({ status: "idle" });
  });

  it("resumes pending batches after cancellation without translating completed batches again", async () => {
    document.body.innerHTML = Array.from({ length: 25 }, (_, i) => `<p>Hello ${i}</p>`).join("");
    const gateway = vi.fn(async ({ items }: { items: readonly { id: string; text: string }[] }) =>
      JSON.stringify({ items: items.map(({ id }) => ({ id, text: "안녕하세요" })) }));
    const translator = new PageTranslator(gateway, 1);
    const unsubscribe = translator.subscribe((state) => {
      if (state.status === "running" && state.completed === 1) translator.cancel();
    });
    await translator.start(document.body, "ko");
    expect(translator.getState()).toMatchObject({ status: "paused", completed: 1, total: 2 });
    unsubscribe();
    await translator.retry();
    expect(gateway).toHaveBeenCalledTimes(2);
    expect(translator.getState()).toMatchObject({ status: "complete", completed: 2 });
    translator.restore();
    expect(document.querySelectorAll("p")[24]?.textContent).toBe("Hello 24");
  });

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
