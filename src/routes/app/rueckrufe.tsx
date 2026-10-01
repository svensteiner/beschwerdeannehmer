import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { displayOwner } from "@/lib/alma/actions";
import { updateCallStatus } from "@/lib/practice/desk-actions";
import {
  CALLBACK_REASON_LABEL,
  loadOpenCallbacks,
  type CallbackReason,
  type OpenCallback,
} from "@/lib/practice/callback-rows";

export const Route = createFileRoute("/app/rueckrufe")({ component: RueckrufePage });

const appRoute = getRouteApi("/app");

function reasonBadgeClass(reason: CallbackReason) {
  switch (reason) {
    case "konflikt":
      return "border-red-300 bg-red-50 text-red-700";
    case "thea":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "warteliste":
      return "border-sky-300 bg-sky-50 text-sky-700";
    default:
      return "border-border bg-secondary text-foreground";
  }
}

function RueckrufePage() {
  const data = appRoute.useLoaderData();
  const router = useRouter();
  const anzeige = Boolean(data.ok && data.anzeige);
  const [items, setItems] = useState<OpenCallback[] | null>(null);
  const [analysis, setAnalysis] = useState<{ total: number; byReason: { reason: CallbackReason; count: number }[] }>({
    total: 0,
    byReason: [],
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadOpenCallbacks()
      .then((res) => {
        if (!live) return;
        setItems(res.items);
        setAnalysis(res.analysis);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Rückrufe</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Alles, was Silvia nicht selbst abschließen konnte und die Praxis zurückrufen muss.
      </p>

      {analysis.byReason.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {analysis.byReason.map((entry) => (
            <span
              key={entry.reason}
              className="rounded-full border border-border bg-card px-3 py-1 text-sm tabular-nums"
            >
              {CALLBACK_REASON_LABEL[entry.reason]} · {entry.count}
            </span>
          ))}
        </div>
      ) : null}

      {failed ? (
        <p className="mt-4 text-sm text-muted-foreground">Die Rückrufe konnten nicht geladen werden.</p>
      ) : null}

      {items && items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Keine offenen Rückrufe.</p>
      ) : null}

      {items && items.length ? (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{c.pet !== "Patient" ? c.pet : displayOwner(c.caller)}</p>
                  <Badge variant="outline" className={reasonBadgeClass(c.reason)}>
                    {CALLBACK_REASON_LABEL[c.reason]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {displayOwner(c.caller)}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
                <p className="mt-1 text-sm">{c.concern}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void updateCallStatus({ data: { id: c.id, status: "erledigt" } })
                      .then((res) => {
                        if (!res.ok) {
                          toast.error("error" in res && res.error ? res.error : "Status nicht gespeichert.");
                          return;
                        }
                        toast.success("Rückruf erledigt.");
                        void router.invalidate();
                        setItems((prev) => prev?.filter((x) => x.id !== c.id) ?? prev);
                      })
                      .catch(() => toast.error("Status nicht gespeichert."));
                  }}
                  disabled={anzeige}
                  title={anzeige ? "Tafel-Anzeige ist schreibgeschützt." : undefined}
                >
                  Erledigt
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
