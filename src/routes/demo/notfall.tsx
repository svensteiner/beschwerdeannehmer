import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { toast } from "sonner";
import { UrgencyBadge } from "@/components/demo/status-badge";
import { Button } from "@/components/ui/button";
import { EMERGENCIES, PRACTICE } from "@/lib/alma/data";
import { useAlmaStore } from "@/lib/alma/store";

export const Route = createFileRoute("/demo/notfall")({ component: Notfall });

function Notfall() {
  const extra = useAlmaStore((s) => s.extraEmergencies);
  const handled = useAlmaStore((s) => s.emergenciesHandled);
  const mark = useAlmaStore((s) => s.markEmergency);
  const all = [...extra, ...EMERGENCIES];

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Notfallhinweise</h1>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        Silvia diagnostiziert nicht. Sie legt bei Atemnot, Blutung, Krampf und Gift einen
        Schlagworthinweis auf die Demo-Tafel. Das Team prüft den hinterlegten Kontakt selbst.
      </p>
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Hinterlegter Nachtdienst
        </p>
        <p className="mt-1 font-display text-xl">{PRACTICE.nachtdienst.name}</p>
        <p className="tabular-nums">{PRACTICE.nachtdienst.phone}</p>
        <p className="mt-2 text-sm text-muted-foreground">{PRACTICE.nachtdienst.note}</p>
      </div>
      <ul className="mt-6 space-y-3">
        {all.map((e) => {
          const done = handled.includes(e.id) || e.status === "dokumentiert";
          return (
            <li key={e.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <UrgencyBadge urgency={e.urgency} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {format(new Date(e.at), "d. MMM, HH:mm", { locale: deAT })}
                </span>
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold">
                {e.pet} · {e.species}
              </h2>
              <p className="text-sm text-muted-foreground">{e.owner}</p>
              <p className="mt-2">{e.summary}</p>
              <p className="mt-2 text-sm">
                Hinterlegter Kontakt: <span className="font-medium">{e.routedTo}</span> · bitte manuell prüfen
              </p>
              <div className="mt-4">
                {done ? (
                  <p className="text-sm text-ok">In der Demo als bearbeitet markiert.</p>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      mark(e.id);
                      toast.success("In der Demo als bearbeitet markiert.");
                    }}
                  >
                    In Demo als bearbeitet markieren
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
