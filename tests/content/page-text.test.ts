import { beforeEach, describe, expect, it } from "vitest";
import { collectPageText, createBatches, type PageTextEntry } from "../../src/content/page-text";

describe("page text", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects prose and excludes unsafe or hidden content", () => {
    document.body.innerHTML = `
      <main><p> Hello <strong>world</strong> </p><p>https://example.com</p></main>
      <div hidden>hidden words</div><div aria-hidden="true">secret words</div>
      <div translate="no">brand words</div><div contenteditable>draft words</div>
      <code>const answer = true</code><pre>code block</pre><input value="form words">
      <div data-whale-translator-root>extension words</div>`;
    const entries = collectPageText(document.body);
    expect(entries.map(({ translatableText }) => translatableText)).toEqual(["Hello", "world"]);
    expect(entries[0]).toMatchObject({ leadingWhitespace: " ", trailingWhitespace: " " });
  });

  it("batches by node and character limits", () => {
    const text = document.createTextNode("x");
    const entries = Array.from({ length: 25 }, (_, index) => ({
      id: `wt-${index}`,
      node: text,
      originalText: "x",
      leadingWhitespace: "",
      trailingWhitespace: "",
      translatableText: "x"
    } satisfies PageTextEntry));
    expect(createBatches(entries).map((batch) => batch.length)).toEqual([24, 1]);
  });
});
