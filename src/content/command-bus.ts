import type { RuntimeCommand } from "../shared/messages";
import type { CommandBus } from "./TranslatorShell";

export interface CommandRuntime {
  bus: CommandBus;
  dispatch(command: RuntimeCommand): void;
}

export function createCommandBus(): CommandRuntime {
  const listeners = new Set<(command: RuntimeCommand) => void>();
  const pending: RuntimeCommand[] = [];

  const bus: CommandBus = {
    subscribe(listener) {
      listeners.add(listener);
      const queued = pending.splice(0);
      for (const command of queued) listener(command);
      return () => listeners.delete(listener);
    }
  };

  return {
    bus,
    dispatch(command) {
      if (listeners.size === 0) {
        pending.push(command);
        return;
      }
      for (const listener of listeners) listener(command);
    }
  };
}
