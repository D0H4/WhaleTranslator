import { describe, expect, it, vi } from "vitest";
import type { RuntimeCommand } from "../../src/shared/messages";
import { createCommandBus } from "../../src/content/command-bus";

const selectionCommand: RuntimeCommand = { kind: "command", command: "translate-selection" };
const pageCommand: RuntimeCommand = { kind: "command", command: "toggle-page-translation" };

describe("createCommandBus", () => {
  it("delivers commands that arrive before React subscribes", () => {
    const runtime = createCommandBus();
    const listener = vi.fn();

    runtime.dispatch(selectionCommand);
    runtime.bus.subscribe(listener);

    expect(listener).toHaveBeenCalledWith(selectionCommand);
  });

  it("delivers later commands immediately without replaying old ones", () => {
    const runtime = createCommandBus();
    const first = vi.fn();
    const second = vi.fn();

    runtime.dispatch(selectionCommand);
    runtime.bus.subscribe(first);
    runtime.bus.subscribe(second);
    runtime.dispatch(pageCommand);

    expect(first.mock.calls).toEqual([[selectionCommand], [pageCommand]]);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(pageCommand);
  });
});
