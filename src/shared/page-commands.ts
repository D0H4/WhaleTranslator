import { WhaleTranslatorError } from "./errors";
import type { PageCommand, RuntimeCommand } from "./messages";

export function supportedPage(url: string | undefined): boolean {
  return Boolean(url && /^(https?|file):/i.test(url));
}

export async function sendCommandToActiveTab(
  command: PageCommand,
  api: Pick<typeof chrome, "tabs" | "scripting"> = chrome
): Promise<void> {
  const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined || !supportedPage(tab.url)) {
    throw new WhaleTranslatorError("restricted-page");
  }
  try {
    await api.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch {
    throw new WhaleTranslatorError("restricted-page");
  }
  const message: RuntimeCommand = { kind: "command", command };
  await api.tabs.sendMessage(tab.id, message);
}
