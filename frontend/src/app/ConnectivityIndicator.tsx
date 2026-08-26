import { IxIcon, IxIconButton, IxModal, IxModalContent, IxModalHeader, IxTypography } from "@siemens/ix-react";
import { iconConnected, iconDisconnected } from "@siemens/ix-icons/icons";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getConnectivityState,
  subscribeToConnectivity,
  type ConnectivityState,
} from "../features/protocol/relayService";
import styles from "./ConnectivityIndicator.module.scss";

// Fixed-position, on every page — deliberately *not* placed in
// IxApplicationHeader's secondary slot: that slot collapses into a "more"
// dropdown below the sm breakpoint (see application-header's own
// documented behavior), which would hide this behind an extra tap on
// exactly the mobile screens where offline status matters most. A plain
// fixed element stays visible and in the same spot at every viewport size.
// Whether the device can currently reach the relay server, with no
// dedicated health-check request — the status is derived from the outcome
// of whatever real traffic (a poll tick, a message send) relayService.ts
// already sent, so this stays in sync without adding network calls of its
// own. Clicking it opens a popup with the current status and when it was
// last checked — see doc/general-spec.md §5's offline-send-queue behavior,
// which this indicator makes visible rather than left implicit.
export function ConnectivityIndicator() {
  const [state, setState] = useState<ConnectivityState>(getConnectivityState());
  const [showDetail, setShowDetail] = useState(false);
  // See GroupScreen.tsx's identical pattern/comment: <IxModal>'s declarative
  // wrapper doesn't call the underlying <dialog>'s native showModal() itself.
  const modalRef = useRef<HTMLIxModalElement>(null);

  useEffect(() => subscribeToConnectivity(setState), []);

  useEffect(() => {
    if (showDetail) void modalRef.current?.showModal();
  }, [showDetail]);

  const isOnline = state.status === "online";

  return (
    <>
      {createPortal(
        // Rendered straight onto <body>, not just position:fixed in place:
        // IxApplication's own layout puts a `transform` on an ancestor,
        // which turns it into the containing block for any fixed-position
        // descendant (CSS spec behavior) — this button would then be fixed
        // relative to that ancestor's box instead of the viewport, landing
        // outside the visible area. A portal sidesteps that entirely.
        <IxIconButton
          className={styles.fixedIndicator}
          variant="secondary"
          icon={isOnline ? iconConnected : iconDisconnected}
          iconColor={isOnline ? "color-success" : "color-alarm"}
          aria-label={isOnline ? "Connected to the server" : "Not connected to the server"}
          data-testid="connectivity-indicator"
          data-status={state.status}
          onClick={() => setShowDetail(true)}
        />,
        document.body,
      )}
      <IxModal
        ref={modalRef}
        disableAnimation
        onDialogClose={() => setShowDetail(false)}
        onDialogDismiss={() => setShowDetail(false)}
      >
        <IxModalHeader>Server connection</IxModalHeader>
        <IxModalContent>
          <div className={styles.status}>
            <IxIcon
              name={isOnline ? iconConnected : iconDisconnected}
              size="24"
              color={isOnline ? "var(--theme-color-success, #2ba02b)" : "var(--theme-color-alarm, #d0021b)"}
            />
            <IxTypography format="body">{isOnline ? "Connected" : "Not connected"}</IxTypography>
          </div>
          <IxTypography format="body-sm" textColor="soft">
            {state.lastCheckedAt === null
              ? "Checking…"
              : `Last checked ${new Date(state.lastCheckedAt).toLocaleTimeString()}`}
          </IxTypography>
          {!isOnline && (
            <IxTypography format="body-sm">
              Messages you send now are kept on this device and sent automatically once the connection is
              back.
            </IxTypography>
          )}
        </IxModalContent>
      </IxModal>
    </>
  );
}
