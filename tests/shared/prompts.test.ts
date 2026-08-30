import { describe, expect, it } from "vitest";
import { buildPageMessages, buildTextMessages } from "../../src/shared/prompts";

describe("translation prompts", () => {
  it("adds the Korean writing instructions to text translations targeting Korean", () => {
    const systemMessage = buildTextMessages("Hello", "ko")[0]!;

    expect(systemMessage.content).toContain("Apply the following Korean writing instructions");
    expect(systemMessage.content).toContain("의미가 있는 문장 성분을 생략하지 않습니다");
    expect(systemMessage.content).toContain("엠대시(—)는");
  });

  it("adds the Korean writing instructions to page text values targeting Korean", () => {
    const systemMessage = buildPageMessages([{ id: "item-1", text: "Hello" }], "ko")[0]!;

    expect(systemMessage.content).toContain("every translated text value");
    expect(systemMessage.content).toContain("의미가 명확한 한국어 문장을 완성할 수 있습니다");
  });

  it("does not add the Korean writing instructions for other target languages", () => {
    const textSystemMessage = buildTextMessages("안녕하세요", "en")[0]!;
    const pageSystemMessage = buildPageMessages([{ id: "item-1", text: "안녕하세요" }], "ja")[0]!;

    expect(textSystemMessage.content).not.toContain("Apply the following Korean writing instructions");
    expect(pageSystemMessage.content).not.toContain("Apply the following Korean writing instructions");
  });
});
