import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxEmptyState,
  IxInput,
  IxSpinner,
  IxTypography,
} from "@siemens/ix-react";
import { iconGroup, iconLogIn, iconPlus } from "@siemens/ix-icons/icons";
import type { IxInputCustomEvent } from "@siemens/ix/components";
import { useCallback, useEffect, useState } from "react";
import { createGroup, joinGroup, listGroups } from "../../services/groupService";
import { sendMessage } from "../../services/messageService";
import type { GroupSummary, Profile } from "../../services/types";
import styles from "./Home.module.scss";

interface HomeProps {
  profile: Profile;
  onOpenGroup: (groupUuid: string) => void;
}

type GroupsState = { status: "loading" } | { status: "empty" } | { status: "ready"; groups: GroupSummary[] };

function toGroupsState(groups: GroupSummary[]): GroupsState {
  return groups.length === 0 ? { status: "empty" } : { status: "ready", groups };
}

export function Home({ profile, onOpenGroup }: HomeProps) {
  const [groupsState, setGroupsState] = useState<GroupsState>({ status: "loading" });
  const [createName, setCreateName] = useState("");
  const [joinUuid, setJoinUuid] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshGroups = useCallback(async () => {
    const groups = await listGroups();
    setGroupsState(toGroupsState(groups));
  }, []);

  useEffect(() => {
    refreshGroups();
  }, [refreshGroups]);

  function handleCreateNameChange(event: IxInputCustomEvent<string>) {
    setCreateName(event.detail);
  }

  function handleJoinUuidChange(event: IxInputCustomEvent<string>) {
    setJoinUuid(event.detail);
  }

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!createName.trim()) return;
    setBusy(true);
    try {
      const group = await createGroup(createName.trim());
      setCreateName("");
      await refreshGroups();
      onOpenGroup(group.uuid);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!joinUuid.trim()) return;
    setBusy(true);
    try {
      const group = await joinGroup(joinUuid.trim());
      setJoinUuid("");
      await refreshGroups();
      await sendMessage({
        groupUuid: group.uuid,
        groupName: group.name ?? "",
        authorUuid: profile.uuid,
        authorName: profile.name,
        text: `Hello, I'm ${profile.name}`,
      });
      onOpenGroup(group.uuid);
    } finally {
      setBusy(false);
    }
  }

  function handleOpenGroup(groupUuid: string) {
    onOpenGroup(groupUuid);
  }

  function GroupListItem(group: GroupSummary) {
    return (
      <IxCard
        key={group.uuid}
        className={styles.groupCard}
        data-testid="group-card"
        data-group-uuid={group.uuid}
        onClick={() => handleOpenGroup(group.uuid)}
      >
        <IxCardContent>
          <div className={styles.groupCardTitle}>
            <img src={iconGroup} alt="" className={styles.groupCardIcon} />
            <IxTypography format="h4">{group.name ?? "Unnamed group"}</IxTypography>
          </div>
          <IxTypography format="body-sm">{group.uuid}</IxTypography>
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
    return <div className={styles.groupList}>{groupsState.groups.map(GroupListItem)}</div>;
  }

  return (
    <div className={styles.home}>
      <IxContentHeader headerTitle="Your groups" />
      {GroupsList()}
      <form className={styles.form} onSubmit={handleCreateGroup}>
        <IxTypography format="h4">Create a group</IxTypography>
        <IxInput
          name="create-group-name"
          label="Group name"
          value={createName}
          onValueChange={handleCreateNameChange}
        />
        <IxButton type="submit" icon={iconPlus} disabled={!createName.trim() || busy}>
          Create group
        </IxButton>
      </form>
      <form className={styles.form} onSubmit={handleJoinGroup}>
        <IxTypography format="h4">Join a group</IxTypography>
        <IxInput
          name="join-group-uuid"
          label="Group UUID"
          value={joinUuid}
          onValueChange={handleJoinUuidChange}
        />
        <IxButton type="submit" icon={iconLogIn} disabled={!joinUuid.trim() || busy}>
          Join group
        </IxButton>
      </form>
    </div>
  );
}
