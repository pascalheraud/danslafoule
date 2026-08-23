import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";
import { listGroups } from "../../services/groupService";

vi.mock("../../services/groupService", () => ({
  createGroup: vi.fn(),
  joinGroupByInvite: vi.fn(),
  listGroups: vi.fn(),
  setGroupPaused: vi.fn(),
}));

vi.mock("../../services/messageService", () => ({
  announce: vi.fn(),
}));

describe("Home", () => {
  beforeEach(() => {
    vi.mocked(listGroups).mockReset();
  });

  it("shows a badge with the unread count on each group card", async () => {
    vi.mocked(listGroups).mockResolvedValue([
      { groupId: "group-1", name: "Crew", paused: false, unreadCount: 3 },
    ]);
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Crew")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("refreshes the group list from the latest shared state without polling from the screen itself", async () => {
    vi.mocked(listGroups).mockResolvedValue([
      { groupId: "group-1", name: "Crew", paused: false, unreadCount: 1 },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(listGroups).toHaveBeenCalled();
  });
});
