import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoWorkspace } from "./DemoWorkspace";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Each step's timer is scheduled after the previous render, so advance in slices. */
async function advance(ms: number) {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  }
}

describe("DemoWorkspace", () => {
  it.each(["Documents", "Repository"])(
    "%s: plan → approve → preview → approval dialog → audit, with no network",
    async (tab) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      render(<DemoWorkspace />);
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(tab) }));

      fireEvent.click(screen.getByRole("button", { name: "Plan workflow" }));
      await advance(800);
      expect(screen.getByText("Proposed plan")).toBeTruthy();
      expect(screen.getByText("Needs your approval")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Approve plan/ }));
      await advance(5000);
      expect(screen.getByText("Preview")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Save report|Export patch/ }));
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toContain("Nothing is written");

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      const approve = screen.getByRole("button", { name: /Approve (save|export)/ });
      await act(async () => {
        fireEvent.click(approve);
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("action.approved")).toBeTruthy();
      expect(screen.getByText(/nothing written/)).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("email drafts are labelled as not sent", async () => {
    render(<DemoWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: /Email/ }));
    fireEvent.click(screen.getByRole("button", { name: "Plan workflow" }));
    await advance(800);
    fireEvent.click(screen.getByRole("button", { name: /Approve plan/ }));
    await advance(6000);
    expect(screen.getAllByText(/not sent/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Send/)).toBeNull();
  });
});
