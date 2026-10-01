import assert from "node:assert/strict";
import test from "node:test";
import { createLiveBridge } from "./bridge";

function harness(decide: (u: string) => { speak: string; handoff: boolean }) {
  const sent: Array<Record<string, unknown>> = [];
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const bridge = createLiveBridge({
    socket: { send: (d) => sent.push(JSON.parse(d)) },
    decide,
    silenceMs: 900,
    closeAfterHandoffMs: 6000,
    setTimeout: ((fn: () => void, ms: number) => { const t = { fn, ms, live: true }; timers.push(t); return t; }) as never,
    clearTimeout: ((t: { live: boolean }) => { t.live = false; }) as never,
  });
  const fire = (ms: number) => timers.filter((t) => t.live && t.ms === ms).forEach((t) => { t.live = false; t.fn(); });
  const say = (delta: string) => bridge.onEvent({ type: "session.input_transcript.delta", delta });
  return { bridge, sent, say, fire };
}

test("Textstücke werden zu einer Äußerung gesammelt und nach der Pause beantwortet", () => {
  const seen: string[] = [];
  const h = harness((u) => { seen.push(u); return { speak: "Gern, Montag um 9 Uhr.", handoff: false }; });
  h.say("Ich hätte gern "); h.say("einen Termin ");  h.say("für Bella");
  assert.equal(h.sent.length, 0);
  h.fire(900);
  assert.deepEqual(seen, ["Ich hätte gern einen Termin für Bella"]);
  assert.equal(h.sent[0]?.type, "session.commentary.append");
  assert.equal(h.sent[0]?.content, "Gern, Montag um 9 Uhr.");
  assert.equal(h.sent[0]?.delegation_id, null);
});

test("Neue Textstücke setzen die Pause zurück (nur eine Antwort je Äußerung)", () => {
  const h = harness(() => ({ speak: "ok", handoff: false }));
  h.say("Hallo"); h.say(" zusammen");
  h.fire(900);
  assert.equal(h.sent.length, 1);
});

test("Übergabe: Antwort wird gesprochen, danach schließt die Sitzung, weitere Worte werden ignoriert", () => {
  const h = harness(() => ({ speak: "Ich verbinde Sie sofort mit dem Notdienst.", handoff: true }));
  h.say("Mein Hund atmet nicht mehr"); h.fire(900);
  assert.equal(h.bridge.handedOff, true);
  h.say("noch etwas"); h.fire(900);
  assert.equal(h.sent.length, 1);
  h.fire(6000);
  assert.equal(h.sent[1]?.type, "session.close");
});

test("Fremde Ereignisse und leere Äußerungen lösen nichts aus", () => {
  const h = harness(() => ({ speak: "x", handoff: false }));
  h.bridge.onEvent({ type: "session.output_transcript.delta", delta: "Silvia spricht" });
  h.say("   "); h.fire(900);
  assert.equal(h.sent.length, 0);
});
