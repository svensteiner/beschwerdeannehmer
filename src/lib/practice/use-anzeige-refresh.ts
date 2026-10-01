import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { refreshTafelAnzeige } from "@/lib/practice/board";
import {
  ANZEIGE_SEQ_UNKNOWN,
  anzeigeCopyNeeded,
  anzeigeRefreshShouldTick,
  deskFieldsBusy,
} from "@/lib/practice/board-poll";
import {
  anzeigeCopyError,
  clearAnzeigeCopyFail,
  noteAnzeigeCopyFail,
} from "@/lib/practice/tafel-anzeige";

export { anzeigeCopyError, noteAnzeigeCopyFail };

/** Survives Tafel-poll remounts so the minute is not reset every 10s. */
let lastAnzeigeCopyAt = 0;
let lastAnzeigeSeenSeq = ANZEIGE_SEQ_UNKNOWN;
let anzeigeCopyInFlight = false;

export function markAnzeigeCopied(at = Date.now(), seq?: number) {
  lastAnzeigeCopyAt = at;
  if (typeof seq === "number" && Number.isFinite(seq)) lastAnzeigeSeenSeq = seq;
  clearAnzeigeCopyFail();
}

export function anzeigeCopiedAt() {
  return lastAnzeigeCopyAt;
}

export function anzeigeSeenSeq() {
  return lastAnzeigeSeenSeq;
}

/** Recopy the writer Tafel onto Anzeige when copy-seq moves, or once a minute. No toast. */
export function useAnzeigeRefresh(anzeige: boolean, writerCopySeq = 0) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!anzeige || typeof document === "undefined") return;
    let on = true;
    // Boot already copied the writer folder. Recopying on first paint races login
    // and wipes the Anzeige session row before the minute clock is useful.
    if (lastAnzeigeSeenSeq < 0) {
      markAnzeigeCopied(Date.now(), writerCopySeq);
    }

    const tick = () => {
      if (
        !anzeigeRefreshShouldTick({
          anzeige: true,
          visible: document.visibilityState === "visible",
          pathname,
          busy: deskFieldsBusy(document.activeElement),
        })
      ) {
        return;
      }
      if (
        anzeigeCopyInFlight ||
        !anzeigeCopyNeeded({
          now: Date.now(),
          lastCopyAt: lastAnzeigeCopyAt,
          seenSeq: lastAnzeigeSeenSeq,
          writerSeq: writerCopySeq,
        })
      ) {
        return;
      }
      anzeigeCopyInFlight = true;
      void refreshTafelAnzeige()
        .then((res) => {
          if (!res.ok) {
            noteAnzeigeCopyFail(res.error);
            return;
          }
          markAnzeigeCopied(Date.now(), writerCopySeq);
          if (on) void router.invalidate();
        })
        .catch(() => {
          noteAnzeigeCopyFail();
        })
        .finally(() => {
          anzeigeCopyInFlight = false;
        });
    };

    // The 10s Tafel poll remounts AppLayout and would clear a 60s interval first.
    // Check on every mount; keep a short interval when poll is skipped (typing).
    tick();
    const id = window.setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      on = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [anzeige, pathname, router, writerCopySeq]);
}
