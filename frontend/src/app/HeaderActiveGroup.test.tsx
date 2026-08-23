import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderActiveGroup } from "./HeaderActiveGroup";
import { listGroups } from "../services/groupService";

vi.mock("../services/groupService", () => ({
  listGroups: vi.fn(),
}));

vi.mock("../useAppNavigate", () => ({
  useAppNavigate: () => vi.fn(),
}));

describe("HeaderActiveGroup", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(listGroups).mockReset();
  });

  it("shows the last viewed group only when it still has unread messages", async () => {
    localStorage.setItem("dlf:last-viewed-group-id", "group-2");
    vi.mocked(listGroups).mockResolvedValue([
      {
        groupId: "group-1",
        name: "First group",
        paused: false,
        unreadCount: 0,
      },
      { groupId: "group-2", name: "Last group", paused: false, unreadCount: 3 },
    ]);

    render(<HeaderActiveGroup />);

    expect(await screen.findByText("Last group")).toBeInTheDocument();
  });

  it("falls back to another unread group when the last viewed one has no unread messages", async () => {
    localStorage.setItem("dlf:last-viewed-group-id", "group-2");
    vi.mocked(listGroups).mockResolvedValue([
      {
        groupId: "group-1",
        name: "First group",
        paused: false,
        unreadCount: 2,
      },
      { groupId: "group-2", name: "Last group", paused: false, unreadCount: 0 },
    ]);

    await act(async () => {
      render(<HeaderActiveGroup />);
      await Promise.resolve();
    });

    expect(screen.getByText("First group")).toBeInTheDocument();
  });

  it("falls back to any unread group when there is no last viewed group", async () => {
    localStorage.removeItem("dlf:last-viewed-group-id");
    vi.mocked(listGroups).mockResolvedValue([
      {
        groupId: "group-1",
        name: "First group",
        paused: false,
        unreadCount: 0,
      },
      {
        groupId: "group-2",
        name: "Unread group",
        paused: false,
        unreadCount: 2,
      },
    ]);

    await act(async () => {
      render(<HeaderActiveGroup />);
      await Promise.resolve();
    });

    expect(screen.getByText("Unread group")).toBeInTheDocument();
  });
});
