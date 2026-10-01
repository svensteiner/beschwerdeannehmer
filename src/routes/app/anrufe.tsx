import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChannelBadge, StatusBadge } from "@/components/demo/status-badge";
import { AkteHandyLink } from "@/components/desk/akte-handy-link";
import { HalterinReach } from "@/components/desk/halterin-reach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayOwner } from "@/lib/alma/actions";
import { loadCallById, searchCalls, updateCallStatus } from "@/lib/practice/desk-actions";
import { anzeigeControl, callErledigtVisible } from "@/lib/practice/tafel-anzeige";
import { callSearchNeedle } from "@/lib/practice/call-query";
import type { DeskCall } from "@/lib/practice/call-rows";
import { emailForPet, ownerReachBody, ownerReachMailSubject } from "@/lib/practice/walk-in-last";
import { DESK_SEARCH_PLACEHOLDER } from "@/lib/practice/desk-status";
import type { CallStatus, Channel } from "@/lib/alma/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/anrufe")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search.c === "string" ? search.c.slice(0, 80) : undefined,
  }),
  component: AnrufePage,
});

const appRoute = getRouteApi("/app");

function asCallStatus(value: string): CallStatus {
  if (value === "notfall" || value === "erledigt" || value === "weitergeleitet") return value;
  return "offen";
}

function asChannel(value: string): Channel {
  if (value === "whatsapp" || value === "web") return value;
  return "telefon";
}

function AnrufePage() {
  const data = appRoute.useLoaderData();
  const { c: callId } = Route.useSearch();
  const router = useRouter();
  const listed = useMemo(() => (data.ok ? data.calls : []), [data]);
  const total = data.ok ? Number(data.counts.calls) || listed.length : 0;
  const practiceName = data.ok ? data.contact.practiceName : "Ordination";
  const anzeige = Boolean(data.ok && data.anzeige);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DeskCall[] | null>(null);
  const [extra, setExtra] = useState<DeskCall | null>(null);
  const [busy, setBusy] = useState(false);
  const searching = Boolean(callSearchNeedle(q));
  const calls =
    hits ??
    (extra && !listed.some((c) => c.id === extra.id) ? [extra, ...listed] : listed);
  const [id, setId] = useState(callId ?? calls[0]?.id);
  useEffect(() => {
    if (callId) setId(callId);
  }, [callId]);
  useEffect(() => {
    if (hits?.[0]?.id) setId(hits[0].id);
  }, [hits]);

  function runSearch(value: string) {
    const needle = callSearchNeedle(value);
    if (!needle) {
      setHits(null);
      return;
    }
    setBusy(true);
    void searchCalls({ data: { q: value } })
      .then((res) => {
        if (!res.ok) {
          toast.error("Suche nicht möglich.");
          return;
        }
        setHits(res.calls);
      })
      .catch(() => toast.error("Suche nicht möglich."))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    const needle = callSearchNeedle(q);
    if (!needle) {
      setHits(null);
      return;
    }
    const t = window.setTimeout(() => runSearch(q), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!callId || listed.some((c) => c.id === callId) || extra?.id === callId) return;
    void loadCallById({ data: { id: callId } })
      .then((res) => {
        if (res.ok && res.call) setExtra(res.call);
      })
      .catch(() => undefined);
  }, [callId, listed, extra?.id]);

  const selected = calls.find((c) => c.id === id) ?? calls.find((c) => c.id === callId) ?? calls[0];
  const selectedMail = selected
    ? emailForPet(data.ok ? data.patients : [], selected.pet) || selected.owner_email
    : "";

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[20rem_1fr]">
      <aside className="border-b border-border lg:border-r lg:border-b-0">
        <div className="p-4">
          <h1 className="font-display text-2xl font-semibold">Anrufe</h1>
          <p className="text-sm text-muted-foreground">Was Silvia angenommen und protokolliert hat.</p>
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const field = e.currentTarget.elements.namedItem("anrufe-q");
              const value = field instanceof HTMLInputElement ? field.value : q;
              setQ(value);
              runSearch(value);
            }}
          >
            <Label htmlFor="anrufe-q">Leitung durchsuchen</Label>
            <Input
              id="anrufe-q"
              name="anrufe-q"
              className="mt-1.5"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
              placeholder={DESK_SEARCH_PLACEHOLDER}
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {busy || (searching && hits === null)
                ? "Sucht…"
                : searching
                  ? calls.length
                    ? `${calls.length} Treffer · ${total} Gespräche`
                    : `Kein Gespräch zu „${q.trim()}“.`
                  : total > listed.length
                    ? `${listed.length} zuletzt von ${total} – Suche findet den Rest.`
                    : total
                      ? `${total} Gespräche`
                      : "Noch keine Gespräche."}
            </p>
          </form>
        </div>
        {calls.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {searching
              ? "Halterin, Tier, Anliegen oder Handy anders schreiben."
              : "Noch keine Gespräche."}
          </p>
        ) : (
          <ul>
            {calls.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setId(c.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 border-t border-border px-4 py-3 text-left",
                    selected?.id === c.id ? "bg-secondary" : "hover:bg-secondary/50",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-medium">{displayOwner(c.caller)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {format(new Date(c.at), "HH:mm", { locale: deAT })}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {c.pet} · {c.concern}
                  </span>
                  {/rückruf/i.test(c.action) ? (
                    <span className="text-[10px] font-medium tracking-wider text-primary uppercase">Rückruf</span>
                  ) : /an die (kassa|tierarzthelferin)/i.test(c.action) ? (
                    <span className="text-[10px] font-medium tracking-wider text-primary uppercase">Übergabe</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {selected ? (
        <article className="min-w-0 p-4 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={asCallStatus(selected.status)} />
            <ChannelBadge channel={asChannel(selected.channel)} />
            <span className="text-sm text-muted-foreground tabular-nums">
              {format(new Date(selected.at), "d. MMM, HH:mm", { locale: deAT })}
              {selected.durationSec ? ` · ${selected.durationSec}s` : ""}
            </span>
            {selected.consentAnnouncedAt ? (
              <span className="text-sm text-muted-foreground">
                · Einwilligung angesagt {format(new Date(selected.consentAnnouncedAt), "HH:mm", { locale: deAT })}
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 font-display text-3xl font-semibold">{displayOwner(selected.caller)}</h2>
          <p className="text-muted-foreground">
            {selected.pet} · {selected.species}
            {selected.owner_phone ? ` · ${selected.owner_phone}` : ""}
            {selectedMail ? ` · ${selectedMail}` : ""}
          </p>
          <p className="mt-4 rounded-lg bg-secondary px-4 py-3 text-sm">
            <span className="font-medium">Aktion: </span>
            {selected.action}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
          {callErledigtVisible(anzeige) && selected.status !== "erledigt" ? (
            <Button
              type="button"
              id={`anrufe-erledigt-${selected.id}`}
              variant="outline"
              disabled={anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                void updateCallStatus({ data: { id: selected.id, status: "erledigt" } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error("error" in res && res.error ? res.error : "Status nicht gespeichert.");
                      return;
                    }
                    toast.success("Als erledigt markiert.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Status nicht gespeichert."));
              }}
            >
              Als erledigt markieren
            </Button>
          ) : null}
          <HalterinReach
            openId={`anrufe-reach-${selected.id}`}
            ownerPhone={selected.owner_phone}
            ownerEmail={selectedMail}
            mailSubject={ownerReachMailSubject(selected.pet, practiceName, selected.caller)}
            body={ownerReachBody({
              pet: selected.pet,
              caller: selected.caller,
              practiceName,
              kind: "anrufe",
            })}
            size="default"
          />
          <AkteHandyLink
            pet={selected.pet}
            patients={data.ok ? data.patients : []}
            size="default"
            owner={selected.caller}
            ownerPhone={selected.owner_phone}
            ownerEmail={selectedMail}
            anzeige={anzeige}
          />
          </div>
          {selected.summary ? (
            <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <p className="mb-1 text-xs font-medium tracking-wider uppercase opacity-70">Zusammenfassung</p>
              <p className="whitespace-pre-line">{selected.summary}</p>
            </div>
          ) : null}
          <div className="mt-6 flex w-full flex-col gap-3">
            {selected.transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground">Kein Transkript hinterlegt.</p>
            ) : (
              selected.transcript.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[32rem] rounded-lg px-4 py-3 text-sm",
                    line.from === "alma"
                      ? "self-start bg-primary text-primary-foreground"
                      : "self-end border border-border bg-card",
                  )}
                >
                  <p className="mb-1 text-xs font-medium tracking-wider uppercase opacity-70">
                    {line.from === "alma" ? "Silvia" : displayOwner(selected.caller)}
                  </p>
                  {line.text}
                </div>
              ))
            )}
          </div>
        </article>
      ) : null}
    </div>
  );
}
