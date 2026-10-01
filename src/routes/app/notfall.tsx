import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HalterinReach } from "@/components/desk/halterin-reach";
import { NachtdienstReach } from "@/components/desk/nachtdienst-reach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayOwner } from "@/lib/alma/actions";
import { emergencyDeskLead, nachtdienstDraft, nachtdienstReachCopy } from "@/lib/alma/protocol";
import { loadEmergencyAudit, loadEmergencyById, searchEmergencies, updateEmergencyStatus } from "@/lib/practice/desk-actions";
import type { EmergencyAuditEvent } from "@/lib/practice/emergency-audit";
import { emergencyStatusLabel, DESK_SEARCH_PLACEHOLDER } from "@/lib/practice/desk-status";
import { emergencySearchNeedle } from "@/lib/practice/emergency-query";
import type { DeskEmergency } from "@/lib/practice/emergency-rows";
import { anzeigeControl, notfallWriteVisible } from "@/lib/practice/tafel-anzeige";
import { emailForPet, ownerReachBody, ownerReachMailSubject } from "@/lib/practice/walk-in-last";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notfall")({
  validateSearch: (search: Record<string, unknown>): { e?: string } => ({
    ...(typeof search.e === "string" ? { e: search.e.slice(0, 80) } : {}),
  }),
  component: NotfallPage,
});

const appRoute = getRouteApi("/app");

function NotfallPage() {
  const data = appRoute.useLoaderData();
  const { e: emergencyId } = Route.useSearch();
  const router = useRouter();
  const listed = useMemo(() => (data.ok ? data.emergencies : []), [data]);
  const total = data.ok ? Number(data.counts.emergencies) || listed.length : 0;
  const nightName = data.ok ? data.contact.nachtdienstName : "Nachtdienst";
  const nightPhone = data.ok ? data.contact.nachtdienstPhone : "";
  const nightNote = data.ok ? data.contact.nachtdienstNote : "";
  const practiceName = data.ok ? data.contact.practiceName : "Ordination";
  const anzeige = Boolean(data.ok && data.anzeige);
  const nightBody = nachtdienstDraft({ practiceName });
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DeskEmergency[] | null>(null);
  const [extra, setExtra] = useState<DeskEmergency | null>(null);
  const [busy, setBusy] = useState(false);
  const [auditById, setAuditById] = useState<Record<string, EmergencyAuditEvent[]>>({});
  const [openAudit, setOpenAudit] = useState<string | null>(null);
  const searching = Boolean(emergencySearchNeedle(q));
  const emergencies = useMemo(
    () => hits ?? (extra && !listed.some((row) => row.id === extra.id) ? [extra, ...listed] : listed),
    [extra, hits, listed],
  );

  function runSearch(value: string) {
    const needle = emergencySearchNeedle(value);
    if (!needle) {
      setHits(null);
      return;
    }
    setBusy(true);
    void searchEmergencies({ data: { q: value } })
      .then((res) => {
        if (!res.ok) {
          toast.error("Suche nicht möglich.");
          return;
        }
        setHits(res.emergencies);
      })
      .catch(() => toast.error("Suche nicht möglich."))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    const needle = emergencySearchNeedle(q);
    if (!needle) {
      setHits(null);
      return;
    }
    const t = window.setTimeout(() => runSearch(q), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!emergencyId || listed.some((row) => row.id === emergencyId) || extra?.id === emergencyId) return;
    void loadEmergencyById({ data: { id: emergencyId } })
      .then((res) => {
        if (res.ok && res.emergency) setExtra(res.emergency);
      })
      .catch(() => undefined);
  }, [emergencyId, listed, extra?.id]);

  function setStatus(id: string, status: "übernommen" | "abgeschlossen") {
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    void updateEmergencyStatus({ data: { id, status } })
      .then((res) => {
        if (!res.ok) {
          toast.error("error" in res && res.error ? res.error : "Status nicht gespeichert.");
          return;
        }
        toast.success(status === "übernommen" ? "Nachtdienst hat übernommen." : "Fall abgeschlossen.");
        void router.invalidate();
      })
      .catch(() => toast.error("Status nicht gespeichert."));
  }

  function toggleAudit(id: string) {
    if (openAudit === id) {
      setOpenAudit(null);
      return;
    }
    setOpenAudit(id);
    if (auditById[id]) return;
    void loadEmergencyAudit({ data: { id } })
      .then((res) => setAuditById((prev) => ({ ...prev, [id]: res.events })))
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!emergencyId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`notfall-${emergencyId}`)?.scrollIntoView({ block: "center" });
    });
  }, [emergencyId, emergencies]);

  const helper = busy || (searching && hits === null)
    ? "Sucht…"
    : searching
      ? emergencies.length
        ? `${emergencies.length} Treffer · ${total} Notfälle`
        : `Kein Notfall zu „${q.trim()}“.`
      : total > listed.length
        ? `${listed.length} zuletzt von ${total} – Suche findet den Rest.`
        : total
          ? `${total} Notfälle`
          : "Noch kein Notfall.";

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Notfall</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {emergencyDeskLead()} {nachtdienstReachCopy(nightPhone, anzeige)}
      </p>
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Hinterlegter Nachtdienst</p>
        <p className="mt-1 font-display text-xl">{nightName}</p>
        {nightPhone ? <p className="tabular-nums">{nightPhone}</p> : (
          <p className="text-sm text-muted-foreground">Keine Nummer in den Einstellungen.</p>
        )}
        {nightNote ? <p className="mt-2 text-sm text-muted-foreground">{nightNote}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <NachtdienstReach phone={nightPhone} body={nightBody} idPrefix="notfall-nacht" />
        </div>
      </div>

      <form
        className="mt-6 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const field = e.currentTarget.elements.namedItem("notfall-q");
          const value = field instanceof HTMLInputElement ? field.value : q;
          setQ(value);
          runSearch(value);
        }}
      >
        <Label htmlFor="notfall-q">Notfälle durchsuchen</Label>
        <Input
          id="notfall-q"
          name="notfall-q"
          className="mt-1.5"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          placeholder={DESK_SEARCH_PLACEHOLDER}
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
      </form>

      {emergencies.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {searching ? "Tier, Halterin oder Anliegen anders schreiben." : "Kein Notfall in der Leitung."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
          {emergencies.map((e) => (
            <li
              key={e.id}
              id={`notfall-${e.id}`}
              className={cn("px-4 py-4", emergencyId === e.id && "bg-flag/8 ring-1 ring-inset ring-flag/30")}
            >
              <p className="text-xs font-medium tracking-wider text-flag uppercase">
                {emergencyStatusLabel(e.status)} · {format(new Date(e.at), "d.M. HH:mm", { locale: deAT })}
              </p>
              <p className="mt-1 font-medium">
                {e.pet} · {displayOwner(e.owner_name)}
              </p>
              <p className="text-sm text-muted-foreground">{e.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">Weiter an {e.routed_to}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {notfallWriteVisible(anzeige) && e.status !== "abgeschlossen" ? (
                  <>
                    {e.status !== "übernommen" ? (
                      <Button
                        id={`notfall-uebernommen-${e.id}`}
                        type="button"
                        size="sm"
                        disabled={anzeigeControl(anzeige).disabled}
                        title={anzeigeControl(anzeige).title}
                        onClick={() => setStatus(e.id, "übernommen")}
                      >
                        Übernommen
                      </Button>
                    ) : null}
                    <Button
                      id={`notfall-abschliessen-${e.id}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={anzeigeControl(anzeige).disabled}
                      title={anzeigeControl(anzeige).title}
                      onClick={() => setStatus(e.id, "abgeschlossen")}
                    >
                      Abschließen
                    </Button>
                  </>
                ) : null}
                <HalterinReach
                  openId={`notfall-reach-${e.id}`}
                  ownerPhone={e.owner_phone}
                  ownerEmail={emailForPet(data.ok ? data.patients : [], e.pet) || e.owner_email}
                  mailSubject={ownerReachMailSubject(e.pet, practiceName, e.owner_name)}
                  body={ownerReachBody({
                    pet: e.pet,
                    caller: e.owner_name,
                    practiceName,
                    kind: "notfall",
                  })}
                />
                <Button
                  id={`notfall-nachweis-${e.id}`}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleAudit(e.id)}
                >
                  Nachweis{auditById[e.id]?.length ? ` (${auditById[e.id].length})` : ""}
                </Button>
              </div>
              {openAudit === e.id ? (
                <ol className="mt-3 space-y-1 border-l border-border pl-3 text-xs">
                  {auditById[e.id] === undefined ? (
                    <li className="text-muted-foreground">Lädt…</li>
                  ) : auditById[e.id].length === 0 ? (
                    <li className="text-muted-foreground">Kein Nachweis.</li>
                  ) : (
                    auditById[e.id].map((ev) => (
                      <li key={ev.id} className="text-muted-foreground">
                        <span className="tabular-nums">
                          {format(new Date(ev.at), "d.M. HH:mm", { locale: deAT })}
                        </span>
                        {" · "}
                        {ev.actor === "silvia" ? "Silvia" : ev.actor}
                        {" · "}
                        {emergencyStatusLabel(ev.status)}
                        {ev.note ? ` — ${ev.note}` : ""}
                      </li>
                    ))
                  )}
                </ol>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
