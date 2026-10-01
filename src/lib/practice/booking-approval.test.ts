import assert from "node:assert/strict";
import test from "node:test";
import { appointmentWriteApproved } from "./booking-approval.ts";

const env = (over: Record<string, string | undefined> = {}) =>
  ({ SILVIA_BOOKING: "connector", SILVIA_BOOKING_LIVE_APPROVED: "1", ...over }) as Record<
    string,
    string | undefined
  >;

test("Connector-Freigabe braucht alle drei Bedingungen", () => {
  assert.equal(
    appointmentWriteApproved({ write: { appointment: true } }, env()),
    true,
  );
});

test("fehlende Connector-Freigabe schreibt nicht", () => {
  assert.equal(
    appointmentWriteApproved(
      { write: { appointment: true } },
      env({ SILVIA_BOOKING: undefined }),
    ),
    false,
  );
});

test("ohne ausdrückliches Live-Go schreibt nichts", () => {
  assert.equal(
    appointmentWriteApproved(
      { write: { appointment: true } },
      env({ SILVIA_BOOKING_LIVE_APPROVED: undefined }),
    ),
    false,
  );
});

test("ohne Appointment-Cap schreibt nichts", () => {
  assert.equal(
    appointmentWriteApproved({ write: {} }, env()),
    false,
  );
  assert.equal(
    appointmentWriteApproved(null, env()),
    false,
  );
  assert.equal(
    appointmentWriteApproved(undefined, env()),
    false,
  );
});

test("Whitespace und fremde Werte werden nicht als Freigabe gezählt", () => {
  // führende/abschließende Leerzeichen sind ok, aber falsche Werte nicht
  assert.equal(
    appointmentWriteApproved(
      { write: { appointment: true } },
      env({ SILVIA_BOOKING: " connector ", SILVIA_BOOKING_LIVE_APPROVED: "1 " }),
    ),
    true,
  );
  assert.equal(
    appointmentWriteApproved(
      { write: { appointment: true } },
      env({ SILVIA_BOOKING: "off" }),
    ),
    false,
  );
  assert.equal(
    appointmentWriteApproved(
      { write: { appointment: true } },
      env({ SILVIA_BOOKING_LIVE_APPROVED: "0" }),
    ),
    false,
  );
});
