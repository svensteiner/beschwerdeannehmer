/**
 * Timeline + copy for the code-rendered product film (product-film.tsx).
 * Timings are seconds from film start; kept here, immutable, so the player
 * component only ever reads data.
 */

export const FILM_DURATION_S = 32;

export type SceneId =
  | "ringing"
  | "pickup"
  | "caller-symptom"
  | "patient-card"
  | "booking-confirm"
  | "calendar"
  | "stamps"
  | "end";

export interface Scene {
  readonly id: SceneId;
  readonly from: number;
  readonly to: number;
}

export const SCENES: readonly Scene[] = [
  { id: "ringing", from: 0, to: 3 },
  { id: "pickup", from: 3, to: 7 },
  { id: "caller-symptom", from: 7, to: 11 },
  { id: "patient-card", from: 11, to: 16 },
  { id: "booking-confirm", from: 16, to: 20 },
  { id: "calendar", from: 20, to: 25 },
  { id: "stamps", from: 25, to: 29 },
  { id: "end", from: 29, to: FILM_DURATION_S },
];

export interface AudioCue {
  readonly id: string;
  readonly src: string;
  readonly at: number;
  readonly volume: number;
}

/** One reusable HTMLAudioElement is created per cue id by the player. */
export const AUDIO_CUES: readonly AudioCue[] = [
  { id: "ring", src: "/film-audio/ring", at: 0.4, volume: 0.5 },
  { id: "ara", src: "/film-audio/ara", at: 3.2, volume: 1 },
];

export const WAVE_BAR_DELAYS: readonly number[] = [
  0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.96, 1.08,
];
export const RINGING_COPY = {
  dateline: "Mittwoch, 12:31 · Mittagspause",
  subtitle: "Die Ordination hat zu.",
} as const;
export const PICKUP_LINE =
  "Grüß Gott, Tierordination Huber. Was kann ich für Sie tun?";
export const CALLER_SYMPTOM_LINE =
  "Leitner, Lerchenfelder Straße 45 – der Rudi hustet seit heute früh.";
/** Scene-local seconds over which the caller line types in. */
export const CALLER_TYPE_DURATION_S = 1.6;

export const PATIENT_CARD = {
  title: "Rudi",
  meta: "Mischling, 7 Jahre · Frau Leitner, 1080 Wien",
  note: "Notiz: Zieht an der Leine · Datenabgleich: Frau Leitner, Lerchenfelder Straße 45",
} as const;
export const PATIENT_CARD_LINE =
  "Der Rudi, Mischling, sieben Jahre – ich hab ihn da. Passt Ihnen morgen um 14:20 bei der Frau Doktor?";
/** Scene-local seconds over which the patient card slides in. */
export const PATIENT_CARD_SLIDE_S = 1;

export const BOOKING_CALLER_LINE = "Ja, passt.";
export const BOOKING_SILVIA_LINE = "Gebucht. Der SMS-Entwurf ist bereit.";
export const BOOKING_SMS_LINE =
  "Termin Rudi: Do 14:20, Tierordination Huber, Josefstädter Straße 28. Terminänderungen bitte mit der Ordination abstimmen.";
/** Scene-local second at which the SMS bubble appears. */
export const SMS_APPEAR_AT_S = 1.6;

export const CALENDAR_HEADER = "Mittwoch, 14. Jänner · Tierordination Huber";
/** Seconds between each Tageskalender row appearing. */
export const CALENDAR_ROW_STAGGER_S = 1;

export type ChipTone = "ok" | "warn" | "flag";

export interface CalendarRow {
  readonly time: string;
  readonly pet: string;
  readonly owner: string;
  readonly note: string;
  readonly status: string;
  readonly tone: ChipTone;
}

export const CALENDAR_ROWS: readonly CalendarRow[] = [
  {
    time: "06:48",
    pet: "Rudi",
    owner: "Frau Leitner",
    note: "Hustet seit früh – Termin 14:20, SMS-Entwurf bereit",
    status: "Gebucht",
    tone: "ok",
  },
  {
    time: "12:31",
    pet: "Mimi",
    owner: "Herr Gruber",
    note: "Mittagspause, WhatsApp-Frage – wartet auf die Frau Doktor",
    status: "Für Sie offen",
    tone: "warn",
  },
  {
    time: "03:12",
    pet: "Bella",
    owner: "Fam. Novak",
    note: "Atemnot – Hinweis auf den tierärztlichen Notdienst",
    status: "Nachtdienst",
    tone: "flag",
  },
];

export const STAMPS_KICKER = "Was Silvia außerdem kann";
export const STAMPS: readonly string[] = [
  "Mittagspause",
  "Nachtdienst",
  "Für Ihre Ordination",
  "Praxisanbindung nach Prüfung",
];
/** Seconds between each stamp appearing. */
export const STAMP_STAGGER_S = 0.7;

export const END_TAGLINE =
  "Gebaut in Wien. Für Ordinationen in allen neun Bundesländern.";
export const END_TRIAL_NOTE = "Demo und Test nach Abstimmung";

/** Finds the scene that owns a given elapsed time, clamped to the last scene. */
export function getActiveScene(elapsed: number): Scene {
  return (
    SCENES.find((scene) => elapsed >= scene.from && elapsed < scene.to) ??
    SCENES[SCENES.length - 1]
  );
}
