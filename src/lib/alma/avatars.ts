export const AVATARS = [
  { id: "wien", city: "Wien", look: "Klassisch", src: "/avatars/wien.jpg" },
  { id: "graz", city: "Graz", look: "Steiermark", src: "/avatars/graz.jpg" },
  { id: "linz", city: "Linz", look: "Oberösterreich", src: "/avatars/linz.jpg" },
  { id: "innsbruck", city: "Innsbruck", look: "Tirol", src: "/avatars/innsbruck.jpg" },
  { id: "salzburg", city: "Salzburg", look: "Stadt", src: "/avatars/salzburg.jpg" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];

export function isAvatarId(id: string | null | undefined): id is AvatarId {
  return AVATARS.some((a) => a.id === id);
}

export function avatarById(id: string) {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

/** Live desk face from the Tafel city — empty place is unset, never Huber Wien. */
export function avatarForPlace(city?: string, bundesland?: string): AvatarId | undefined {
  const blob = `${city ?? ""} ${bundesland ?? ""}`.toLowerCase();
  if (!blob.trim()) return undefined;
  if (/graz|steiermark/.test(blob)) return "graz";
  if (/linz|oberösterreich|oberoesterreich|oberosterreich/.test(blob)) return "linz";
  if (/innsbruck|tirol/.test(blob)) return "innsbruck";
  if (/salzburg/.test(blob)) return "salzburg";
  if (/wien/.test(blob)) return "wien";
  return "wien";
}

export function liveAvatarStorageKey(practiceId: string) {
  const id = String(practiceId ?? "").trim();
  return id ? `silvia.live-avatar:${id}` : "";
}
