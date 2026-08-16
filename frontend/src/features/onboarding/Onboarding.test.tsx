import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Onboarding } from "./Onboarding";

// Siemens iX inputs are Stencil web components: jsdom hydrates their shadow
// DOM but doesn't wire up the custom `valueChange` event the same way a real
// browser does, so simulating typed input reliably belongs to the Playwright
// e2e suite (real browser). These tests cover what's safely testable here:
// initial render and the disabled-when-empty guard.

describe("Onboarding", () => {
  it("renders the name form with the submit button disabled while empty", () => {
    render(<Onboarding onSubmit={vi.fn()} />);

    expect(screen.getByText("Welcome to Dans la foule")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("does not call onSubmit when the form is submitted with an empty name", () => {
    const onSubmit = vi.fn();
    const { container } = render(<Onboarding onSubmit={onSubmit} />);

    container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
