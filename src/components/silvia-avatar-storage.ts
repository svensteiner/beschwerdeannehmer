import { isAvatarId, type AvatarId } from "@/lib/alma/avatars";

export function readStoredAvatar(key?: string): AvatarId | undefined {
  if (!key || typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(key);
    return isAvatarId(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredAvatar(key: string | undefined, id: AvatarId) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, id);
  } catch {
    /* private mode */
  }
}
