import type { Complaint } from "./store.server";

const priorityWeight = { sicherheit: 0, dringend: 1, normal: 2 } as const;

export function sortComplaintsForInbox(items: Complaint[]): Complaint[] {
  return [...items].sort((a, b) =>
    (priorityWeight[a.priority] - priorityWeight[b.priority]) ||
    (Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  );
}
