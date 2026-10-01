import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESK_SESSION_KEY,
  deskLoginNext,
  deskLoginNextFromLocation,
  holenWaitNext,
  forgetDeskSession,
  hadDeskSession,
  rememberDeskSession,
} from "./desk-session.ts";

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
}

test("desk session marker survives in localStorage until logout", () => {
  const s = mem();
  assert.equal(hadDeskSession(s), false);
  rememberDeskSession(s);
  assert.equal(s.getItem(DESK_SESSION_KEY), "1");
  assert.equal(hadDeskSession(s), true);
  forgetDeskSession(s);
  assert.equal(hadDeskSession(s), false);
});

test("missing storage is a no-op, not a throw", () => {
  rememberDeskSession(null);
  forgetDeskSession(null);
  assert.equal(hadDeskSession(null), false);
  assert.equal(hadDeskSession(undefined), false);
});

test("login next allows staff phone and Tafel paths, never an open redirect", () => {
  assert.equal(deskLoginNext("/sprechen"), "/sprechen");
  assert.equal(deskLoginNext("/app"), "/app");
  assert.equal(deskLoginNext("/app/kalender"), "/app/kalender");
  assert.equal(deskLoginNext("/app/kalender?d=2026-08-27"), "/app/kalender?d=2026-08-27");
  assert.equal(deskLoginNext("/app/akte?p=w-ab12"), "/app/akte?p=w-ab12");
  assert.equal(deskLoginNext("/app/anrufe?c=deadbeef"), "/app/anrufe?c=deadbeef");
  assert.equal(deskLoginNext("/sprechen?x=1"), "/sprechen");
  assert.equal(deskLoginNext(" /sprechen"), "/sprechen");
  assert.equal(deskLoginNext("/demo"), undefined);
  assert.equal(deskLoginNext("/leitung/huber"), undefined);
  assert.equal(deskLoginNext("/app/kalender?d=nope"), "/app/kalender");
  assert.equal(deskLoginNext("https://evil.example/sprechen"), undefined);
  assert.equal(deskLoginNext("//evil/sprechen"), undefined);
  assert.equal(deskLoginNext("/sprechen/../app"), "/app");
  assert.equal(deskLoginNext("/app/../demo"), undefined);
  assert.equal(deskLoginNext(""), undefined);
  assert.equal(deskLoginNext(undefined), undefined);
});

test("location href keeps the Kalender day on login next", () => {
  assert.equal(
    deskLoginNextFromLocation({
      pathname: "/app/kalender",
      href: "/app/kalender?d=2026-08-27&a=slot1",
      search: { d: "2026-08-27", a: "slot1" },
    }),
    "/app/kalender?d=2026-08-27&a=slot1",
  );
  assert.equal(
    deskLoginNextFromLocation({
      pathname: "/app",
      href: "http://127.0.0.1:8080/app",
      search: {},
    }),
    "/app",
  );
});

test("holen wait next returns to staff Tafel, Anmelden, or the public Leitung", () => {
  assert.equal(holenWaitNext("/app"), "/app");
  assert.equal(holenWaitNext("/app/einstellungen"), "/app/einstellungen");
  assert.equal(holenWaitNext("/sprechen"), "/sprechen");
  assert.equal(holenWaitNext("/login"), "/login");
  assert.equal(holenWaitNext("/login?next=/app"), "/login");
  assert.equal(holenWaitNext("/registrieren"), "/registrieren");
  assert.equal(holenWaitNext("/leitung/tafel-graz-holenwaitpage-3"), "/leitung/tafel-graz-holenwaitpage-3");
  assert.equal(holenWaitNext("/leitung/Huber"), "/app");
  assert.equal(holenWaitNext("/leitung/tafel/extra"), "/app");
  assert.equal(holenWaitNext("/demo"), "/app");
  assert.equal(holenWaitNext("https://evil.example/leitung/x"), "/app");
  assert.equal(holenWaitNext("//evil/leitung/x"), "/app");
  assert.equal(holenWaitNext(""), "/app");
  assert.equal(holenWaitNext(undefined), "/app");
});
