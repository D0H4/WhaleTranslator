import { createRoot } from "react-dom/client";
import type { RuntimeCommand } from "../shared/messages";
import { createCommandBus } from "./command-bus";
import { TranslatorShell } from "./TranslatorShell";
import styles from "./panel/panel.css?inline";

const RUNTIME_KEY = "__whaleTranslatorRuntime__";

interface RuntimeInstance {
  dispatch(command: RuntimeCommand): void;
}

function bootstrap(): RuntimeInstance {
  const pageGlobal = globalThis as typeof globalThis & { [RUNTIME_KEY]?: RuntimeInstance };
  const existing = pageGlobal[RUNTIME_KEY];
  if (existing) return existing;

  const host = document.createElement("div");
  host.dataset.whaleTranslatorRoot = "";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = styles;
  const mount = document.createElement("div");
  shadow.append(style, mount);
  document.documentElement.append(host);

  const { bus, dispatch } = createCommandBus();
  createRoot(mount).render(<TranslatorShell bus={bus} />);
  const instance = { dispatch };
  pageGlobal[RUNTIME_KEY] = instance;

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (message && typeof message === "object" && (message as RuntimeCommand).kind === "command") {
      instance.dispatch(message as RuntimeCommand);
    }
  });
  return instance;
}

bootstrap();
