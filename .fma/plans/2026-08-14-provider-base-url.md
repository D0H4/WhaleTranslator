# Provider Base URL Change Implementation Plan

**Goal:** Route translations through `http://100.115.209.7:4323/v1`, keep `deepseek-v4-flash`, and remove camelAI branding from maintained code and user-visible text.

**Architecture:** Keep the existing service-worker-only raw `fetch` integration. A provider-neutral client owns the `/v1` base URL, derives `/chat/completions`, preserves Bearer authentication and SSE handling, and exposes the same streaming behavior to the service worker.

**Tech Stack:** TypeScript 6, React 19, Chrome Manifest V3, Vitest, Vite

---

The workspace is not a Git repository, so this plan intentionally has no commit steps. No OpenAI SDK dependency will be added.

## File Structure

- Create `src/background/provider-client.ts`: provider-neutral OpenAI-compatible streaming client.
- Delete `src/background/camel-client.ts`: obsolete provider-branded client.
- Modify `src/background/service-worker.ts`: import and call the provider-neutral client.
- Create `tests/background/provider-client.test.ts`: request URL, payload, auth, streaming, and error mapping coverage.
- Delete `tests/background/camel-client.test.ts`: obsolete provider-branded test path.
- Modify `static/manifest.json`: exact new host permission and provider-neutral description.
- Modify `tests/manifest.test.ts`: exact permission regression test.
- Modify `src/shared/errors.ts`: provider-neutral user-facing error copy.
- Modify `src/popup/SettingsApp.tsx`: model-only identity and provider-neutral settings copy.
- Modify `src/content/panel/TranslatorPanel.tsx`: model-only subtitle.
- Modify `tests/popup/SettingsApp.test.tsx`: regression coverage for model-only identity.
- Modify `tests/content/TranslatorPanel.test.tsx`: regression coverage for model-only identity.
- Modify `README.md`: new endpoint, generic API-key language, and updated privacy text.
- Regenerate `dist/**` through `npm run build` as part of the final check.

### Task 1: Provider-neutral streaming client

**Files:**
- Create: `tests/background/provider-client.test.ts`
- Delete: `tests/background/camel-client.test.ts`
- Create: `src/background/provider-client.ts`
- Delete: `src/background/camel-client.ts`
- Modify: `src/background/service-worker.ts:1,59`

- [ ] **Step 1: Replace the branded client test with a failing provider-client test**

Create `tests/background/provider-client.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  CHAT_COMPLETIONS_ENDPOINT,
  PROVIDER_BASE_URL,
  streamCompletion
} from "../../src/background/provider-client";

function sseResponse(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`);
}

describe("streamCompletion", () => {
  it("sends the expected OpenAI-compatible request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse("번역"));
    const onDelta = vi.fn();
    const messages = [{ role: "user" as const, content: "hello" }];

    await expect(streamCompletion({
      apiKey: "secret",
      messages,
      signal: new AbortController().signal,
      onDelta,
      fetchImpl
    })).resolves.toBe("번역");

    expect(PROVIDER_BASE_URL).toBe("http://100.115.209.7:4323/v1");
    expect(CHAT_COMPLETIONS_ENDPOINT).toBe(`${PROVIDER_BASE_URL}/chat/completions`);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CHAT_COMPLETIONS_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "deepseek-v4-flash",
      messages,
      stream: true
    });
    expect(onDelta).toHaveBeenCalledWith("번역");
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate-limited"],
    [503, "service"]
  ])("maps HTTP %s to %s", async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status }));
    await expect(streamCompletion({
      apiKey: "secret",
      messages: [],
      signal: new AbortController().signal,
      onDelta: () => undefined,
      fetchImpl
    })).rejects.toMatchObject({ code });
  });
});
```

Delete `tests/background/camel-client.test.ts`.

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
npx vitest run tests/background/provider-client.test.ts
```

Expected: FAIL because `src/background/provider-client.ts` does not exist.

- [ ] **Step 3: Implement the provider-neutral client**

Create `src/background/provider-client.ts` with:

```ts
import { WhaleTranslatorError } from "../shared/errors";
import type { ChatMessage } from "../shared/prompts";
import { collectAssistantDeltas } from "./sse";

export const PROVIDER_BASE_URL = "http://100.115.209.7:4323/v1";
export const CHAT_COMPLETIONS_ENDPOINT = `${PROVIDER_BASE_URL}/chat/completions`;
export const TRANSLATION_MODEL = "deepseek-v4-flash";

function statusToError(status: number): WhaleTranslatorError {
  if (status === 401 || status === 403) return new WhaleTranslatorError("unauthorized");
  if (status === 408) return new WhaleTranslatorError("network");
  if (status === 429) return new WhaleTranslatorError("rate-limited");
  if (status >= 500) return new WhaleTranslatorError("service");
  return new WhaleTranslatorError("invalid-response");
}

export async function streamCompletion(options: {
  apiKey: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(CHAT_COMPLETIONS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: TRANSLATION_MODEL,
        messages: options.messages,
        stream: true
      }),
      signal: options.signal
    });
  } catch (error) {
    if (options.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new WhaleTranslatorError("cancelled");
    }
    throw new WhaleTranslatorError("network");
  }

  if (!response.ok) throw statusToError(response.status);
  if (!response.body) throw new WhaleTranslatorError("invalid-response");

  return collectAssistantDeltas(response.body, options.onDelta);
}
```

Delete `src/background/camel-client.ts`. In `src/background/service-worker.ts`, replace the import and invocation with:

```ts
import { streamCompletion } from "./provider-client";
```

```ts
const text = await streamCompletion({
  apiKey,
  messages: messagesFor(input),
  signal: controller.signal,
  onDelta: (delta) => emit({ kind: "delta", requestId, text: delta })
});
```

- [ ] **Step 4: Run the client test to verify it passes**

Run:

```bash
npx vitest run tests/background/provider-client.test.ts
```

Expected: 2 tests pass, including all four status-table cases.

### Task 2: Restrict extension access to the new provider

**Files:**
- Modify: `tests/manifest.test.ts:6-11`
- Modify: `static/manifest.json:5,8`

- [ ] **Step 1: Change the manifest regression test first**

Replace the first test in `tests/manifest.test.ts` with:

```ts
it("uses temporary page access and only the configured API host", () => {
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
  expect(manifest.host_permissions).toEqual(["http://100.115.209.7:4323/*"]);
  expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
});
```

- [ ] **Step 2: Run the manifest test to verify it fails**

Run:

```bash
npx vitest run tests/manifest.test.ts
```

Expected: FAIL because the manifest still grants `https://stream.camelai.com/*`.

- [ ] **Step 3: Update the manifest description and exact host permission**

Set these fields in `static/manifest.json`:

```json
"description": "Translate selected text or the current page with deepseek-v4-flash.",
"host_permissions": ["http://100.115.209.7:4323/*"]
```

- [ ] **Step 4: Run the manifest test to verify it passes**

Run:

```bash
npx vitest run tests/manifest.test.ts
```

Expected: 2 tests pass.

### Task 3: Remove provider branding from the UI and errors

**Files:**
- Modify: `tests/popup/SettingsApp.test.tsx`
- Modify: `tests/content/TranslatorPanel.test.tsx`
- Modify: `src/shared/errors.ts:20-43`
- Modify: `src/popup/SettingsApp.tsx:62,94,102,111,139`
- Modify: `src/content/panel/TranslatorPanel.tsx:131`

- [ ] **Step 1: Add failing model-only identity tests**

Add this test to `tests/popup/SettingsApp.test.tsx`:

```tsx
it("shows the model without provider branding", async () => {
  render(<SettingsApp />);
  await screen.findByText("키 저장됨");
  expect(screen.getAllByText("deepseek-v4-flash").length).toBeGreaterThan(0);
  expect(document.body).not.toHaveTextContent(/camelai/i);
});
```

Add this test to `tests/content/TranslatorPanel.test.tsx`:

```tsx
it("shows the model without provider branding", () => {
  render(<TranslatorPanel initialText="" defaultTarget="ko" hasApiKey onClose={vi.fn()} gateway={successfulGateway()} />);
  expect(screen.getByText("deepseek-v4-flash")).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/camelai/i);
});
```

- [ ] **Step 2: Run the two UI test files to verify the new tests fail**

Run:

```bash
npx vitest run tests/popup/SettingsApp.test.tsx tests/content/TranslatorPanel.test.tsx
```

Expected: FAIL because both components still render `camelAI`.

- [ ] **Step 3: Replace provider-branded UI and error copy**

In `src/shared/errors.ts`, use:

```ts
"missing-key": {
  title: "API 키가 필요해요",
  message: "확장 아이콘을 눌러 API 키를 먼저 저장해 주세요.",
  action: "설정 확인"
},
unauthorized: {
  title: "API 키를 확인해 주세요",
  message: "API 서버가 이 키를 인증하지 못했습니다.",
  action: "다시 설정"
},
```

and change the service error title to:

```ts
title: "API 서버가 응답하지 않아요",
```

In `src/popup/SettingsApp.tsx`, use these replacements:

```tsx
setMessage("연결을 확인했습니다.");
```

```tsx
<div><h1>WhaleTranslator</h1><p>deepseek-v4-flash</p></div>
```

```tsx
<div className="section-heading"><h2 id="api-heading">API 연결</h2><span>deepseek-v4-flash</span></div>
```

```tsx
placeholder={settings.hasApiKey ? "새 키를 입력할 때만 변경됩니다" : "API 키 입력"}
```

```tsx
<p className="privacy-note">번역을 실행하면 선택하거나 입력한 텍스트가 번역 API로 전송됩니다. API 키는 이 브라우저의 확장 로컬 저장소에만 보관되며 운영체제 키체인과는 다릅니다.</p>
```

In `src/content/panel/TranslatorPanel.tsx`, use:

```tsx
<p>deepseek-v4-flash</p>
```

- [ ] **Step 4: Run the UI tests to verify they pass**

Run:

```bash
npx vitest run tests/popup/SettingsApp.test.tsx tests/content/TranslatorPanel.test.tsx
```

Expected: 9 tests pass.

### Task 4: Update documentation and verify terminology removal

**Files:**
- Modify: `README.md:3-55`

- [ ] **Step 1: Update README identity, endpoint, setup, permission, and privacy wording**

Make the following statements explicit in `README.md`:

```md
WhaleTranslator는 Whale Browser를 포함한 Chromium 브라우저에서 선택한 텍스트나 현재 페이지를 `deepseek-v4-flash`로 번역하는 Manifest V3 확장 프로그램입니다.
```

The preparation list uses `API 키`, the request description uses:

```md
API base URL은 `http://100.115.209.7:4323/v1`이며, 실제 번역 요청은 `http://100.115.209.7:4323/v1/chat/completions`로 전송됩니다. 별도의 `.env` 파일은 사용하지 않습니다.
```

The settings list uses `API 키`. The permission and privacy paragraphs say the extension requests access only to the configured translation API host and sends translation text to that API, without naming a provider brand.

- [ ] **Step 2: Scan maintained files for provider-branded text and identifiers**

Run:

```bash
rg -n -i 'camel(ai)?|CAMEL_' src tests static README.md
```

Expected: exit status 1 with no matches.

### Task 5: Full verification and distributable rebuild

**Files:**
- Regenerate: `dist/**`

- [ ] **Step 1: Run the full project check**

Run:

```bash
npm run check
```

Expected: lint and typecheck exit successfully; all Vitest files pass; all three Vite builds finish; distribution verification reports the JavaScript artifact count.

- [ ] **Step 2: Verify generated artifacts contain the new endpoint and no old provider branding**

Run:

```bash
rg -n -F 'http://100.115.209.7:4323/v1' src static README.md dist
```

Expected: matches in the provider client, manifest/README, and generated service worker or manifest.

Run:

```bash
rg -n -i 'camel(ai)?|CAMEL_' src tests static README.md dist
```

Expected: exit status 1 with no matches.
