import { IxIconButton, IxMenuItem, IxTypography } from "@siemens/ix-react";
import { iconGroup, iconPause, iconPlay, iconPlus, iconUser, iconUserGroup } from "@siemens/ix-icons/icons";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ANCHORS, buildRoute, ROUTES, type AppRoute } from "../routes";
import { listGroups, setGroupPaused } from "../services/groupService";
import type { GroupSummary } from "../services/types";
import { showToast } from "./toast";
import { useAppNavigate } from "../useAppNavigate";
import styles from "./GroupsMenu.module.scss";

const REFRESH_INTERVAL_MS = 5000;

interface GroupsMenuProps {
  // Called right after navigating to a group/home from the menu — lets the
  // parent collapse the (mobile/overlay) menu so it doesn't stay open over
  // the screen the user just chose.
  onNavigate: () => void;
}

// The "Groups" section of the app menu: the group list itself (name +
// play/pause), kept in sync with Home/GroupScreen via polling rather than a
// shared store — consistent with the rest of the app's polling-based design.
export function GroupsMenu({ onNavigate }: GroupsMenuProps) {
  const navigate = useAppNavigate();
  const location = useLocation();
  const [groups, setGroups] = useState<GroupSummary[]>([]);

  const refresh = useCallback(async () => {
    setGroups(await listGroups());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Also refresh right after navigating (e.g. just created/joined a group),
  // without waiting for the next interval tick.
  useEffect(() => {
    refresh();
  }, [location.pathname, refresh]);

  function handleNavigate(to: AppRoute) {
    navigate(to);
    onNavigate();
  }

  async function handleTogglePaused(event: React.MouseEvent, group: GroupSummary) {
    // Don't also trigger the menu item's own onClick (which navigates).
    event.stopPropagation();
    const nextPaused = !group.paused;
    await setGroupPaused(group.groupId, nextPaused);
    await refresh();
    showToast({ type: "info", title: nextPaused ? "Group paused" : "Group resumed" });
  }

  function StaticMenuItems() {
    return (
      <>
        <IxMenuItem
          icon={iconUser}
          active={location.pathname === ROUTES.me}
          onClick={() => handleNavigate(ROUTES.me)}
        >
          Me
        </IxMenuItem>
        <IxTypography format="label" className={styles.sectionLabel}>
          Groups
        </IxTypography>
        <IxMenuItem
          icon={iconGroup}
          active={location.pathname === ROUTES.home}
          onClick={() => handleNavigate(ROUTES.home)}
        >
          All groups
        </IxMenuItem>
        <IxMenuItem icon={iconPlus} onClick={() => handleNavigate(buildRoute.homeAnchor(ANCHORS.createGroup))}>
          Create a group
        </IxMenuItem>
        <IxMenuItem icon={iconUserGroup} onClick={() => handleNavigate(buildRoute.homeAnchor(ANCHORS.joinGroup))}>
          Join a group
        </IxMenuItem>
      </>
    );
  }

  function GroupMenuItem(group: GroupSummary) {
    function handleClick() {
      handleNavigate(buildRoute.group(group.groupId));
      if (group.paused) {
        showToast({ type: "info", title: "This group is paused — resume it to see new messages" });
      }
    }

    return (
      <IxMenuItem
        key={group.groupId}
        active={location.pathname === buildRoute.group(group.groupId)}
        data-testid="menu-group-item"
        data-group-id={group.groupId}
        onClick={handleClick}
      >
        <div className={styles.item}>
          <span className={styles.name}>{group.name}</span>
          {group.unreadCount > 0 && (
            <span className={styles.badge} data-testid="menu-unread-badge">
              {group.unreadCount}
            </span>
          )}
          <IxIconButton
            variant="secondary"
            size="16"
            className={styles.toggle}
            icon={group.paused ? iconPlay : iconPause}
            aria-label={group.paused ? "Resume polling for this group" : "Pause polling for this group"}
            data-testid="menu-toggle-paused-button"
            onClick={(event: React.MouseEvent) => handleTogglePaused(event, group)}
          />
        </div>
      </IxMenuItem>
    );
  }

  return (
    // A flat list of IxMenuItem, not IxMenuCategory: the category component
    // gives its expanded sub-items their own internal max-height/overflow
    // (built for the collapsed-rail flyout case), which produced a second,
    // nested scrollbar for the group list instead of the whole menu
    // scrolling as one unit. A plain heading + flat items share the app
    // menu's own single scroll container instead.
    <>
      <StaticMenuItems />
      {groups.map(GroupMenuItem)}
    </>
  );
}
