import { IxApplication, IxApplicationHeader, IxContent, IxMenu, IxMenuItem, IxSpinner } from "@siemens/ix-react";
import { iconGroup } from "@siemens/ix-icons/icons";
import { useEffect, useState } from "react";
import { GroupScreen } from "../features/group/GroupScreen";
import { Home } from "../features/home/Home";
import { Onboarding } from "../features/onboarding/Onboarding";
import { getOrCreateDeviceUuid } from "../services/identity";
import type { Profile } from "../services/types";
import { getProfile, setProfileName } from "../services/userService";

type ProfileState = { status: "loading" } | { status: "unregistered" } | { status: "ready"; profile: Profile };

type Screen = { name: "home" } | { name: "group"; groupUuid: string };

export function App() {
  const [deviceUuid] = useState(getOrCreateDeviceUuid);
  const [profileState, setProfileState] = useState<ProfileState>({ status: "loading" });
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  useEffect(() => {
    let cancelled = false;

    getProfile().then((profile) => {
      if (cancelled) return;
      setProfileState(profile ? { status: "ready", profile } : { status: "unregistered" });
    });

    return () => {
      cancelled = true;
    };
  }, [deviceUuid]);

  function handleOpenGroup(groupUuid: string) {
    setScreen({ name: "group", groupUuid });
  }

  function handleGoHome() {
    setScreen({ name: "home" });
  }

  async function handleRegister(name: string) {
    const profile = await setProfileName(deviceUuid, name);
    setProfileState({ status: "ready", profile });
  }

  function Page() {
    if (profileState.status !== "ready") {
      return <IxSpinner />;
    }
    if (screen.name === "group") {
      return (
        <GroupScreen groupUuid={screen.groupUuid} profile={profileState.profile} onBack={handleGoHome} />
      );
    }
    return <Home profile={profileState.profile} onOpenGroup={handleOpenGroup} />;
  }

  // Onboarding has no groups to navigate yet, so it's shown without the app
  // shell (no menu/header to frame around a single gate screen).
  if (profileState.status === "unregistered") {
    return <Onboarding onSubmit={handleRegister} />;
  }

  return (
    <IxApplication>
      <IxApplicationHeader name="Dans la foule" appIcon="/logo.svg" appIconAlt="Dans la foule" />
      <IxMenu>
        <IxMenuItem icon={iconGroup} active={screen.name === "home"} onClick={handleGoHome}>
          Groups
        </IxMenuItem>
      </IxMenu>
      <IxContent>{Page()}</IxContent>
    </IxApplication>
  );
}
