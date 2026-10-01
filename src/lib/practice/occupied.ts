import type { OccupiedSlot } from "@/lib/alma/hours";
import type { Sql } from "@/lib/db";
import { BOARD_APPOINTMENT_LIMIT, boardRange, isLeftoverNamelessHeuteSlot } from "./board-window";

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value ?? ""));
}

/** Laid (not cancelled) appointments that still occupy a slot. */
export async function loadOccupiedSlots(
  sql: Sql,
  practiceId: string,
  exceptId?: string,
): Promise<OccupiedSlot[]> {
  const { start, end } = boardRange();
  const rows = await sql<{
    id: string;
    start_at: string | Date;
    minutes: number;
    pet: string;
    owner_name: string;
  }>`
    select id, start_at, minutes, pet, owner_name from appointments
    where practice_id = ${practiceId}
      and coalesce(status, 'gelegt') <> 'abgesagt'
      and start_at >= ${start.toISOString()}
      and start_at < ${end.toISOString()}
    order by start_at asc
    limit ${BOARD_APPOINTMENT_LIMIT}
  `;
  return rows
    .filter((row) => !exceptId || row.id !== exceptId)
    .filter(
      (row) =>
        !isLeftoverNamelessHeuteSlot({
          pet: row.pet,
          owner_name: row.owner_name,
        }),
    )
    .map((row) => ({
      start: asDate(row.start_at),
      minutes: Number(row.minutes) || 20,
      pet: String(row.pet || "").slice(0, 40),
    }))
    .filter((row) => !Number.isNaN(+row.start));
}
