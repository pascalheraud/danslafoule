export const ROUTES = {
  home: "/",
  me: "/me",
} as const;

/** Static (parameter-free) route paths */
export type StaticRoute = (typeof ROUTES)[keyof typeof ROUTES];

// In-page anchors on the Home screen (the "create"/"join" forms), not
// separate routes — Home reads location.hash and scrolls to the matching
// element (see Home.tsx). Kept as typed constants for the same reason
// ROUTES/buildRoute are: no hand-typed path/hash strings at the call site.
export const ANCHORS = {
  createGroup: "create-group",
  joinGroup: "join-group",
} as const;

export const buildRoute = {
  group: (groupId: string): `/groups/${string}` => `/groups/${groupId}`,
  homeAnchor: (anchor: (typeof ANCHORS)[keyof typeof ANCHORS]): `/#${string}` => `/#${anchor}`,
} as const;

type BuiltRoute = ReturnType<(typeof buildRoute)[keyof typeof buildRoute]>;

/** Every path the app can navigate to — static or built */
export type AppRoute = StaticRoute | BuiltRoute;
