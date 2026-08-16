import {
  IxAvatar,
  IxButton,
  IxContentHeader,
  IxEmptyState,
  IxInput,
  IxSpinner,
  IxTypography,
} from "@siemens/ix-react";
import { iconCommentAlt, iconCopy, iconSendRight } from "@siemens/ix-icons/icons";
import type { IxInputCustomEvent } from "@siemens/ix/components";
import { useCallback, useEffect, useState } from "react";
import { listGroups } from "../../services/groupService";
import { localCache } from "../../services/localCache";
import { sendMessage, syncMessages } from "../../services/messageService";
import type { GroupSummary, Message, Profile } from "../../services/types";
import styles from "./GroupScreen.module.scss";

interface GroupScreenProps {
  groupUuid: string;
  profile: Profile;
  onBack: () => void;
}

const POLL_INTERVAL_MS = 5000;

export function GroupScreen({ groupUuid, profile, onBack }: GroupScreenProps) {
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const refreshLocal = useCallback(async () => {
    const [groups, groupMessages] = await Promise.all([listGroups(), localCache.getMessages(groupUuid)]);
    setGroup(groups.find((g) => g.uuid === groupUuid) ?? { uuid: groupUuid, name: null });
    setMessages(groupMessages);
  }, [groupUuid]);

  const poll = useCallback(async () => {
    await syncMessages();
    await refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    refreshLocal();
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshLocal, poll]);

  function handleCopyUuid() {
    navigator.clipboard?.writeText(groupUuid);
  }

  function handleTextChange(event: IxInputCustomEvent<string>) {
    setText(event.detail);
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || !group) return;
    setSending(true);
    try {
      await sendMessage({
        groupUuid: group.uuid,
        groupName: group.name ?? "",
        authorUuid: profile.uuid,
        authorName: profile.name,
        text: text.trim(),
      });
      setText("");
      await poll();
    } finally {
      setSending(false);
    }
  }

  function GroupHeader() {
    return (
      <>
        <IxContentHeader headerTitle={group?.name ?? "Unnamed group"} hasBackButton onBackButtonClick={onBack} />
        <div className={styles.header}>
          <div className={styles.uuidRow}>
            <IxTypography format="body-sm" data-testid="group-uuid">
              {groupUuid}
            </IxTypography>
            <IxButton variant="secondary" icon={iconCopy} onClick={handleCopyUuid}>
              Copy
            </IxButton>
          </div>
        </div>
      </>
    );
  }

  function MessageItem(message: Message) {
    const initials = message.authorName.slice(0, 2).toUpperCase();
    return (
      <li key={message.uuid} className={styles.message} data-testid="message-item">
        <IxAvatar initials={initials} aria-label={`Message from ${message.authorName}`} />
        <div>
          <IxTypography format="body-sm">{message.authorName}</IxTypography>
          <IxTypography format="body" data-testid="message-content">
            {message.text}
          </IxTypography>
        </div>
      </li>
    );
  }

  function MessagesFeed() {
    if (messages.length === 0) {
      return <IxEmptyState icon={iconCommentAlt} header="No messages yet" />;
    }
    return <ul className={styles.messageList}>{messages.map(MessageItem)}</ul>;
  }

  return (
    <div className={styles.group}>
      {group === null ? <IxSpinner /> : GroupHeader()}
      {MessagesFeed()}
      <form className={styles.form} onSubmit={handleSend}>
        <IxInput
          name="message-text"
          label="Message"
          value={text}
          onValueChange={handleTextChange}
          placeholder="Say something…"
        />
        <IxButton
          type="submit"
          icon={iconSendRight}
          data-testid="send-message-button"
          disabled={!text.trim() || sending}
        >
          Send
        </IxButton>
      </form>
    </div>
  );
}
