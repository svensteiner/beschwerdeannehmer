import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { ComplaintPriority } from "./validation";

export type ComplaintStatus = "neu" | "in_pruefung" | "beantwortet" | "geschlossen";
export type ComplaintHistoryEntry = { at: string; status: ComplaintStatus; response?: string };
export type Complaint = {
  reference: string;
  createdAt: string;
  location: string;
  category: string;
  description: string;
  name: string;
  email: string;
  occurredAt: string;
  contactPhone: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  response?: string;
  history: ComplaintHistoryEntry[];
};

function retentionDays() {
  const configured = Number(process.env.GARAGEN_RETENTION_DAYS ?? "180");
  return Number.isFinite(configured) && configured >= 1 && configured <= 3650 ? configured : 180;
}

function filePath() {
  return join(process.env.GARAGEN_DATA_DIR || join(process.cwd(), ".garagen-data"), "beschwerden.json");
}

let writeQueue: Promise<void> = Promise.resolve();

async function persist(items: Complaint[]) {
  const target = filePath();
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await readStoredComplaints(target);
    await copyFile(target, `${target}.bak`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    await writeFile(temporary, JSON.stringify(items, null, 2), "utf8");
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  let result!: T;
  const operation = writeQueue.catch(() => undefined).then(async () => { result = await mutation(); });
  writeQueue = operation.then(() => undefined, () => undefined);
  await operation;
  return result;
}

export async function listComplaints(): Promise<Complaint[]> {
  const target = filePath();
  try {
    return await readStoredComplaints(target);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(`Beschwerde-Speicher kann nicht sicher gelesen werden: ${target}`, { cause: error });
  }
}

async function readStoredComplaints(target: string): Promise<Complaint[]> {
  const raw = await readFile(target, "utf8");
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("Der Beschwerde-Speicher enthält keine Liste von Vorgängen.");
  return value as Complaint[];
}

export async function saveComplaint(input: Omit<Complaint, "status" | "history">): Promise<Complaint> {
  return enqueueMutation(async () => {
    const cutoff = Date.now() - retentionDays() * 24 * 60 * 60 * 1000;
    const current = (await listComplaints()).filter((item) => Date.parse(item.createdAt) >= cutoff);
    const complaint: Complaint = { ...input, status: "neu", history: [{ at: input.createdAt, status: "neu" }] };
    await persist([complaint, ...current]);
    return complaint;
  });
}

export async function purgeExpiredComplaints(now = Date.now()) {
  return enqueueMutation(async () => {
    const cutoff = now - retentionDays() * 24 * 60 * 60 * 1000;
    const current = await listComplaints();
    const remaining = current.filter((item) => Date.parse(item.createdAt) >= cutoff);
    if (remaining.length !== current.length) await persist(remaining);
    return current.length - remaining.length;
  });
}

export async function updateComplaintStatus(reference: string, status: ComplaintStatus, response?: string) {
  return enqueueMutation(async () => {
    const current = await listComplaints();
    const index = current.findIndex((item) => item.reference === reference);
    if (index < 0) return null;
    const changedAt = new Date().toISOString();
    const history = Array.isArray(current[index].history) ? current[index].history : [{ at: current[index].createdAt, status: "neu" as const }];
    current[index] = { ...current[index], status, ...(response === undefined ? {} : { response }), history: [...history, { at: changedAt, status, ...(response === undefined ? {} : { response }) }] };
    await persist(current);
    return current[index];
  });
}

export async function deleteComplaint(reference: string) {
  return enqueueMutation(async () => {
    const current = await listComplaints();
    const remaining = current.filter((item) => item.reference !== reference);
    if (remaining.length === current.length) return false;
    await persist(remaining);
    return true;
  });
}
