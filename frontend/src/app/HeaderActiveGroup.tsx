import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buildRoute } from "../routes";
import { listGroups } from "../services/groupService";
import { subscribeToGlobalPoll } from "../services/globalPoller";
import type { GroupSummary } from "../services/types";
import { useAppNavigate } from "../useAppNavigate";
import { getLastViewedGroupId } from "./recentGroup";
import { showToast } from "./toast";
import styles from "./HeaderActiveGroup.module.scss";

// Fixed-position, on every page — see ConnectivityIndicator.tsx's identical
// pattern/comment: IxApplicationHeader's secondary slot collapses into a
// "more" dropdown below the sm breakpoint, which would hide this behind an
// extra tap on mobile. Portaled onto <body> and pinned in place instead,
// which also lets the header's "more" toggle be hidden entirely (see
// App.module.scss) now that nothing actually needs it.
// Shows the group the user most recently opened (see GroupScreen's
// setLastViewedGroupId call), with an unread badge if it has anything new —
// a quick way back into "the group I was just in" without opening the menu.
export function HeaderActiveGroup() {
  const navigate = useAppNavigate();
  const [group, setGroup] = useState<GroupSummary | null>(null);

  const refresh = useCallback(async () => {
    const groups = await listGroups();
    const lastViewedId = getLastViewedGroupId();

    const selected =
      (lastViewedId
        ? groups.find((g) => g.groupId === lastViewedId && g.unreadCount > 0)
        : undefined) ??
      groups.find((g) => g.unreadCount > 0) ??
      null;

    setGroup(selected);
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToGlobalPoll(() => {
      void refresh();
    });
    return unsubscribe;
  }, [refresh]);

  if (!group) return null;

  function handleClick() {
    if (!group) return;
    navigate(buildRoute.group(group.groupId));
    if (group.paused) {
      showToast({
        type: "info",
        title: "This group is paused — resume it to see new messages",
      });
    }
  }

  return createPortal(
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.item}
        data-testid="header-active-group"
        data-group-id={group.groupId}
        onClick={handleClick}
      >
        <span className={styles.name}>{group.name}</span>
        {group.unreadCount > 0 && (
          <span className={styles.badge} data-testid="header-unread-badge">
            {group.unreadCount}
          </span>
        )}
      </button>
    </div>,
    document.body,
  );
}
