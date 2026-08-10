import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelloWorlds } from "./HelloWorlds";

describe("HelloWorlds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the hello message with the fetched count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ n: 7 }),
      }),
    );

    render(<HelloWorlds />);

    expect(await screen.findByText("Hello 7 worlds !")).toBeInTheDocument();
  });

  it("renders an error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    render(<HelloWorlds />);

    expect(await screen.findByText(/Could not load hello count/)).toBeInTheDocument();
  });
});
