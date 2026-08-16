import { IxButton, IxContentHeader, IxInput, IxTypography } from "@siemens/ix-react";
import { iconSaveAll } from "@siemens/ix-icons/icons";
import type { IxInputCustomEvent } from "@siemens/ix/components";
import { useEffect, useState } from "react";
import { showToast } from "../../app/toast";
import { getProfile, setProfilePseudo } from "../../services/profileService";
import styles from "./MeScreen.module.scss";

// Changing the name here broadcasts a `rename` message (protocol spec §6.4)
// to every group this device is a member of — the name is a single,
// cross-group identity setting, not something set per group.
export function MeScreen() {
  const [pseudo, setPseudoInput] = useState("");
  const [savedPseudo, setSavedPseudo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProfile().then((profile) => {
      if (!profile) return;
      setPseudoInput(profile.pseudo);
      setSavedPseudo(profile.pseudo);
    });
  }, []);

  function handlePseudoChange(event: IxInputCustomEvent<string>) {
    setPseudoInput(event.detail);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = pseudo.trim();
    if (!trimmed || trimmed === savedPseudo) return;
    setBusy(true);
    try {
      const profile = await setProfilePseudo(trimmed);
      setSavedPseudo(profile.pseudo);
      showToast({ type: "success", title: "Name updated in every group" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.me}>
      <IxContentHeader headerTitle="Me" />
      <IxTypography format="body">
        Your name is shared across every group you're in. Changing it here updates it everywhere.
      </IxTypography>
      <form onSubmit={handleSubmit}>
        <IxInput
          name="pseudo"
          label="Your name"
          value={pseudo}
          onValueChange={handlePseudoChange}
          placeholder="e.g. Alice"
        />
        <IxButton
          type="submit"
          icon={iconSaveAll}
          disabled={!pseudo.trim() || pseudo.trim() === savedPseudo || busy}
        >
          {busy ? "Saving…" : "Save"}
        </IxButton>
      </form>
    </div>
  );
}
