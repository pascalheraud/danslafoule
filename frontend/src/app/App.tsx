import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  IxApplication,
  IxApplicationHeader,
  IxContent,
  IxMenu,
  IxSpinner,
} from "@siemens/ix-react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { GroupScreen } from "../features/group/GroupScreen";
import { Home } from "../features/home/Home";
import { MeScreen } from "../features/me/MeScreen";
import { Onboarding } from "../features/onboarding/Onboarding";
import { ROUTES } from "../routes";
import { getProfile, setProfilePseudo } from "../services/profileService";
import type { Profile } from "../services/types";
import { ConnectivityIndicator } from "./ConnectivityIndicator";
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
  const navigate = useNavigate();

  // Android hardware/gesture back button: without this, Capacitor's default
  // behavior navigates the WebView's own history (out of sync with
  // MemoryRouter) or exits the app unexpectedly. No-op on the web.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        navigate(-1);
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      listener.then((handle) => handle.remove());
    };
  }, [navigate]);

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
      />
      {/* Both portal themselves onto <body> as fixed-position elements —
          see their own files — so they're deliberately not children of
          IxApplicationHeader (whose secondary slot collapses into a "more"
          dropdown below the sm breakpoint, which would defeat the point of
          keeping the active-group badge and the connectivity indicator
          reachable on mobile without an extra tap). */}
      <HeaderActiveGroup />
      <ConnectivityIndicator />
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
