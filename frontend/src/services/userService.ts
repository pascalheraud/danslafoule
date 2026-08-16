import { localCache } from "./localCache";
import type { Profile } from "./types";

export function getProfile(): Promise<Profile | null> {
  return localCache.getProfile();
}

export async function setProfileName(uuid: string, name: string): Promise<Profile> {
  const profile: Profile = { uuid, name };
  await localCache.setProfile(profile);
  return profile;
}
