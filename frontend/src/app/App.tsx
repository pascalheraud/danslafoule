import {
  IxApplication,
  IxApplicationHeader,
  IxContent,
  IxMenu,
  IxSpinner,
} from "@siemens/ix-react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { GroupScreen } from "../features/group/GroupScreen";
import { Home } from "../features/home/Home";
import { MeScreen } from "../features/me/MeScreen";
import { Onboarding } from "../features/onboarding/Onboarding";
import { ROUTES } from "../routes";
import { getProfile, setProfilePseudo } from "../services/profileService";
import type { Profile } from "../services/types";
import { GroupsMenu } from "./GroupsMenu";
import { HeaderActiveGroup } from "./HeaderActiveGroup";
import { ScrollRestoration } from "./ScrollRestoration";
import { startGlobalPoller } from "../services/globalPoller";

type ProfileState =
  | { status: "loading" }
  | { status: "unregistered" }
  | { status: "ready"; profile: Profile };

export function App() {
  const [profileState, setProfileState] = useState<ProfileState>({
    status: "loading",
  });
  const [menuExpanded, setMenuExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getProfile().then((profile) => {
      if (cancelled) return;
      setProfileState(
        profile ? { status: "ready", profile } : { status: "unregistered" },
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stop = startGlobalPoller();
    return stop;
  }, []);

  async function handleRegister(pseudo: string) {
    const profile = await setProfilePseudo(pseudo);
    setProfileState({ status: "ready", profile });
  }

  // Onboarding has no groups to navigate yet, so it's shown without the app
  // shell (no menu/header to frame around a single gate screen), and without
  // being a route of its own — it's a pre-app gate, not a page to link to,
  // Back to, or reload directly into.
  if (profileState.status === "unregistered") {
    return <Onboarding onSubmit={handleRegister} />;
  }

  return (
    <IxApplication>
      <ScrollRestoration />
      <IxApplicationHeader
        name="Dans la foule"
        appIcon="/logo.svg"
        appIconAlt="Dans la foule"
      >
        <HeaderActiveGroup />
      </IxApplicationHeader>
      <IxMenu
        expand={menuExpanded}
        onExpandChange={(event) => setMenuExpanded(event.detail)}
      >
        <GroupsMenu onNavigate={() => setMenuExpanded(false)} />
      </IxMenu>
      <IxContent>
        {profileState.status !== "ready" ? (
          <IxSpinner />
        ) : (
          <Routes>
            <Route path={ROUTES.home} element={<Home />} />
            <Route path={ROUTES.me} element={<MeScreen />} />
            <Route path="/groups/:groupId" element={<GroupScreen />} />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
          </Routes>
        )}
      </IxContent>
    </IxApplication>
  );
}
