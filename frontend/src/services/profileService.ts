// Profile = display pseudo only; the actual identity (Ed25519 keypair) lives
// in features/protocol/identity.ts. "No profile yet" (pre-onboarding) means
// no identity has been created at all — checked without creating one, so
// visiting the app before onboarding doesn't silently mint an identity with
// a throwaway default pseudo.
import { getOrCreateIdentity, hasIdentity, setPseudo } from "../features/protocol/identity";
import { broadcastRename } from "./messageService";
import type { Profile } from "./types";

export async function getProfile(): Promise<Profile | null> {
  if (!(await hasIdentity())) return null;
  const identity = await getOrCreateIdentity();
  return { pseudo: identity.pseudo };
}

export async function setProfilePseudo(pseudo: string): Promise<Profile> {
  // Onboarding (first-ever pseudo, no identity yet) isn't a "rename" — there's
  // no previous name and, necessarily, no group yet to broadcast it to.
  const isRename = await hasIdentity();
  const previousPseudo = isRename ? (await getOrCreateIdentity()).pseudo : null;

  const identity = await setPseudo(pseudo);

  if (isRename && previousPseudo !== null && previousPseudo !== identity.pseudo) {
    await broadcastRename(previousPseudo, identity.pseudo);
  }

  return { pseudo: identity.pseudo };
}
