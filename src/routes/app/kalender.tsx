import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { addDays, format, startOfDay } from "date-fns";
import { deAT } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { AkteHandyLink } from "@/components/desk/akte-handy-link";
import { HalterinReach } from "@/components/desk/halterin-reach";
import { SlotStatusDrafts } from "@/components/desk/slot-status-drafts";
import { RescheduleForm } from "@/components/desk/reschedule-form";
import { WalkInForm } from "@/components/desk/walk-in-form";
import { anzeigeControl, heuteZuFormVisible, HEUTE_ZU_ANZEIGE, KALENDER_LEAD_ID, KALENDER_ZU_ANZEIGE_ID, kalenderLead, slotWriteVisible } from "@/lib/practice/tafel-anzeige";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayOwner } from "@/lib/alma/actions";
import {
  dayIso,
  extraClosedOn,
  formatHourDayAt,
  kalenderCanExtraClose,
  kalenderChipClosedLabel,
  kalenderClosedEmptyCopy,
  kalenderClosedOpenId,
  kalenderClosedSaveId,
  formatSlot,
} from "@/lib/alma/hours";
import { DESK_SCROLL_MT } from "@/lib/practice/desk-chrome";
import { savePracticeClosedDay, savePracticeOpenDay } from "@/lib/practice/profile";
import { halterinDraftHref, halterinMailHref, halterinSmsHref } from "@/lib/alma/phone";
import { ownerCancelText, ownerConfirmText } from "@/lib/alma/protocol";
import {
  appointmentMatchesNeedle,
  appointmentSearchNeedle,
  appointmentsOnDay,
  calendarChipId,
  calendarDayKey,
  calendarSlotId,
  dateFromDayKey,
  gelegtCountOnDay,
  kalenderChipOpenLabel,
  kalenderDaySearch,
  kalenderSearch,
} from "@/lib/practice/appointment-query";
import { BOARD_CHIP_DAYS } from "@/lib/practice/board-window";
import { updateAppointmentStatus } from "@/lib/practice/desk-actions";
import { cancelDraftToast, confirmDraftToast, ownerReachMailSubject, ownerSlotMailSubject } from "@/lib/practice/walk-in-last";
import { DESK_SEARCH_PLACEHOLDER } from "@/lib/practice/desk-status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/kalender")({
  validateSearch: (search: Record<string, unknown>): { a?: string; d?: string; q?: string } =>
    kalenderSearch(search),
  component: KalenderPage,
});

const appRoute = getRouteApi("/app");

function statusBadge(status: string) {
  if (status === "bestätigt") return <Badge variant="ok">Bestätigt</Badge>;
  if (status === "abgesagt") return <Badge variant="danger">Abgesagt</Badge>;
  return <Badge>Gelegt</Badge>;
}

function KalenderPage() {
  const data = appRoute.useLoaderData();
  const anzeige = Boolean(data.ok && data.anzeige);
  const router = useRouter();
  const { a: appointmentId, d: dayParam, q: queryParam } = Route.useSearch();
  const appointments = useMemo(() => (data.ok ? data.appointments : []), [data]);
  const patients = data.ok ? data.patients : [];
  const practiceName = data.ok ? data.contact.practiceName : "Ordination";
  const hours = data.ok ? data.contact.hours : [];
  const [day, setDay] = useState(() =>
    startOfDay(dayParam ? dateFromDayKey(dayParam) : new Date()),
  );
  const [query, setQuery] = useState(() => queryParam ?? "");
  const [highlight, setHighlight] = useState(appointmentId ?? "");
  const [zuBusy, setZuBusy] = useState(false);
  const days = useMemo(
    () => Array.from({ length: BOARD_CHIP_DAYS }, (_, i) => addDays(startOfDay(new Date()), i)),
    [],
  );
  const selectedDay = calendarDayKey(day);
  const todayIso = dayIso(new Date());
  const extraClosed = extraClosedOn(hours, day);
  const extraClosedIso = extraClosed ? dayIso(day) : "";
  const canExtraClose = kalenderCanExtraClose(hours, day, todayIso);
  const selectedIso = dayIso(day);
  const ofDay = appointmentsOnDay(appointments, day);
  const needle = appointmentSearchNeedle(query);
  const searchHits = needle
    ? appointments
        .filter((a) => appointmentMatchesNeedle(needle, a))
        .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))
    : [];

  function pickDay(next: Date, extra?: { a?: string }) {
    const start = startOfDay(next);
    const nextSearch = kalenderDaySearch(start, extra?.a, queryParam);
    setDay(start);
    if (
      dayParam === nextSearch.d &&
      (appointmentId ?? undefined) === (nextSearch.a ?? undefined) &&
      (queryParam ?? undefined) === (nextSearch.q ?? undefined)
    ) {
      return;
    }
    void router.navigate({
      to: "/app/kalender",
      search: nextSearch,
      replace: true,
    });
  }

  useEffect(() => {
    if (!dayParam) return;
    if (dayParam === selectedDay) return;
    setDay(startOfDay(dateFromDayKey(dayParam)));
  }, [dayParam, selectedDay]);

  useEffect(() => {
    setQuery(queryParam ?? "");
  }, [queryParam]);

  function writeQuery(next: string) {
    setQuery(next);
    const nextSearch = kalenderSearch({
      a: appointmentId,
      d: dayParam ?? selectedDay,
      q: next,
    });
    if ((queryParam ?? undefined) === (nextSearch.q ?? undefined)) return;
    void router.navigate({
      to: "/app/kalender",
      search: nextSearch,
      replace: true,
    });
  }

  useEffect(() => {
    if (!appointmentId) return;
    const hit = appointments.find((row) => row.id === appointmentId);
    if (!hit) return;
    const next = startOfDay(new Date(hit.start_at));
    const d = calendarDayKey(next);
    setHighlight(hit.id);
    setDay((prev) => (calendarDayKey(prev) === d ? prev : next));
    if (dayParam === d) return;
    void router.navigate({
      to: "/app/kalender",
      search: kalenderDaySearch(next, appointmentId, queryParam),
      replace: true,
    });
  }, [appointmentId, appointments, dayParam, queryParam, router]);

  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(calendarSlotId(highlight));
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, selectedDay]);

  function jumpToAppointment(a: (typeof appointments)[number]) {
    const next = startOfDay(new Date(a.start_at));
    setHighlight(a.id);
    pickDay(next, { a: a.id });
    toast.success(`Kalender springt auf ${a.pet}.`);
  }

  function setStatus(
    id: string,
    status: "bestätigt" | "abgesagt" | "gelegt",
    channel: "whatsapp" | "sms" | "mail" | "" = "",
  ) {
    void updateAppointmentStatus({ data: { id, status } })
      .then((res) => {
        if (!res.ok) {
          toast.error("error" in res && res.error ? res.error : "Termin nicht geändert.");
          return;
        }
        if (status === "abgesagt") {
          toast.success(cancelDraftToast(channel));
        } else if (status === "bestätigt") {
          toast.success(confirmDraftToast(channel));
        } else {
          const moved =
            "moved" in res && res.moved && "start" in res && res.start
              ? formatSlot(new Date(res.start))
              : "";
          if (moved && "start" in res && res.start) {
            const next = new Date(res.start);
            if (!Number.isNaN(+next)) pickDay(next, { a: id });
          }
          toast.success(moved ? `Wieder gelegt: ${moved}.` : "Wieder gelegt.");
        }
        void router.invalidate();
      })
      .catch(() => toast.error("Termin nicht geändert."));
  }

  function slotLabel(a: (typeof appointments)[number]) {
    return format(new Date(a.start_at), "EEEE, d.M. 'um' HH:mm", { locale: deAT });
  }

  function confirmText(a: (typeof appointments)[number]) {
    return ownerConfirmText({
      action: { pet: a.pet, owner: a.owner_name },
      slot: slotLabel(a),
      practiceName,
    });
  }

  function cancelText(a: (typeof appointments)[number]) {
    return ownerCancelText({
      action: { pet: a.pet, owner: a.owner_name },
      slot: slotLabel(a),
      practiceName,
    });
  }

  function copySms(a: (typeof appointments)[number]) {
    void navigator.clipboard.writeText(confirmText(a)).then(
      () => toast.success("Text kopiert. Ohne Gateway sendet Silvia nicht selbst."),
      () => toast.error("Kopieren nicht möglich."),
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Kalender</h1>
      <p id={KALENDER_LEAD_ID} className="mt-1 text-sm text-muted-foreground">
        {kalenderLead(anzeige)}
      </p>
      <form
        className="mt-6 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const field = e.currentTarget.elements.namedItem("kalender-q");
          const value = field instanceof HTMLInputElement ? field.value : query;
          writeQuery(value);
        }}
      >
        <Label htmlFor="kalender-q">Kalender durchsuchen</Label>
        <Input
          id="kalender-q"
          name="kalender-q"
          className="mt-1.5"
          type="search"
          value={query}
          onChange={(e) => writeQuery(e.target.value)}
          onInput={(e) => writeQuery((e.target as HTMLInputElement).value)}
          placeholder={DESK_SEARCH_PLACEHOLDER}
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {needle
            ? searchHits.length
              ? `${searchHits.length} Treffer im geladenen Zeitraum — tippen, um den Tag zu öffnen.`
              : `Kein Termin zu „${query.trim()}“ (gestern bis zwei Wochen).`
            : "Suche findet Name, Anliegen, Handy und E-Mail in den geladenen Slots, nicht die ältesten der Akte."}
        </p>
      </form>
      {searchHits.length ? (
        <ul className="mt-3 max-w-xl space-y-2">
          {searchHits.map((a) => (
            <li key={`hit-${a.id}`}>
              <button
                type="button"
                id={`kalender-treffer-${a.id}`}
                onClick={() => jumpToAppointment(a)}
                className={cn(
                  "w-full rounded-xl border bg-card px-4 py-3 text-left hover:bg-secondary/50",
                  highlight === a.id ? "border-primary/40 ring-1 ring-inset ring-primary/30" : "border-border",
                )}
              >
                <p className="font-medium">
                  {a.pet} · {format(new Date(a.start_at), "EEE d.M. · HH:mm", { locale: deAT })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {a.kind} · {displayOwner(a.owner_name)}
                  {a.owner_phone ? ` · ${a.owner_phone}` : ""}
                  {a.owner_email ? ` · ${a.owner_email}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const key = calendarDayKey(d);
          const active = key === selectedDay;
          const thisMonth = d.getMonth() === new Date().getMonth();
          const chipHits = needle
            ? appointments.filter(
                (a) => calendarDayKey(new Date(a.start_at)) === key && appointmentMatchesNeedle(needle, a),
              ).length
            : 0;
          const closedMark = needle ? "" : kalenderChipClosedLabel(hours, d);
          const openCount = needle ? 0 : gelegtCountOnDay(appointments, d);
          const chipMark = needle ? chipHits : closedMark || (openCount ? String(openCount) : "");
          const chipHint = needle
            ? chipHits
              ? `, ${chipHits} Treffer`
              : ""
            : closedMark
              ? `, ${closedMark === "Feiertag" ? "Feiertag, Ordination zu" : "geschlossen"}`
              : openCount
                ? `, ${kalenderChipOpenLabel(openCount)}`
                : "";
          return (
          <button
            key={key}
            id={calendarChipId(d)}
            type="button"
            aria-label={`${format(d, "EEEE, d. MMMM", { locale: deAT })}${chipHint}`}
            aria-pressed={active}
            onClick={() => pickDay(d)}
            className={cn(
              "flex min-h-16 min-w-16 flex-col items-center justify-center rounded-lg border px-3",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            <span className="text-[10px] uppercase">{format(d, "EE", { locale: deAT })}</span>
            <span className="font-display text-lg tabular-nums">{format(d, thisMonth ? "d" : "d.M.")}</span>
            {chipMark ? (
              <span
                className={cn(
                  "text-[10px] font-semibold tabular-nums",
                  active ? "text-primary-foreground/80" : closedMark ? "text-muted-foreground" : "text-primary",
                )}
              >
                {chipMark}
              </span>
            ) : null}
          </button>
          );
        })}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid gap-4">
        {extraClosed ? (
          <div
            id="kalender-zu"
            className={cn(DESK_SCROLL_MT, "rounded-xl border border-flag/40 bg-card p-4")}
          >
            <p
              id={ofDay.length === 0 ? "kalender-leer" : undefined}
              className="text-sm text-muted-foreground"
            >
              {formatHourDayAt(extraClosedIso)} geschlossen hinterlegt.
            </p>
            {heuteZuFormVisible(anzeige) ? (
            <Button
              type="button"
              id={kalenderClosedOpenId(extraClosedIso)}
              size="sm"
              variant="outline"
              disabled={zuBusy}
              data-day={extraClosedIso}
              className={cn("mt-3", DESK_SCROLL_MT)}
              onClick={(e) => {
                const iso = e.currentTarget.getAttribute("data-day") ?? extraClosedIso;
                setZuBusy(true);
                void savePracticeOpenDay({ data: { day: iso } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success(`${formatHourDayAt(iso)} wieder geöffnet.`);
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Tag nicht geöffnet."))
                  .finally(() => setZuBusy(false));
              }}
            >
              {zuBusy ? "Speichert…" : "Wieder öffnen"}
            </Button>
            ) : (
              <p id={KALENDER_ZU_ANZEIGE_ID} className="mt-3 text-sm text-foreground">
                {HEUTE_ZU_ANZEIGE}
              </p>
            )}
          </div>
        ) : canExtraClose && heuteZuFormVisible(anzeige) ? (
          <div
            id="kalender-zu"
            className={cn(DESK_SCROLL_MT, "rounded-xl border border-flag/40 bg-card p-4")}
          >
            <p className="font-medium">Extra geschlossen hinterlegen.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Fortbildung oder Betriebsurlaub — nur dieses Datum, nicht den Wochentag. Nächste Woche gilt
              wieder die Zeile in den Einstellungen.
            </p>
            <p id="kalender-zu-tag-anzeige" className="mt-3 text-sm">
              {formatHourDayAt(selectedIso)}
            </p>
            <Button
              type="button"
              id={kalenderClosedSaveId()}
              size="sm"
              disabled={zuBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              data-day={selectedIso}
              className={cn("mt-3", DESK_SCROLL_MT)}
              onClick={(e) => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const iso = e.currentTarget.getAttribute("data-day") ?? selectedIso;
                setZuBusy(true);
                void savePracticeClosedDay({ data: { day: iso } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success(
                      iso === todayIso
                        ? "Heute geschlossen hinterlegt."
                        : `${formatHourDayAt(iso)} geschlossen hinterlegt.`,
                    );
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Tag nicht gespeichert."))
                  .finally(() => setZuBusy(false));
              }}
            >
              {zuBusy ? "Speichert…" : "Tag hinterlegen"}
            </Button>
          </div>
        ) : null}
        {ofDay.length === 0 && !extraClosed ? (
          <p id="kalender-leer" className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            {kalenderClosedEmptyCopy(hours, day, anzeige)}
          </p>
        ) : null}
        {ofDay.length === 0 ? null : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {ofDay.map((a) => {
              const confirmWa = a.status === "bestätigt" ? "" : halterinDraftHref(a.owner_phone, confirmText(a));
              const confirmSms = a.status === "bestätigt" ? "" : halterinSmsHref(a.owner_phone, confirmText(a));
              const confirmMail =
                a.status === "bestätigt"
                  ? ""
                  : halterinMailHref(
                      ownerSlotMailSubject("termin", a.pet, practiceName, a.owner_name),
                      confirmText(a),
                      a.owner_email,
                    );
              const cancelWa = halterinDraftHref(a.owner_phone, cancelText(a));
              const cancelSms = halterinSmsHref(a.owner_phone, cancelText(a));
              const cancelMail = halterinMailHref(
                ownerSlotMailSubject("absage", a.pet, practiceName, a.owner_name),
                cancelText(a),
                a.owner_email,
              );
              return (
              <li
                key={a.id}
                id={calendarSlotId(a.id)}
                className={cn(
                  "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
                  highlight === a.id ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : "",
                )}
              >
                <div>
                  <p className="text-xs font-medium tracking-wider text-primary uppercase">
                    {format(new Date(a.start_at), "HH:mm", { locale: deAT })} · {a.minutes} Min.
                  </p>
                  <p className="mt-1 font-medium">
                    {a.pet} · {a.kind}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {displayOwner(a.owner_name)} · {a.vet}
                    {a.channel === "kassa" ? " · Tafel" : ""}
                    {a.owner_phone ? ` · ${a.owner_phone}` : ""}
                    {a.owner_email ? ` · ${a.owner_email}` : ""}
                  </p>
                  <div className="mt-2">{statusBadge(a.status)}</div>
                  {a.status !== "abgesagt" ? (
                    <div className="mt-3">
                      <RescheduleForm
                        id={a.id}
                        startAt={a.start_at}
                        pet={a.pet}
                        owner={a.owner_name}
                        phone={a.owner_phone}
                        email={a.owner_email}
                        practiceName={practiceName}
                        hours={hours}
                        appointments={appointments}
                        onMoved={(next) => pickDay(next, { a: a.id })}
                        anzeige={anzeige}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {a.status !== "abgesagt" ? (
                    <>
                      <SlotStatusDrafts
                        openId={`kalender-channels-${a.id}`}
                        status={a.status}
                        anzeige={anzeige}
                        confirmWa={confirmWa}
                        confirmSms={confirmSms}
                        confirmMail={confirmMail}
                        cancelWa={cancelWa}
                        cancelSms={cancelSms}
                        cancelMail={cancelMail}
                        onConfirm={(channel) => setStatus(a.id, "bestätigt", channel)}
                        onCancel={(channel) => setStatus(a.id, "abgesagt", channel)}
                      />
                    </>
                  ) : slotWriteVisible(anzeige) ? (
                    <Button
                      id={`kalender-einsetzen-${a.id}`}
                      size="sm"
                      variant="ghost"
                      disabled={anzeigeControl(anzeige).disabled}
                      title={anzeigeControl(anzeige).title}
                      onClick={() => {
                        if (anzeige) {
                          toast.error(anzeigeControl(true).title);
                          return;
                        }
                        setStatus(a.id, "gelegt");
                      }}
                    >
                      Wieder einsetzen
                    </Button>
                  ) : null}
                  {a.status !== "abgesagt" ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => copySms(a)}>
                        Text kopieren
                      </Button>
                      <HalterinReach
                        collapsed
                        openId={`kalender-reach-${a.id}`}
                        ownerPhone={a.owner_phone}
                        ownerEmail={a.owner_email}
                        mailSubject={ownerReachMailSubject(a.pet, practiceName, a.owner_name)}
                        body={confirmText(a)}
                      />
                      <AkteHandyLink
                        pet={a.pet}
                        patients={patients}
                        owner={a.owner_name}
                        ownerPhone={a.owner_phone}
                        ownerEmail={a.owner_email}
                        anzeige={anzeige}
                      />
                    </>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
        </div>
        <WalkInForm
          day={day}
          onDayChange={pickDay}
          idPrefix="kalender-"
          showDate
          patients={patients}
          appointments={appointments}
          practiceName={practiceName}
          hours={hours}
          anzeige={anzeige}
        />
      </div>
    </div>
  );
}
