import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFloatingPanel } from "../../src/content/panel/useFloatingPanel";

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const {
    panelRef,
    panelStyle,
    dragHandleProps,
    moveHandleProps,
    resizeHandleProps
  } = useFloatingPanel({
    anchor: { left: 100, top: 100, right: 180, bottom: 120 },
    onClose
  });

  return (
    <>
      <div ref={panelRef} style={panelStyle} data-testid="panel">
        <header data-testid="drag-handle" {...dragHandleProps}>
          <button type="button">헤더 동작</button>
        </header>
        <input data-initial-focus aria-label="패널 입력" />
        <button type="button" aria-label="번역 창 이동" {...moveHandleProps} />
        <button type="button" aria-label="번역 창 크기 조절" {...resizeHandleProps} />
      </div>
      <button type="button">페이지 동작</button>
    </>
  );
}

describe("useFloatingPanel", () => {
  beforeEach(() => setViewport(1280, 800));

  it("focuses the initial field without trapping Tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText("패널 입력");
    await waitFor(() => expect(input).toHaveFocus());
    screen.getByRole("button", { name: "번역 창 크기 조절" }).focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "페이지 동작" })).toHaveFocus();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drags from the header but ignores its interactive child", () => {
    render(<Harness />);
    const panel = screen.getByTestId("panel");
    const header = screen.getByTestId("drag-handle");

    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 140, clientY: 130 });
    fireEvent.pointerUp(header, { pointerId: 1 });
    expect(panel).toHaveStyle({ left: "140px", top: "158px" });

    const action = screen.getByRole("button", { name: "헤더 동작" });
    fireEvent.pointerDown(action, { button: 0, pointerId: 2, clientX: 140, clientY: 130 });
    fireEvent.pointerMove(header, { pointerId: 2, clientX: 200, clientY: 200 });
    expect(panel).toHaveStyle({ left: "140px", top: "158px" });
  });

  it("resizes with pointer and keyboard input", () => {
    render(<Harness />);
    const panel = screen.getByTestId("panel");
    const handle = screen.getByRole("button", { name: "번역 창 크기 조절" });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 3, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 100, clientY: 80 });
    fireEvent.pointerUp(handle, { pointerId: 3 });
    expect(panel).toHaveStyle({ width: "580px", height: "480px" });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(panel).toHaveStyle({ width: "564px", height: "480px" });
  });

  it("moves with arrow keys from the accessible move handle", () => {
    render(<Harness />);
    const panel = screen.getByTestId("panel");
    const handle = screen.getByRole("button", { name: "번역 창 이동" });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });

    expect(panel).toHaveStyle({ left: "116px", top: "144px" });
  });

  it("clamps the current rectangle after a viewport resize", async () => {
    render(<Harness />);
    const panel = screen.getByTestId("panel");

    setViewport(500, 500);
    fireEvent(window, new Event("resize"));

    await waitFor(() => expect(panel).toHaveStyle({
      left: "12px",
      top: "88px",
      width: "476px",
      height: "400px"
    }));
  });
});
