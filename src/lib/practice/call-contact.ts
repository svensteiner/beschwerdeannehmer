import { isPlaceholderPet } from "../alma/protocol.ts";
import { guessEmail, guessPhone, isAtHandy, sanitizeHalterinEmail, toWaMeNumber } from "../alma/phone.ts";

export function callSpokenBlob(input: {
  concern?: string;
  caller?: string;
  summary?: string;
  transcript?: Array<{ text?: string }> | unknown;
}) {
  const lines = Array.isArray(input.transcript)
    ? input.transcript.map((row) => {
        if (typeof row === "string") return row;
        if (row && typeof row === "object" && "text" in row) return String((row as { text?: string }).text ?? "");
        return "";
      })
    : [];
  return [input.concern, input.caller, input.summary, ...lines].filter(Boolean).join("\n");
}

/** Akte Handy if present, else the number spoken in the call — never the practice line. */
export function resolveOwnerPhone(aktePhone: string | undefined | null, blob: string) {
  const fromAkte = String(aktePhone ?? "").trim();
  if (fromAkte && toWaMeNumber(fromAkte)) return fromAkte;
  return guessPhone(blob);
}

/** Akte E-Mail if present, else an address spoken in the call — never the practice inbox. */
export function resolveOwnerEmail(akteEmail: string | undefined | null, blob: string) {
  return sanitizeHalterinEmail(akteEmail) || guessEmail(blob);
}

/** Patient / Nummer calls must not inherit a leftover Akte Handy or inbox. */
export function akteContactForCall(pet: string, value?: string | null) {
  if (isPlaceholderPet(pet)) return "";
  return String(value ?? "").trim();
}

/** Patient / Nummer calls keep the spoken Halterin, not a leftover Akte owner. */
export function akteCallerForCall(pet: string, joinedCaller: string, spokenCaller?: string | null) {
  const joined = String(joinedCaller ?? "").trim();
  const spoken = String(spokenCaller ?? "").trim();
  if (isPlaceholderPet(pet)) return spoken || joined || "Klientel";
  return joined || spoken || "Klientel";
}

/** Append a later Handy/E-Mail onto the Rückrufzettel so Anrufe can resolve tel:/wa.me. */
export function mergeSpokenReachIntoConcern(
  concern: string,
  phone?: string | null,
  email?: string | null,
) {
  let next = String(concern ?? "").trim();
  const phoneTrim = String(phone ?? "").trim();
  const emailTrim = String(email ?? "").trim();
  if (phoneTrim && !isAtHandy(guessPhone(next))) {
    next = next ? `${next}\n${phoneTrim}` : phoneTrim;
  }
  if (emailTrim && !guessEmail(next)) {
    next = next ? `${next}\n${emailTrim}` : emailTrim;
  }
  return next.slice(0, 1200);
}

type TranscriptLine = { from: "anrufer" | "alma"; text: string; at?: string };

/** Keep the follow-up sentence on the Zettel transcript so Anrufe shows the number. */
export function mergeSpokenReachIntoTranscript(transcript: unknown, spoken: string) {
  const lines: TranscriptLine[] = Array.isArray(transcript)
    ? transcript
        .map((row): TranscriptLine | null => {
          if (typeof row === "string") {
            const text = row.trim();
            return text ? { from: "anrufer", text: text.slice(0, 1200) } : null;
          }
          if (!row || typeof row !== "object") return null;
          const r = row as { from?: string; text?: string; at?: string };
          const text = String(r.text ?? "").trim();
          if (!text) return null;
          return {
            from: r.from === "alma" ? "alma" : "anrufer",
            text: text.slice(0, 1200),
            ...(r.at ? { at: String(r.at) } : {}),
          };
        })
        .filter((row): row is TranscriptLine => Boolean(row))
    : [];
  const text = String(spoken ?? "").trim().slice(0, 1200);
  if (!text || lines.some((line) => line.text === text)) return lines;
  return [...lines, { from: "anrufer" as const, text, at: new Date().toISOString() }].slice(-40);
}

/** Write Handy/E-Mail onto the last Rückrufzettel — Anrufe and Heute read the blob, not only the live card. */
export function applyReachToRueckrufCall(input: {
  concern: string;
  caller: string;
  transcript: unknown;
  pet?: string | null;
  phone?: string | null;
  email?: string | null;
  owner?: string | null;
  spoken?: string | null;
}) {
  const owner = String(input.owner ?? "").trim();
  const pet = String(input.pet ?? "").trim();
  return {
    concern: mergeSpokenReachIntoConcern(input.concern, input.phone, input.email),
    caller: owner && owner !== "Klientel" ? owner : String(input.caller ?? ""),
    pet: isPlaceholderPet(pet) ? "Patient" : pet || "Patient",
    transcript: mergeSpokenReachIntoTranscript(input.transcript, input.spoken ?? ""),
  };
}

/** Write Handy/E-Mail onto the last Notfall so Heute and /app/notfall can resolve tel:/wa.me. */
export function applyReachToEmergency(input: {
  summary: string;
  owner_name: string;
  pet?: string | null;
  phone?: string | null;
  email?: string | null;
  owner?: string | null;
}) {
  const owner = String(input.owner ?? "").trim();
  const pet = String(input.pet ?? "").trim();
  return {
    summary: mergeSpokenReachIntoConcern(input.summary, input.phone, input.email),
    owner_name: owner && owner !== "Klientel" ? owner : String(input.owner_name ?? ""),
    pet: isPlaceholderPet(pet) ? "Patient" : pet || "Patient",
  };
}

/** Write Handy/E-Mail onto the last Klientel-Protokoll so Nachrichten can resolve tel:/wa.me. */
export function applyReachToThread(input: {
  name: string;
  preview: string;
  messages: unknown;
  pet?: string | null;
  phone?: string | null;
  email?: string | null;
  owner?: string | null;
  spoken?: string | null;
}) {
  const owner = String(input.owner ?? "").trim();
  const pet = String(input.pet ?? "").trim();
  return {
    name: owner && owner !== "Klientel" ? owner : String(input.name ?? ""),
    pet: isPlaceholderPet(pet) ? "Patient" : pet || "Patient",
    preview: mergeSpokenReachIntoConcern(input.preview, input.phone, input.email),
    messages: mergeSpokenReachIntoTranscript(input.messages, input.spoken ?? ""),
  };
}
