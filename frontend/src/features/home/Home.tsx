import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxEmptyState,
  IxIconButton,
  IxInput,
  IxSpinner,
  IxTypography,
} from "@siemens/ix-react";
import {
  iconGroup,
  iconLogIn,
  iconPause,
  iconPlay,
  iconPlus,
} from "@siemens/ix-icons/icons";
import type { IxInputCustomEvent } from "@siemens/ix/components";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { showToast } from "../../app/toast";
import { ANCHORS, buildRoute } from "../../routes";
import {
  createGroup,
  joinGroupByInvite,
  listGroups,
  setGroupPaused,
} from "../../services/groupService";
import { subscribeToGlobalPoll } from "../../services/globalPoller";
import { announce } from "../../services/messageService";
import type { GroupSummary } from "../../services/types";
import { useAppNavigate } from "../../useAppNavigate";
import styles from "./Home.module.scss";

type GroupsState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; groups: GroupSummary[] };

function toGroupsState(groups: GroupSummary[]): GroupsState {
  return groups.length === 0
    ? { status: "empty" }
    : { status: "ready", groups };
}

export function Home() {
  const navigate = useAppNavigate();
  const location = useLocation();
  const [groupsState, setGroupsState] = useState<GroupsState>({
    status: "loading",
  });
  const [createName, setCreateName] = useState("");
  const [joinInvite, setJoinInvite] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshGroups = useCallback(async () => {
    const refreshed = await listGroups();
    setGroupsState(toGroupsState(refreshed));
  }, []);

  useEffect(() => {
    void refreshGroups();
    const unsubscribe = subscribeToGlobalPoll(() => {
      void refreshGroups();
    });
    return unsubscribe;
  }, [refreshGroups]);

  // Scrolls to the create/join form when arriving via the menu's anchor
  // links (buildRoute.homeAnchor) — re-runs on every hash change, including
  // navigating here again from elsewhere in the app.
  useEffect(() => {
    if (!location.hash) return;
    document
      .getElementById(location.hash.slice(1))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  function handleCreateNameChange(event: IxInputCustomEvent<string>) {
    setCreateName(event.detail);
  }

  function handleJoinInviteChange(event: IxInputCustomEvent<string>) {
    setJoinInvite(event.detail);
    setJoinError(null);
  }

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!createName.trim()) return;
    setBusy(true);
    try {
      const { group } = await createGroup(createName.trim());
      setCreateName("");
      await refreshGroups();
      await announce(group.groupId);
      navigate(buildRoute.group(group.groupId));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!joinInvite.trim()) return;
    setBusy(true);
    try {
      const joined = await joinGroupByInvite(joinInvite.trim());
      if (!joined) {
        setJoinError("This invite code isn't valid.");
        return;
      }
      setJoinInvite("");
      if (joined.alreadyMember) {
        showToast({
          type: "info",
          title: "You're already a member of this group",
        });
        navigate(buildRoute.group(joined.group.groupId));
        return;
      }
      await refreshGroups();
      await announce(joined.group.groupId);
      navigate(buildRoute.group(joined.group.groupId));
    } finally {
      setBusy(false);
    }
  }

  function handleOpenGroupClick(group: GroupSummary) {
    // Doesn't block navigation — a paused group is still readable, just not
    // actively polled — this is just a heads-up so the user isn't confused
    // about why nothing new shows up.
    if (group.paused) {
      showToast({
        type: "info",
        title: "This group is paused — resume it to see new messages",
      });
    }
  }

  async function handleTogglePaused(
    event: React.MouseEvent,
    group: GroupSummary,
  ) {
    // Don't also trigger the card's own onClick (which opens the group).
    event.stopPropagation();
    const nextPaused = !group.paused;
    await setGroupPaused(group.groupId, nextPaused);
    await refreshGroups();
    showToast({
      type: "info",
      title: nextPaused ? "Group paused" : "Group resumed",
    });
  }

  function GroupListItem(group: GroupSummary) {
    return (
      <IxCard
        key={group.groupId}
        className={styles.groupCard}
        data-testid="group-card"
        data-group-id={group.groupId}
        data-paused={group.paused}
      >
        <IxCardContent>
          {/* Paused styling lives on this inner row, not on IxCard itself —
              overriding the card host's own background/opacity fights with
              its built-in border/elevation styling. */}
          <div
            className={
              group.paused
                ? `${styles.groupCardTitle} ${styles.groupCardTitlePaused}`
                : styles.groupCardTitle
            }
          >
            <img src={iconGroup} alt="" className={styles.groupCardIcon} />
            {/* A real <Link>, not onClick+navigate (routing skill, Rule 3):
                supports middle-click/cmd-click to open in a new tab. */}
            <Link
              to={buildRoute.group(group.groupId)}
              className={styles.groupCardName}
              onClick={() => handleOpenGroupClick(group)}
            >
              <IxTypography format="h4">{group.name}</IxTypography>
            </Link>
            {group.unreadCount > 0 && (
              <span
                className={styles.groupCardBadge}
                data-testid="group-card-unread-badge"
              >
                {group.unreadCount}
              </span>
            )}
            <IxIconButton
              variant="secondary"
              className={styles.groupCardToggle}
              icon={group.paused ? iconPlay : iconPause}
              aria-label={
                group.paused
                  ? "Resume polling for this group"
                  : "Pause polling for this group"
              }
              data-testid="toggle-paused-button"
              onClick={(event: React.MouseEvent) =>
                handleTogglePaused(event, group)
              }
            />
          </div>
        </IxCardContent>
      </IxCard>
    );
  }

  function GroupsList() {
    if (groupsState.status === "loading") {
      return <IxSpinner />;
    }
    if (groupsState.status === "empty") {
      return (
        <IxEmptyState
          icon={iconGroup}
          header="No groups yet"
          subHeader="Create or join one below to get started."
        />
      );
    }
    return (
      <div className={styles.groupList}>
        {groupsState.groups.map(GroupListItem)}
      </div>
    );
  }

  return (
    <div className={styles.home}>
      <IxContentHeader headerTitle="Your groups" />
      {GroupsList()}
      <form
        id={ANCHORS.createGroup}
        className={styles.form}
        onSubmit={handleCreateGroup}
      >
        <IxTypography format="h4">Create a group</IxTypography>
        <IxInput
          name="create-group-name"
          label="Group name"
          value={createName}
          onValueChange={handleCreateNameChange}
        />
        <IxButton
          type="submit"
          icon={iconPlus}
          disabled={!createName.trim() || busy}
        >
          Create group
        </IxButton>
      </form>
      <form
        id={ANCHORS.joinGroup}
        className={styles.form}
        onSubmit={handleJoinGroup}
      >
        <IxTypography format="h4">Join a group</IxTypography>
        <IxInput
          name="join-group-invite"
          label="Invite code"
          value={joinInvite}
          onValueChange={handleJoinInviteChange}
          placeholder="Paste the invite you were sent"
        />
        {joinError && <IxTypography format="body-sm">{joinError}</IxTypography>}
        <IxButton
          type="submit"
          icon={iconLogIn}
          disabled={!joinInvite.trim() || busy}
        >
          Join group
        </IxButton>
      </form>
    </div>
  );
}
