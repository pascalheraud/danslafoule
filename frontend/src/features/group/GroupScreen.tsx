import {
  IxAvatar,
  IxButton,
  IxContentHeader,
  IxEmptyState,
  IxIconButton,
  IxInput,
  IxSpinner,
  IxTypography,
} from "@siemens/ix-react";
import {
  iconCommentAlt,
  iconCopy,
  iconDoubleChevronDown,
  iconPause,
  iconPlay,
  iconSendRight,
} from "@siemens/ix-icons/icons";
import type { IxInputCustomEvent } from "@siemens/ix/components";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { setLastViewedGroupId } from "../../app/recentGroup";
import { showToast } from "../../app/toast";
import { ROUTES } from "../../routes";
import {
  clearUnreadCount,
  getInvite,
  listGroups,
  setGroupPaused,
} from "../../services/groupService";
import { subscribeToGlobalPoll } from "../../services/globalPoller";
import { getMessages, sendChatMessage } from "../../services/messageService";
import type { ChatMessageView, GroupSummary } from "../../services/types";
import { useAppNavigate } from "../../useAppNavigate";
import styles from "./GroupScreen.module.scss";

// How long a newly-arrived message keeps its highlight (see refreshLocal and
// the sweep effect below).
const NEW_MESSAGE_HIGHLIGHT_MS = 30_000;
// How often the sweep effect checks for expired highlights. A single
// recurring sweep (rather than one setTimeout per message) is what actually
// clears the highlight — simpler to reason about and immune to any one
// timer getting lost (e.g. a dev-mode hot-reload swapping the component
// between scheduling and firing, which would otherwise orphan a setTimeout
// targeting a stale state setter and leave that message highlighted forever).
const HIGHLIGHT_SWEEP_INTERVAL_MS = 1000;
// How close to the bottom (px) still counts as "at the bottom" for the
// auto/scrolling state switch — a strict scrollTop === max is too fragile
// (subpixel rounding, momentum scrolling on trackpads/touch).
const AT_BOTTOM_THRESHOLD_PX = 16;

type ScrollState = "auto" | "scrolling";

export function GroupScreen() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useAppNavigate();
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  // messageId -> when its highlight expires (unix ms); swept every
  // HIGHLIGHT_SWEEP_INTERVAL_MS, see the effect below.
  const [newMessageExpiry, setNewMessageExpiry] = useState<
    Record<string, number>
  >({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // "auto": the message list follows new messages automatically. Switches to
  // "scrolling" the moment the user scrolls away from the bottom, and back
  // to "auto" only once they scroll all the way back down themselves (or use
  // the scroll-to-bottom button) — never automatically from new messages
  // arriving, otherwise a user reading history would keep getting yanked down.
  const [scrollState, setScrollState] = useState<ScrollState>("auto");
  // Read by refreshLocal (a useCallback that doesn't depend on scrollState)
  // so it always sees the latest value without needing to be re-created.
  const scrollStateRef = useRef<ScrollState>("auto");
  // Read by the polling interval so it always sees the latest paused state,
  // without having to re-create the interval on every group refresh.
  const groupRef = useRef<GroupSummary | null>(null);
  // null until the first load completes — nothing is "newly arrived" on the
  // initial render of a group's whole history, only messages that show up
  // in a later refresh.
  const knownMessageIdsRef = useRef<Set<string> | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  // Set whenever refreshLocal wants the next render to snap the scroll
  // container to the bottom (initial load, or a new message while in "auto"
  // state); consumed by the effect below, after the DOM has the new
  // messages in it.
  const shouldScrollToBottomRef = useRef(false);

  useEffect(() => {
    scrollStateRef.current = scrollState;
  }, [scrollState]);

  // Sweeps expired highlights every second — the only thing that clears
  // newMessageExpiry entries (see the constant's comment above).
  useEffect(() => {
    const interval = setInterval(() => {
      setNewMessageExpiry((prev) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, number> = {};
        for (const [id, expiresAt] of Object.entries(prev)) {
          if (expiresAt > now) {
            next[id] = expiresAt;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, HIGHLIGHT_SWEEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const refreshLocal = useCallback(async () => {
    if (!groupId) return;
    const [groups, groupMessages] = await Promise.all([
      listGroups(),
      getMessages(groupId),
    ]);
    let found = groups.find((g) => g.groupId === groupId) ?? null;
    const atBottom =
      messagesScrollRef.current === null
        ? scrollStateRef.current === "auto"
        : messagesScrollRef.current.scrollHeight -
            messagesScrollRef.current.scrollTop -
            messagesScrollRef.current.clientHeight <=
          AT_BOTTOM_THRESHOLD_PX;

    if (found && found.unreadCount > 0 && atBottom) {
      await clearUnreadCount(groupId);
      found = { ...found, unreadCount: 0 };
    }

    groupRef.current = found;
    setGroup(found);
    setMessages(groupMessages);

    const currentIds = new Set(groupMessages.map((m) => m.messageId));
    const knownIds = knownMessageIdsRef.current;
    if (knownIds === null) {
      knownMessageIdsRef.current = currentIds;
      shouldScrollToBottomRef.current = true; // initial load: start at the bottom
    } else {
      const newlyArrived = groupMessages.filter(
        (m) => !knownIds.has(m.messageId),
      );
      knownMessageIdsRef.current = currentIds;
      if (newlyArrived.length > 0) {
        if (scrollStateRef.current === "auto") {
          shouldScrollToBottomRef.current = true;
          // Already at the bottom, so these are immediately seen — keep the
          // persisted unread count (shown elsewhere, e.g. the menu) at 0.
          await clearUnreadCount(groupId);
        }
        // User scrolled up reading history: unreadCount itself was already
        // incremented server-round-trip-side by the protocol pipeline on
        // receipt (features/protocol/pipeline.ts) — reflected in `found`
        // above via listGroups(), nothing to do here but leave it be.
        // Only other users' messages get the "new" highlight — our own
        // sent messages are already visually distinct (green, right-aligned)
        // and shouldn't flash blue.
        const newlyArrivedFromOthers = newlyArrived.filter(
          (m) => m.kind === "chat" && !m.isSelf,
        );
        const expiresAt = Date.now() + NEW_MESSAGE_HIGHLIGHT_MS;
        setNewMessageExpiry((prev) => {
          const next = { ...prev };
          for (const message of newlyArrivedFromOthers)
            next[message.messageId] = expiresAt;
          return next;
        });
      }
    }
  }, [groupId]);

  // Runs after the DOM has the latest `messages` — scrolls to the bottom
  // only when refreshLocal actually flagged it (initial load or a new
  // message), not on every unrelated re-render.
  useEffect(() => {
    if (!shouldScrollToBottomRef.current || !messagesScrollRef.current) return;
    messagesScrollRef.current.scrollTop =
      messagesScrollRef.current.scrollHeight;
    shouldScrollToBottomRef.current = false;
  }, [messages]);

  function handleMessagesScroll() {
    const el = messagesScrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <=
      AT_BOTTOM_THRESHOLD_PX;
    if (atBottom) {
      if (scrollStateRef.current !== "auto") setScrollState("auto");
      if (groupId) clearUnreadCount(groupId);
    } else if (scrollStateRef.current !== "scrolling") {
      setScrollState("scrolling");
    }
  }

  function handleScrollToBottomClick() {
    messagesScrollRef.current?.scrollTo({
      top: messagesScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    setScrollState("auto");
    if (groupId) clearUnreadCount(groupId);
  }

  // `force` bypasses the pause: used right after the user does something
  // that should visibly react (sending a message), as opposed to the
  // silent background interval, which respects a paused group.
  const poll = useCallback(
    async (_force = false) => {
      if (!groupId) return;
      await refreshLocal();
    },
    [groupId, refreshLocal],
  );

  useEffect(() => {
    if (groupId) setLastViewedGroupId(groupId);
    void refreshLocal();
    const unsubscribe = subscribeToGlobalPoll(() => {
      void refreshLocal();
    });
    return unsubscribe;
  }, [groupId, refreshLocal]);

  async function handleCopyInvite() {
    if (!groupId) return;
    try {
      const invite = await getInvite(groupId);
      if (!invite || !navigator.clipboard) {
        throw new Error("Invite unavailable");
      }
      await navigator.clipboard.writeText(invite);
      showToast({ type: "success", title: "Invite copied to clipboard" });
    } catch {
      showToast({ type: "error", title: "Could not copy the invite" });
    }
  }

  async function handleTogglePaused() {
    if (!group) return;
    const nextPaused = !group.paused;
    await setGroupPaused(group.groupId, nextPaused);
    await refreshLocal();
    showToast({
      type: "info",
      title: nextPaused ? "Group paused" : "Group resumed",
    });
  }

  function handleTextChange(event: IxInputCustomEvent<string>) {
    setText(event.detail);
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || !group) return;
    setSending(true);
    try {
      if (group.paused) {
        // Sending is itself activity — resume rather than silently sending
        // into a group the client would otherwise stop polling right after.
        await setGroupPaused(group.groupId, false);
      }
      await sendChatMessage(group.groupId, text.trim());
      setText("");
      // Sending is bottom-anchored activity — jump back to "auto" so the
      // reply round-trip (and anything else that arrived) scrolls into view.
      setScrollState("auto");
      await poll(true);
    } finally {
      setSending(false);
    }
  }

  function GroupHeader() {
    return (
      <>
        <IxContentHeader
          headerTitle={group?.name ?? "Unnamed group"}
          hasBackButton
          // Deliberately ROUTES.home, not navigate(-1) (routing skill's usual
          // Rule 2): a group can be opened directly from the menu, a
          // reload, or an anchor link with no meaningful "previous page" in
          // history — Home is the one predictable, always-correct target.
          onBackButtonClick={() => navigate(ROUTES.home)}
        />
        <div className={styles.header}>
          <div className={styles.uuidRow}>
            <IxButton
              variant="secondary"
              icon={iconCopy}
              onClick={handleCopyInvite}
            >
              Copy invite
            </IxButton>
            <IxIconButton
              variant="secondary"
              icon={group?.paused ? iconPlay : iconPause}
              aria-label={
                group?.paused
                  ? "Resume polling for this group"
                  : "Pause polling for this group"
              }
              data-testid="toggle-paused-button"
              onClick={handleTogglePaused}
            />
          </div>
        </div>
      </>
    );
  }

  function SystemMessageItem(
    message: Extract<ChatMessageView, { kind: "system" }>,
  ) {
    return (
      <li
        key={message.messageId}
        className={styles.systemMessage}
        data-testid="message-item"
        data-kind="system"
      >
        <IxTypography format="body-sm">{message.text}</IxTypography>
      </li>
    );
  }

  function ChatMessageItem(
    message: Extract<ChatMessageView, { kind: "chat" }>,
  ) {
    const initials = message.authorName.slice(0, 2).toUpperCase();
    const isNew = message.messageId in newMessageExpiry;
    const classNames = [
      styles.message,
      message.isSelf ? styles.messageSelf : styles.messageOther,
    ];
    return (
      <li
        key={message.messageId}
        className={classNames.join(" ")}
        // Inline, not a CSS class: guarantees the highlight always wins
        // regardless of stylesheet rule order, rather than relying on
        // .messageNew being declared after .messageSelf/.messageOther in
        // GroupScreen.module.scss (same specificity either way).
        style={
          isNew
            ? { backgroundColor: "var(--theme-color-info-weak, #d6ecff)" }
            : undefined
        }
        data-testid="message-item"
        data-kind="chat"
        data-new={isNew}
        data-self={message.isSelf}
      >
        <IxAvatar
          initials={initials}
          aria-label={`Message from ${message.authorName}`}
        />
        <div className={styles.messageBody}>
          <IxTypography format="body-sm">{message.authorName}</IxTypography>
          <IxTypography format="body" data-testid="message-content">
            {message.text}
          </IxTypography>
        </div>
      </li>
    );
  }

  function MessageItem(message: ChatMessageView) {
    return message.kind === "system"
      ? SystemMessageItem(message)
      : ChatMessageItem(message);
  }

  function MessagesFeed() {
    if (messages.length === 0) {
      return <IxEmptyState icon={iconCommentAlt} header="No messages yet" />;
    }
    return <ul className={styles.messageList}>{messages.map(MessageItem)}</ul>;
  }

  const unreadCount = group?.unreadCount ?? 0;

  return (
    <div className={styles.group}>
      {group === null ? <IxSpinner /> : GroupHeader()}
      <div className={styles.messagesWrapper}>
        <div
          className={styles.messagesScroll}
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
        >
          {MessagesFeed()}
        </div>
        {scrollState === "scrolling" && (
          <div className={styles.scrollToBottomWrapper}>
            <IxIconButton
              icon={iconDoubleChevronDown}
              aria-label="Scroll to the latest messages"
              data-testid="scroll-to-bottom-button"
              onClick={handleScrollToBottomClick}
            />
            {unreadCount > 0 && (
              <span className={styles.unreadBadge} data-testid="unread-badge">
                {unreadCount}
              </span>
            )}
          </div>
        )}
      </div>
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
