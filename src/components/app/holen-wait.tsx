import { useEffect, useState } from "react";
import { holenWaitNext } from "@/lib/practice/desk-session";
import {
  TAFEL_HOLEN_WAIT,
  TAFEL_HOLEN_WAIT_ID,
  TAFEL_HOLEN_WAIT_SLOW,
  TAFEL_HOLEN_WAIT_SLOW_ID,
  TAFEL_HOLEN_WAIT_FAIL_ID,
  TAFEL_HOLEN_WAIT_NEXT_ID,
  waitHolenPendingUntilIdle,
} from "@/lib/practice/desk-storage";

/** No board loader — this page must not import `@/lib/db`. */
export function HolenWaitPage({ next, fail: firstFail }: { next?: string; fail?: string }) {
  const [slow, setSlow] = useState(false);
  const [fail, setFail] = useState(() => String(firstFail ?? "").trim());
  const href = holenWaitNext(next);
  useEffect(() => {
    if (fail) return;
    let cancelled = false;
    void waitHolenPendingUntilIdle({
      onSlow: () => {
        if (!cancelled) setSlow(true);
      },
    }).then((result) => {
      if (cancelled) return;
      if (result.fail) {
        setFail(result.fail);
        return;
      }
      window.location.assign(href);
    });
    return () => {
      cancelled = true;
    };
  }, [href, fail]);
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-3 p-8">
      <h1 className="font-display text-2xl font-semibold">Silvia</h1>
      {fail ? (
        <>
          <p id={TAFEL_HOLEN_WAIT_FAIL_ID} className="text-sm">
            {fail}
          </p>
          <a
            id={TAFEL_HOLEN_WAIT_NEXT_ID}
            href={href}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Weiter
          </a>
        </>
      ) : (
        <>
          <p id={TAFEL_HOLEN_WAIT_ID} className="text-sm">
            {TAFEL_HOLEN_WAIT}
          </p>
          {slow ? (
            <p id={TAFEL_HOLEN_WAIT_SLOW_ID} className="text-sm text-muted-foreground">
              {TAFEL_HOLEN_WAIT_SLOW}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
