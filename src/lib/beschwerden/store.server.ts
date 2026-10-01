import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ComplaintStatus = "neu" | "in_pruefung" | "beantwortet" | "geschlossen";
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
  status: ComplaintStatus;
  response?: string;
};

function filePath() {
  return join(process.env.GARAGEN_DATA_DIR || join(process.cwd(), ".garagen-data"), "beschwerden.json");
}

export async function listComplaints(): Promise<Complaint[]> {
  try {
    const raw = await readFile(filePath(), "utf8");
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export async function saveComplaint(input: Omit<Complaint, "status">): Promise<Complaint> {
  const current = await listComplaints();
  const complaint: Complaint = { ...input, status: "neu" };
  const target = filePath();
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify([complaint, ...current], null, 2), "utf8");
  return complaint;
}

export async function updateComplaintStatus(reference: string, status: ComplaintStatus, response?: string) {
  const current = await listComplaints();
  const index = current.findIndex((item) => item.reference === reference);
  if (index < 0) return null;
  current[index] = { ...current[index], status, ...(response === undefined ? {} : { response }) };
  const target = filePath();
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(current, null, 2), "utf8");
  return current[index];
}
