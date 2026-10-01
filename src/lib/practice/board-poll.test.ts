import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANZEIGE_REFRESH_MS,
  BOARD_POLL_MS,
  anzeigeCopyDue,
  anzeigeCopyNeeded,
  ANZEIGE_SEQ_UNKNOWN,
  anzeigeRefreshShouldTick,
  boardPollShouldTick,
  deskFieldsBusy,
} from "./board-poll.ts";

test("polls the Tafel only on a visible idle desk tab", () => {
  assert.equal(BOARD_POLL_MS, 10_000);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/app", busy: false }), true);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/app/kalender", busy: false }), true);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/app/anrufe", busy: false }), true);
  assert.equal(boardPollShouldTick({ visible: false, pathname: "/app", busy: false }), false);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/app", busy: true }), false);
});

test("does not poll Einstellungen so Speichern fields stay", () => {
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/app/einstellungen", busy: false }), false);
  assert.equal(
    boardPollShouldTick({ visible: true, pathname: "/app/einstellungen/", busy: false }),
    false,
  );
});

test("polls the staff phone and skips public marketing paths", () => {
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/sprechen", busy: false }), true);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/sprechen", busy: true }), false);
  assert.equal(boardPollShouldTick({ visible: false, pathname: "/sprechen", busy: false }), false);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/", busy: false }), false);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/login", busy: false }), false);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/demo", busy: false }), false);
  assert.equal(boardPollShouldTick({ visible: true, pathname: "/leitung/foo", busy: false }), false);
});

test("typing in Walk-in or Akte counts as busy", () => {
  assert.equal(deskFieldsBusy(null), false);
  assert.equal(deskFieldsBusy({ tagName: "DIV" }), false);
  assert.equal(deskFieldsBusy({ tagName: "INPUT" }), true);
  assert.equal(deskFieldsBusy({ tagName: "textarea" }), true);
  assert.equal(deskFieldsBusy({ tagName: "SELECT" }), true);
  assert.equal(deskFieldsBusy({ tagName: "DIV", isContentEditable: true }), true);
});

test("Anzeige copies when writer seq moves, or once a minute when idle", () => {
  assert.equal(ANZEIGE_REFRESH_MS, 60_000);
  assert.equal(anzeigeRefreshShouldTick({ anzeige: true, visible: true, pathname: "/app", busy: false }), true);
  assert.equal(anzeigeRefreshShouldTick({ anzeige: true, visible: true, pathname: "/app/akte", busy: false }), true);
  assert.equal(anzeigeRefreshShouldTick({ anzeige: true, visible: true, pathname: "/sprechen", busy: false }), true);
  assert.equal(anzeigeRefreshShouldTick({ anzeige: false, visible: true, pathname: "/app", busy: false }), false);
  assert.equal(anzeigeRefreshShouldTick({ anzeige: true, visible: true, pathname: "/app", busy: true }), false);
  assert.equal(anzeigeRefreshShouldTick({ anzeige: true, visible: true, pathname: "/app/einstellungen", busy: false }), false);
  assert.equal(anzeigeRefreshShouldTick({ anzeige: true, visible: false, pathname: "/app", busy: false }), false);
  assert.equal(anzeigeCopyDue(1, 0, ANZEIGE_REFRESH_MS), true);
  assert.equal(anzeigeCopyDue(59_000, 10_000, ANZEIGE_REFRESH_MS), false);
  assert.equal(anzeigeCopyDue(70_000, 10_000, ANZEIGE_REFRESH_MS), true);
  assert.equal(anzeigeCopyDue(120_000, 60_000, ANZEIGE_REFRESH_MS), true);
  assert.equal(
    anzeigeCopyNeeded({ now: 20_000, lastCopyAt: 10_000, seenSeq: ANZEIGE_SEQ_UNKNOWN, writerSeq: 4 }),
    false,
  );
  assert.equal(
    anzeigeCopyNeeded({ now: 20_000, lastCopyAt: 10_000, seenSeq: 4, writerSeq: 4 }),
    false,
  );
  assert.equal(
    anzeigeCopyNeeded({ now: 20_000, lastCopyAt: 10_000, seenSeq: 4, writerSeq: 5 }),
    true,
  );
  assert.equal(
    anzeigeCopyNeeded({ now: 20_000, lastCopyAt: 10_000, seenSeq: 25, writerSeq: 1 }),
    true,
  );
  assert.equal(
    anzeigeCopyNeeded({ now: 70_000, lastCopyAt: 10_000, seenSeq: 4, writerSeq: 4 }),
    true,
  );
});
