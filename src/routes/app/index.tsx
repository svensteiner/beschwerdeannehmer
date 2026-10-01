import { createFileRoute, getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { format, startOfDay } from "date-fns";
import { deAT } from "date-fns/locale";
import { ArrowRight, PhoneCall } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AkteHandyLink } from "@/components/desk/akte-handy-link";
import { DeskDraftButton } from "@/components/desk/desk-draft-button";
import { HalterinReach } from "@/components/desk/halterin-reach";
import { NachtdienstReach } from "@/components/desk/nachtdienst-reach";
import { RescheduleForm } from "@/components/desk/reschedule-form";
import { SlotStatusDrafts } from "@/components/desk/slot-status-drafts";
import { VquadratSpiegelCard } from "@/components/desk/vquadrat-spiegel";
import { WalkInForm } from "@/components/desk/walk-in-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayOwner } from "@/lib/alma/actions";
import { anreiseIncomplete, ortIncomplete, ownerIncomplete, parkplatzIncomplete, parsePracticeAnreise, parsePracticeLocationHint, parsePracticeOrt, parsePracticeOwnerName } from "@/lib/alma/desk";
import { BUNDESLAENDER } from "@/lib/alma/data";
import { deskStatusAt, dayIso, extraClosedOpenId, extraClosedRoom, extraClosedUpcoming, formatHourDayAt, formatSlot, hoursLabelForDay, hoursMatchTemplate, nextExtraClosedSeed, nextFreeSlotAt, occupiedFromAppointments, parseHourWindows } from "@/lib/alma/hours";
import { halterinDraftHref, halterinMailHref, halterinSmsHref, internInboxMissing, internWhatsappMissing, parsePracticeInbox, parsePracticeNachtdienst, parsePracticePhone, parsePracticeWhatsapp, telHref, threadDraftDest } from "@/lib/alma/phone";
import { emergencyDeskLead, nachtdienstDraft, nachtdienstReachCopy, ownerCancelText, ownerConfirmText, mailtoHref, smsHref, whatsappHref } from "@/lib/alma/protocol";
import { nextUpcomingAppointments, heuteSlotDomId, openConfirmLabel, openConfirmToday } from "@/lib/practice/board-window";
import { DEFAULT_HOURS, applySignupHours, savePracticeAnreise, savePracticeClosedDay, savePracticeInbox, savePracticeLocationHint, savePracticeNachtdienst, savePracticeOpenDay, savePracticeOrt, savePracticeOwnerName, savePracticePhone, savePracticeWhatsapp } from "@/lib/practice/profile";
import {
  calendarDayKey,
  dateFromDayKey,
  kalenderAppointmentSearch,
  kalenderDayFromSearch,
  kalenderDaySearch,
} from "@/lib/practice/appointment-query";
import { markThreadRead } from "@/lib/practice/board";
import { internDeskTitle, internDraftBody, internDraftDomIds, internSettingsTarget, openEmergencies, recentLogCalls, unreadInternCount, unreadInternThreads } from "@/lib/practice/desk-calls";
import { updateAppointmentStatus, updateCallStatus, updateEmergencyStatus } from "@/lib/practice/desk-actions";
import { emergencyStatusLabel } from "@/lib/practice/desk-status";
import {
  cancelDraftToast,
  confirmDraftToast,
  emailForPet,
  ownerReachBody,
  ownerReachMailSubject,
  ownerSlotMailSubject,
} from "@/lib/practice/walk-in-last";
import { applyTafelBackupDownload, saveTafelBackupDownload, newerTafelBackupIso, readLastTafelBackup, tafelBackupReminder, tafelBackupNoticeOf, DESK_BACKUP_CONFIRM, heuteBackupCardVisible, heuteBackupDownloadVisible, heuteBackupKeepCopy, heuteTafelRestoreVisible, writeLastTafelBackup, writeHolenReloadFlag, clearHolenReloadFlag, holenChosenTafel, holenFileInputOn, holenRestoreNext, holenRestoreAbortIsBenign, holenRestoreReady, holenWaitVisible, waitHolenPendingUntilIdle, holenPendingShouldStay, holenStayAfterFail, HOLEN_RESTORE_NEED_BOTH, TAFEL_HOLEN_WATCHDOG_MS, TAFEL_HOLEN_TOAST, TAFEL_HOLEN_WAIT, TAFEL_HOLEN_WAIT_HREF, TAFEL_HOLEN_HEUTE_FAIL_ID, TAFEL_BACKUP_FAIL } from "@/lib/practice/desk-storage";
import { loadHolenFailNotice } from "@/lib/practice/holen-login-fn";
import { backupCipherPassphraseOk } from "@/lib/practice/backup-cipher";
import { rememberPracticeFact } from "@/lib/practice/facts";
import { heuteFactChipId, heuteTrainPrompts, learnedFactsFrom } from "@/lib/alma/train";
import { isInhaberin } from "@/lib/practice/staff-role";
import {
  anzeigeControl,
  deskBackupAnzeigeLine,
  HEUTE_BACKUP_ANZEIGE_ID,
  HEUTE_BACKUP_TITLE_ID,
  heuteBackupTitle,
  HEUTE_LEER_ID,
  HEUTE_LEITUNG_ANZEIGE_ID,
  HEUTE_ZEITEN_WALKIN_ID,
  HEUTE_ZU_ANZEIGE,
  HEUTE_ZU_ANZEIGE_ID,
  heuteEmptyCopy,
  heuteWalkInLinkVisible,
  heuteZuFormVisible,
  heuteZuTitle,
  slotWriteVisible,
  notfallWriteVisible,
  internGelesenVisible,
  callErledigtVisible,
  gelerntWriteVisible,
  heuteNotizTitle,
  HEUTE_NOTIZ_ANZEIGE_ID,
  SETTINGS_GELERNT_ANZEIGE,
  heuteKurzspeichernVisible,
  heuteKurzAnzeigeId,
  HEUTE_KURZ_ANZEIGE,
  HEUTE_WHATSAPP_TITLE_ID,
  heuteWhatsappTitle,
  heuteZeitenVorlageWriteVisible,
  heuteZeitenVorlageTitle,
  heuteZeitenVorlageSettings,
  HEUTE_ZEITEN_VORLAGE_SETTINGS_ID,
  HEUTE_ZEITEN_VORLAGE_ANZEIGE,
  HEUTE_ZEITEN_VORLAGE_ANZEIGE_ID,
  HEUTE_ZEITEN_VORLAGE_TITLE_ID,
  leitungPublicShowsLive,
  sprechenAnzeigeAuthLine,
  sprechenDeskOpenVisible,
} from "@/lib/practice/tafel-anzeige";
import { DESK_SCROLL_MT } from "@/lib/practice/desk-chrome";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/app/")({
  validateSearch: (search: Record<string, unknown>): { d?: string } => {
    const d = kalenderDayFromSearch(search.d);
    return d ? { d } : {};
  },
  component: AppHome,
});

const appRoute = getRouteApi("/app");

function HeuteKurzWrite({
  anzeige,
  card,
  children,
}: {
  anzeige: boolean;
  card: string;
  children: ReactNode;
}) {
  if (heuteKurzspeichernVisible(anzeige)) return children;
  return (
    <p id={heuteKurzAnzeigeId(card)} className="mt-3 text-sm text-foreground">
      {HEUTE_KURZ_ANZEIGE}
    </p>
  );
}

function AppHome() {
  const data = appRoute.useLoaderData();
  const router = useRouter();
  const live = data.ok ? data : null;
  const anzeige = Boolean(live?.anzeige);
  const counts = live?.counts ?? { calls: 0, appointments: 0, emergencies: 0 };
  const callbacks = (live?.calls ?? []).filter(
    (c) => c.status !== "erledigt" && /rückruf/i.test(c.action),
  );
  const waitingDesk = (live?.calls ?? []).filter(
    (c) => c.status !== "erledigt" && /an die (kassa|tierarzthelferin)|tafelkonflikt/i.test(c.action),
  );
  const recent = recentLogCalls(live?.calls ?? []);
  const intern = unreadInternThreads(live?.threads ?? []);
  const openNight = openEmergencies(live?.emergencies ?? []);
  const newestOpen = openNight[0];
  const waitlist = live?.waitlist ?? [];
  const upcoming = nextUpcomingAppointments(live?.appointments ?? []);
  const next = upcoming.items;
  const laterHidden = upcoming.laterHidden;
  const openConfirm = openConfirmToday(live?.appointments ?? []);
  const openConfirmHref = openConfirm.first ? `#${heuteSlotDomId(openConfirm.first.id)}` : "";
  const slug = live?.contact.slug ?? "";
  const [origin, setOrigin] = useState("");
  const [backupNote, setBackupNote] = useState<ReturnType<typeof tafelBackupReminder>>(null);
  const [backupLast, setBackupLast] = useState<string | null>(null);
  const [hoursBusy, setHoursBusy] = useState(false);
  const [zuBusy, setZuBusy] = useState(false);
  const [zuTagLabel, setZuTagLabel] = useState("");
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [nachtBusy, setNachtBusy] = useState(false);
  const [anreiseBusy, setAnreiseBusy] = useState(false);
  const [ortBusy, setOrtBusy] = useState(false);
  const [parkplatzBusy, setParkplatzBusy] = useState(false);
  const [leitungBusy, setLeitungBusy] = useState(false);
  const [inhaberinBusy, setInhaberinBusy] = useState(false);
  const [notizBusy, setNotizBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [holenFileOn, setHolenFileOn] = useState(false);
  const [holenConfirm, setHolenConfirm] = useState("");
  const [holenPass, setHolenPass] = useState("");
  const [backupPass, setBackupPass] = useState("");
  const [holenFail, setHolenFail] = useState("");
  const [backupNotice, setBackupNotice] = useState<{
    text: string;
    id: string;
  } | null>(null);
  const holenFileRef = useRef<HTMLInputElement>(null);
  const holenReady = holenRestoreReady({
    file: holenFileOn || holenFileInputOn(holenFileRef.current),
    confirm: holenConfirm,
  });
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (!live?.tafelBackup) {
      setBackupNote(null);
      setBackupLast(null);
      return;
    }
    const store = typeof localStorage === "undefined" ? null : localStorage;
    const lastIso = newerTafelBackupIso(
      readLastTafelBackup(store, live.session.practiceId),
      live.tafelBackupAt,
    );
    if (lastIso && store) writeLastTafelBackup(store, new Date(lastIso), live.session.practiceId);
    setBackupLast(lastIso);
    setBackupNote(
      tafelBackupReminder({
        kind: "pglite",
        lastIso,
      }),
    );
  }, [live?.tafelBackup, live?.tafelBackupAt, live?.session.practiceId]);
  const { d: walkDayParam } = Route.useSearch();
  const [walkDay, setWalkDay] = useState(() =>
    startOfDay(walkDayParam ? dateFromDayKey(walkDayParam) : new Date()),
  );

  function pickWalkDay(next: Date) {
    const start = startOfDay(next);
    const d = calendarDayKey(start);
    setWalkDay(start);
    if (walkDayParam === d) return;
    void router.navigate({ to: "/app", search: kalenderDaySearch(start), replace: true });
  }

  useEffect(() => {
    if (!walkDayParam) return;
    if (walkDayParam === calendarDayKey(walkDay)) return;
    setWalkDay(startOfDay(dateFromDayKey(walkDayParam)));
  }, [walkDayParam, walkDay]);
  const inbound = slug ? `${origin || ""}/leitung/${slug}` : "";
  const canRestoreTafel = heuteTafelRestoreVisible({
    pglite: Boolean(live?.tafelBackup),
    inhaberin: isInhaberin(live?.session.role),
    anzeige,
  });
  const showBackupCard = heuteBackupCardVisible({
    reminder: Boolean(backupNote),
    pglite: Boolean(live?.tafelBackup),
    inhaberin: isInhaberin(live?.session.role),
  });
  const canDownloadTafel = heuteBackupDownloadVisible({
    pglite: Boolean(live?.tafelBackup),
    anzeige,
    // Punkt 17: die vollstaendige Sicherung darf nur die Inhaberin laden.
    inhaberin: isInhaberin(live?.session.role),
  });
  const backupAnzeigeLine = deskBackupAnzeigeLine(anzeige);
  const backupKeep = heuteBackupKeepCopy({ lastIso: backupLast, inhaberin: canRestoreTafel });
  const unread = unreadInternCount(live?.threads ?? []);
  const hours = live?.contact.hours ?? [];
  const todayIso = dayIso(new Date());
  const extraClosed = extraClosedUpcoming(hours, todayIso);
  const zuRoom = extraClosedRoom(hours, todayIso);
  const zuSeed = nextExtraClosedSeed(hours, todayIso);
  const todayHours = hoursLabelForDay(hours, new Date());
  const windows = parseHourWindows(hours);
  const deskNow = deskStatusAt(windows);
  const nextFree = windows.length
    ? nextFreeSlotAt(windows, occupiedFromAppointments(live?.appointments ?? []), new Date())
    : null;

  return (
    <div className="p-4 sm:p-8">
      <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
        {format(new Date(), "EEEE, d. MMMM yyyy", { locale: deAT })}
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold">Heute in der Ordination</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {live?.session.userName} · Anrufe, Termine und die Akte liegen in Ihrer Ordination.
      </p>
      {hours.length ? (
        <p id="heute-zeiten" className="mt-2 text-sm text-muted-foreground">
          Heute {todayHours}
          {deskNow.code !== "offen" ? ` · ${deskNow.label}` : ""}
          {nextFree ? `. Nächster Slot: ${formatSlot(nextFree)}.` : "."}
          {heuteWalkInLinkVisible(anzeige) ? (
            <>
              {" "}
              <a
                id={HEUTE_ZEITEN_WALKIN_ID}
                href="#heute-walkin"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Walk-in legen
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {live && hoursMatchTemplate(hours, DEFAULT_HOURS) ? (
        <div id="heute-zeiten-vorlage" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p id={HEUTE_ZEITEN_VORLAGE_TITLE_ID} className="font-medium">
            {heuteZeitenVorlageTitle(anzeige)}
          </p>
          {heuteZeitenVorlageWriteVisible(anzeige) ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Mittwoch nur vormittags, Samstag 9–12 – wie in der Demo. Mo–Fr voll ist 8–12 und 14–18, Wochenende zu.
            Feiner geht in den Einstellungen mit den Chips.
          </p>
          ) : null}
          {heuteZeitenVorlageWriteVisible(anzeige) ? null : (
            <p id={HEUTE_ZEITEN_VORLAGE_ANZEIGE_ID} className="mt-3 text-sm text-foreground">
              {HEUTE_ZEITEN_VORLAGE_ANZEIGE}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteZeitenVorlageWriteVisible(anzeige) ? (
              <Button
                type="button"
                id="heute-zeiten-voll"
                size="sm"
                disabled={hoursBusy}
                onClick={() => {
                  setHoursBusy(true);
                  void applySignupHours()
                    .then((res) => {
                      if (!res.ok) {
                        toast.error(res.error);
                        return;
                      }
                      toast.success("Zeiten: Mo–Fr 8–12 und 14–18.");
                      void router.invalidate();
                    })
                    .catch(() => toast.error("Zeiten nicht gespeichert."))
                    .finally(() => setHoursBusy(false));
                }}
              >
                {hoursBusy ? "Übernimmt…" : "Mo–Fr voll übernehmen"}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link id={HEUTE_ZEITEN_VORLAGE_SETTINGS_ID} to="/app/einstellungen" hash="zeiten">
                {heuteZeitenVorlageSettings(anzeige)}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && (extraClosed.length || (zuRoom && heuteZuFormVisible(anzeige))) ? (
        <div id="heute-zu" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">{heuteZuTitle(anzeige)}</p>
          {heuteZuFormVisible(anzeige) ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Fortbildung oder Betriebsurlaub — nur dieses Datum, nicht den Wochentag. Silvia legt dann keinen Slot.
              Nächste Woche gilt wieder die Zeile in den Einstellungen. Fortbildung abgesagt: denselben Tag wieder öffnen,
              ohne den Wochentag zu ändern.
            </p>
          ) : (
            <p id={HEUTE_ZU_ANZEIGE_ID} className="mt-1 text-sm text-muted-foreground">
              {HEUTE_ZU_ANZEIGE}
            </p>
          )}
          {heuteZuFormVisible(anzeige) && zuRoom ? (
            <>
              <div className="mt-3 grid gap-2 sm:max-w-sm">
                <Label htmlFor="heute-zu-tag">Tag</Label>
                <Input
                  key={zuSeed}
                  id="heute-zu-tag"
                  type="date"
                  min={todayIso}
                  defaultValue={zuSeed}
                  disabled={zuBusy || anzeigeControl(anzeige).disabled}
                  title={anzeigeControl(anzeige).title}
                  onChange={(e) => setZuTagLabel(e.target.value)}
                  onInput={(e) => setZuTagLabel((e.currentTarget as HTMLInputElement).value)}
                />
                <p id="heute-zu-tag-anzeige" className="text-xs text-muted-foreground">
                  {formatHourDayAt(zuTagLabel || zuSeed)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  id="heute-zu-speichern"
                  size="sm"
                  disabled={zuBusy || anzeigeControl(anzeige).disabled}
                  title={anzeigeControl(anzeige).title}
                  className={DESK_SCROLL_MT}
                  onClick={() => {
                    if (anzeige) {
                      toast.error(anzeigeControl(true).title);
                      return;
                    }
                    const day =
                      (document.getElementById("heute-zu-tag") as HTMLInputElement | null)?.value ?? todayIso;
                    setZuBusy(true);
                    void savePracticeClosedDay({ data: { day } })
                      .then((res) => {
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        toast.success(
                          day === todayIso
                            ? "Heute geschlossen hinterlegt."
                            : `${formatHourDayAt(day)} geschlossen hinterlegt.`,
                        );
                        setZuTagLabel("");
                        void router.invalidate();
                      })
                      .catch(() => toast.error("Tag nicht gespeichert."))
                      .finally(() => setZuBusy(false));
                  }}
                >
                  {zuBusy ? "Speichert…" : "Tag hinterlegen"}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/app/einstellungen" hash="zeiten">
                    In den Einstellungen
                  </Link>
                </Button>
              </div>
            </>
          ) : heuteZuFormVisible(anzeige) ? (
            <div className="mt-3">
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/einstellungen" hash="zeiten">
                  In den Einstellungen
                </Link>
              </Button>
            </div>
          ) : null}
          {extraClosed.length ? (
            <ul id="heute-zu-liste" className="mt-4 grid gap-2">
              {extraClosed.map((iso) => (
                <li
                  key={iso}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <p className="text-sm">
                    <span className="font-medium">{formatHourDayAt(iso)}</span>
                    {iso === todayIso ? " · heute" : ""} geschlossen hinterlegt
                  </p>
                  {heuteZuFormVisible(anzeige) ? (
                  <Button
                    type="button"
                    id={extraClosedOpenId(iso)}
                    size="sm"
                    variant="outline"
                    disabled={zuBusy}
                    data-day={iso}
                    className={DESK_SCROLL_MT}
                    onClick={(e) => {
                      const day = e.currentTarget.getAttribute("data-day") ?? iso;
                      setZuBusy(true);
                      void savePracticeOpenDay({ data: { day } })
                        .then((res) => {
                          if (!res.ok) {
                            toast.error(res.error);
                            return;
                          }
                          toast.success(
                            day === todayIso
                              ? "Heute wieder geöffnet."
                              : `${formatHourDayAt(day)} wieder geöffnet.`,
                          );
                          void router.invalidate();
                        })
                        .catch(() => toast.error("Tag nicht geöffnet."))
                        .finally(() => setZuBusy(false));
                    }}
                  >
                    {zuBusy ? "Speichert…" : "Wieder öffnen"}
                  </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {live && !learnedFactsFrom((live.facts ?? []).map((f) => f.fact), live.contact.notes).length ? (
        <div id="heute-notiz" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">{heuteNotizTitle(anzeige)}</p>
          {gelerntWriteVisible(anzeige) ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Ohne Hinweis legt Silvia jeden hinterlegten Slot. Mittwoch nur Kastrationen oder Impfungen nur vormittags
            — in Ihrer Formulierung, nicht umgeschrieben.
          </p>
          ) : (
            <p id={HEUTE_NOTIZ_ANZEIGE_ID} className="mt-1 text-sm text-foreground">
              {SETTINGS_GELERNT_ANZEIGE}
            </p>
          )}
          {gelerntWriteVisible(anzeige) ? (
            <>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteTrainPrompts().map((prompt) => {
              const chipId = heuteFactChipId(prompt);
              return (
                <Button
                  key={prompt}
                  type="button"
                  id={chipId || undefined}
                  size="sm"
                  variant="outline"
                  disabled={notizBusy || anzeigeControl(anzeige).disabled}
                  title={anzeigeControl(anzeige).title}
                  onClick={() => {
                    if (anzeige) {
                      toast.error(anzeigeControl(true).title);
                      return;
                    }
                    setNotizBusy(true);
                    void rememberPracticeFact({ data: { fact: prompt } })
                      .then((res) => {
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        toast.success(res.duplicate ? "Hatte ich schon." : "Gemerkt. Gilt beim nächsten Anruf.");
                        void router.invalidate();
                      })
                      .catch(() => toast.error("Hinweis nicht gespeichert."))
                      .finally(() => setNotizBusy(false));
                  }}
                >
                  {prompt.replace(/\.$/, "")}
                </Button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-notiz-text">Eigene Hausregel</Label>
            <Textarea
              id="heute-notiz-text"
              className="min-h-20"
              placeholder="Mittwoch nur Kastrationen."
              disabled={notizBusy}
            />
          </div>
            </>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {gelerntWriteVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-notiz-speichern"
              size="sm"
              disabled={notizBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const fact =
                  (document.getElementById("heute-notiz-text") as HTMLTextAreaElement | null)?.value ?? "";
                setNotizBusy(true);
                void rememberPracticeFact({ data: { fact } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success(res.duplicate ? "Hatte ich schon." : "Gemerkt. Gilt beim nächsten Anruf.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Hinweis nicht gespeichert."))
                  .finally(() => setNotizBusy(false));
              }}
            >
              {notizBusy ? "Merkt…" : "Merken"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="gelernt">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && ownerIncomplete(live.contact.ownerNameStored) ? (
        <div id="heute-inhaberin" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">Inhaberin fehlt.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ohne Namen sagt Silvia Frau Doktor — nicht Dr. med. vet. Anna Huber. Namen hier hinterlegen.
          </p>
          <HeuteKurzWrite anzeige={anzeige} card="inhaberin">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-inhaberin-name">Inhaberin</Label>
            <Input
              id="heute-inhaberin-name"
              autoComplete="name"
              placeholder="Dr. Stein"
              disabled={inhaberinBusy}
            />
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-inhaberin-speichern"
              size="sm"
              disabled={inhaberinBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const name =
                  (document.getElementById("heute-inhaberin-name") as HTMLInputElement | null)?.value ?? "";
                const parsed = parsePracticeOwnerName(name);
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setInhaberinBusy(true);
                void savePracticeOwnerName({ data: { name: parsed.value } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Inhaberin hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Inhaberin nicht gespeichert."))
                  .finally(() => setInhaberinBusy(false));
              }}
            >
              {inhaberinBusy ? "Speichert…" : "Namen hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="ownerName">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && anreiseIncomplete(live.contact.street) ? (
        <div id="heute-anreise" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">Anreise unvollständig.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ohne Straße sagt Silvia nur {live.contact.city || "den Ort"} — nicht die Huber-Josefstadt-Demo. Straße
            hier hinterlegen, Parkplatz oder Öffi optional.
          </p>
          <HeuteKurzWrite anzeige={anzeige} card="anreise">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-anreise-street">Straße</Label>
            <Input
              id="heute-anreise-street"
              autoComplete="street-address"
              placeholder="Herrengasse 12"
              disabled={anreiseBusy}
            />
            <Label htmlFor="heute-anreise-zip">PLZ (optional)</Label>
            <Input
              id="heute-anreise-zip"
              autoComplete="postal-code"
              inputMode="numeric"
              placeholder="8010"
              disabled={anreiseBusy}
            />
            <Label htmlFor="heute-anreise-hint">Parkplatz / Öffi (optional)</Label>
            <Input
              id="heute-anreise-hint"
              placeholder="Parkplatz hinter dem Haus"
              disabled={anreiseBusy}
            />
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-anreise-speichern"
              size="sm"
              disabled={anreiseBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const street =
                  (document.getElementById("heute-anreise-street") as HTMLInputElement | null)?.value ?? "";
                const zip =
                  (document.getElementById("heute-anreise-zip") as HTMLInputElement | null)?.value ?? "";
                const hint =
                  (document.getElementById("heute-anreise-hint") as HTMLInputElement | null)?.value ?? "";
                const parsed = parsePracticeAnreise({ street, zip, hint });
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setAnreiseBusy(true);
                void savePracticeAnreise({
                  data: { street: parsed.street, zip: parsed.zip, hint: parsed.hint },
                })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Anreise hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Anreise nicht gespeichert."))
                  .finally(() => setAnreiseBusy(false));
              }}
            >
              {anreiseBusy ? "Speichert…" : "Adresse hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="adresse">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && ortIncomplete(live.contact.city) ? (
        <div id="heute-ort" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">Ort fehlt.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ohne Stadt sagt Silvia nicht Wien und nicht die Josefstadt. Ort hier hinterlegen, Bundesland optional.
          </p>
          <HeuteKurzWrite anzeige={anzeige} card="ort">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-ort-city">Ort</Label>
            <Input
              id="heute-ort-city"
              autoComplete="address-level2"
              placeholder="Graz"
              disabled={ortBusy}
            />
            <Label htmlFor="heute-ort-bundesland">Bundesland (optional)</Label>
            <select
              id="heute-ort-bundesland"
              disabled={ortBusy}
              className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              defaultValue={live.contact.bundesland || ""}
            >
              <option value="">Bitte wählen</option>
              {BUNDESLAENDER.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-ort-speichern"
              size="sm"
              disabled={ortBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const city =
                  (document.getElementById("heute-ort-city") as HTMLInputElement | null)?.value ?? "";
                const bundesland =
                  (document.getElementById("heute-ort-bundesland") as HTMLSelectElement | null)?.value ?? "";
                const parsed = parsePracticeOrt({ city, bundesland });
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setOrtBusy(true);
                void savePracticeOrt({
                  data: { city: parsed.city, bundesland: parsed.bundesland },
                })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Ort hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Ort nicht gespeichert."))
                  .finally(() => setOrtBusy(false));
              }}
            >
              {ortBusy ? "Speichert…" : "Ort hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="adresse">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && parkplatzIncomplete(live.contact.street, live.contact.locationHint) ? (
        <div id="heute-parkplatz" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">Parkplatz / Öffi fehlt.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ohne Hinweis nennt Silvia nur {live.contact.street} — nicht die Huber-Kurzparkzone und nicht U2 Rathaus.
            Parkplatz oder Öffi hier hinterlegen.
          </p>
          <HeuteKurzWrite anzeige={anzeige} card="parkplatz">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-parkplatz-hint">Parkplatz / Öffi</Label>
            <Input
              id="heute-parkplatz-hint"
              placeholder="Parkplatz hinter dem Haus"
              disabled={parkplatzBusy}
            />
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-parkplatz-speichern"
              size="sm"
              disabled={parkplatzBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const hint =
                  (document.getElementById("heute-parkplatz-hint") as HTMLInputElement | null)?.value ?? "";
                const parsed = parsePracticeLocationHint({ hint });
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setParkplatzBusy(true);
                void savePracticeLocationHint({ data: { hint: parsed.hint } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Parkplatz hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Hinweis nicht gespeichert."))
                  .finally(() => setParkplatzBusy(false));
              }}
            >
              {parkplatzBusy ? "Speichert…" : "Hinweis hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="adresse">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && !String(live.contact.phone ?? "").trim() ? (
        <div id="heute-leitung" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">Leitungsnummer fehlt.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ohne Nummer sagt Silvia nicht die Huber-Josefstadt-Leitung. Festnetz oder Handy der Ordination — nicht
            01 405 12 88.
          </p>
          <HeuteKurzWrite anzeige={anzeige} card="leitung">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-leitung-nr">Telefon der Ordination</Label>
            <Input
              id="heute-leitung-nr"
              autoComplete="tel"
              inputMode="tel"
              placeholder="0316 … oder 0664 …"
              disabled={leitungBusy}
            />
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-leitung-speichern"
              size="sm"
              disabled={leitungBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const raw =
                  (document.getElementById("heute-leitung-nr") as HTMLInputElement | null)?.value ?? "";
                const parsed = parsePracticePhone(raw);
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setLeitungBusy(true);
                void savePracticePhone({ data: { phone: parsed.value } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Leitung hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Nummer nicht gespeichert."))
                  .finally(() => setLeitungBusy(false));
              }}
            >
              {leitungBusy ? "Speichert…" : "Nummer hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="leitung">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && !live.contact.nachtdienstPhone ? (
        <div id="heute-nachtdienst" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">Nachtdienst-Nummer fehlt.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bei einem Notfall kann die Tierarzthelferin den Nachtdienst nicht anrufen. Silvia erfindet keine Kliniknummer — auch
            nicht für die Steiermark. Handy oder Festnetz der Stelle, die Sie wirklich anrufen.
          </p>
          <HeuteKurzWrite anzeige={anzeige} card="nachtdienst">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-nachtdienst-name">Stelle (optional)</Label>
            <Input
              id="heute-nachtdienst-name"
              placeholder="z. B. Bereitschaft"
              disabled={nachtBusy}
            />
            <Label htmlFor="heute-nachtdienst-nr">Telefon</Label>
            <Input
              id="heute-nachtdienst-nr"
              autoComplete="tel"
              inputMode="tel"
              placeholder="0316 … oder 0664 …"
              disabled={nachtBusy}
            />
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-nachtdienst-speichern"
              size="sm"
              disabled={nachtBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const phone =
                  (document.getElementById("heute-nachtdienst-nr") as HTMLInputElement | null)?.value ?? "";
                const name =
                  (document.getElementById("heute-nachtdienst-name") as HTMLInputElement | null)?.value ?? "";
                const parsed = parsePracticeNachtdienst({ phone, name });
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setNachtBusy(true);
                void savePracticeNachtdienst({ data: { phone: parsed.phone, name: parsed.name } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Nachtdienst hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Nachtdienst nicht gespeichert."))
                  .finally(() => setNachtBusy(false));
              }}
            >
              {nachtBusy ? "Speichert…" : "Nummer hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="nachtdienst">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && internWhatsappMissing(live.contact.whatsapp, live.contact.phone) ? (
        <div id="heute-whatsapp" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p id={HEUTE_WHATSAPP_TITLE_ID} className="font-medium">
            {heuteWhatsappTitle(anzeige)}
          </p>
          {heuteKurzspeichernVisible(anzeige) ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Festnetz reicht für SMS und Anruf. Der WhatsApp-Entwurf braucht 06… — nicht die Leitungsnummer aus der
            Anmeldung.
          </p>
          ) : null}
          <HeuteKurzWrite anzeige={anzeige} card="whatsapp">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-whatsapp-nr">WhatsApp der Frau Doktor (Handy)</Label>
            <Input
              id="heute-whatsapp-nr"
              autoComplete="tel"
              inputMode="tel"
              placeholder="0664 …"
              disabled={whatsappBusy}
            />
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-whatsapp-speichern"
              size="sm"
              disabled={whatsappBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const raw =
                  (document.getElementById("heute-whatsapp-nr") as HTMLInputElement | null)?.value ?? "";
                const parsed = parsePracticeWhatsapp(raw);
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setWhatsappBusy(true);
                void savePracticeWhatsapp({ data: { whatsapp: parsed.value } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("WhatsApp der Frau Doktor hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Handy nicht gespeichert."))
                  .finally(() => setWhatsappBusy(false));
              }}
            >
              {whatsappBusy ? "Speichert…" : "Handy hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="whatsapp">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {live && internInboxMissing(live.contact.email, live.session.email) ? (
        <div id="heute-inbox" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p className="font-medium">Intern-E-Mail braucht die Inbox der Frau Doktor.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Das Protokoll an die Frau Doktor öffnet mailto nicht an Anmelden ({live.session.email}). Inbox der
            Ordination hinterlegen, wenn die Post in die Praxis soll — nicht an die Halterin.
          </p>
          <HeuteKurzWrite anzeige={anzeige} card="inbox">
          <div className="mt-3 grid gap-2 sm:max-w-sm">
            <Label htmlFor="heute-inbox-nr">Inbox der Frau Doktor</Label>
            <Input
              id="heute-inbox-nr"
              type="email"
              autoComplete="email"
              placeholder="rezeption@ordination.at"
              disabled={inboxBusy}
            />
          </div>
          </HeuteKurzWrite>
          <div className="mt-3 flex flex-wrap gap-2">
            {heuteKurzspeichernVisible(anzeige) ? (
            <Button
              type="button"
              id="heute-inbox-speichern"
              size="sm"
              disabled={inboxBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const raw =
                  (document.getElementById("heute-inbox-nr") as HTMLInputElement | null)?.value ?? "";
                const parsed = parsePracticeInbox(raw, live.session.email);
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                setInboxBusy(true);
                void savePracticeInbox({ data: { email: parsed.value } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Inbox der Frau Doktor hinterlegt.");
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Inbox nicht gespeichert."))
                  .finally(() => setInboxBusy(false));
              }}
            >
              {inboxBusy ? "Speichert…" : "Inbox hinterlegen"}
            </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="email">
                In den Einstellungen
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {showBackupCard ? (
        <div id="heute-backup" className={cn(DESK_SCROLL_MT, "mt-6 rounded-xl border border-flag/40 bg-card p-4")}>
          <p id={HEUTE_BACKUP_TITLE_ID} className="font-medium">
            {heuteBackupTitle(anzeige, backupNote?.title ?? backupKeep.title)}
          </p>
          {backupAnzeigeLine ? (
            <p id={HEUTE_BACKUP_ANZEIGE_ID} className="mt-3 text-sm">
              {backupAnzeigeLine}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {backupNote?.body ?? backupKeep.body}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {canDownloadTafel ? (
              <>
                <Input
                  type="password"
                  id="heute-backup-pass"
                  autoComplete="new-password"
                  className="w-full sm:max-w-xs"
                  placeholder="Passwort für die Sicherung (min. 8 Zeichen)"
                  value={backupPass}
                  onChange={(e) => setBackupPass(e.target.value)}
                />
                <Button
                  type="button"
                  id="heute-backup-download"
                  size="sm"
                  disabled={
                    backupBusy ||
                    restoreBusy ||
                    anzeigeControl(anzeige).disabled ||
                    !backupCipherPassphraseOk(backupPass)
                  }
                  title={anzeigeControl(anzeige).title}
                  onClick={() => {
                  if (anzeige) {
                    toast.error(anzeigeControl(true).title);
                    return;
                  }
                  setBackupBusy(true);
                  setBackupNotice(null);
                  void saveTafelBackupDownload(
                    typeof localStorage === "undefined" ? null : localStorage,
                    live?.session.practiceId,
                    backupPass,
                  )
                    .then((res) => {
                      if (!res.ok) {
                        setBackupNotice(tafelBackupNoticeOf(res.error, "heute"));
                        toast.error(res.error);
                        return;
                      }
                      setBackupLast(res.iso || null);
                      setBackupNote(res.reminder);
                      toast.success("Sicherung heruntergeladen.");
                    })
                    .catch(() => {
                      setBackupNotice(tafelBackupNoticeOf(TAFEL_BACKUP_FAIL, "heute"));
                      toast.error(TAFEL_BACKUP_FAIL);
                    })
                    .finally(() => setBackupBusy(false));
                }}
              >
                {backupBusy ? "Sichert…" : "Tafel sichern"}
              </Button>
              </>
            ) : null}
            {backupNotice ? (
              <p id={backupNotice.id} className="w-full text-sm">
                {backupNotice.text}
              </p>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/einstellungen" hash="settings-data">
                In den Einstellungen
              </Link>
            </Button>
          </div>
          {canRestoreTafel ? (
            <div className="mt-4 grid gap-2 sm:max-w-sm">
              <Label htmlFor="heute-backup-file">Sicherung vom Stick</Label>
              <input
                id="heute-backup-file"
                ref={holenFileRef}
                type="file"
                accept=".gz,.tar.gz,.silvia,application/gzip,application/x-gzip,application/octet-stream"
                className="max-w-md text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5"
                onInput={(e) => setHolenFileOn(Boolean(e.currentTarget.files?.[0]))}
                onChange={(e) => setHolenFileOn(Boolean(e.target.files?.[0]))}
              />
              <Label htmlFor="heute-backup-confirm">Zum Holen {DESK_BACKUP_CONFIRM} eintippen</Label>
              <Input
                id="heute-backup-confirm"
                autoComplete="off"
                placeholder={DESK_BACKUP_CONFIRM}
                disabled={backupBusy || restoreBusy}
                value={holenConfirm}
                onChange={(e) => setHolenConfirm(e.target.value)}
              />
              <Label htmlFor="heute-backup-passwort">Passwort der Sicherung (falls verschlüsselt)</Label>
              <Input
                id="heute-backup-passwort"
                type="password"
                autoComplete="off"
                placeholder="Passwort"
                disabled={backupBusy || restoreBusy}
                value={holenPass}
                onChange={(e) => setHolenPass(e.target.value)}
              />
              <Button
                type="button"
                id="heute-backup-restore"
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={backupBusy || restoreBusy || anzeigeControl(anzeige).disabled || !holenReady}
                title={anzeigeControl(anzeige).title || (holenReady ? undefined : HOLEN_RESTORE_NEED_BOTH)}
                onClick={() => {
                  if (anzeige) {
                    toast.error(anzeigeControl(true).title);
                    return;
                  }
                  const fileEl = document.getElementById("heute-backup-file");
                  const file =
                    fileEl instanceof HTMLInputElement && fileEl.files && fileEl.files[0]
                      ? fileEl.files[0]
                      : null;
                  const confirm = holenConfirm;
                  if (!file || !holenRestoreReady({ file: true, confirm })) {
                    toast.error(HOLEN_RESTORE_NEED_BOTH);
                    return;
                  }
                  setHolenFail("");
                  const store = typeof localStorage === "undefined" ? null : localStorage;
                  writeHolenReloadFlag(store);
                  const watchdog = window.setTimeout(() => {
                    window.location.assign(`${TAFEL_HOLEN_WAIT_HREF}?next=/app`);
                  }, TAFEL_HOLEN_WATCHDOG_MS);
                  setRestoreBusy(true);
                  let accepted = false;
                  void holenChosenTafel({ file, confirm, filename: file.name, passphrase: holenPass })
                    .then(async (res) => {
                      const next = holenRestoreNext(res);
                      if (next.action === "cancel") {
                        window.clearTimeout(watchdog);
                        clearHolenReloadFlag(store);
                        return;
                      }
                      if (next.action === "error") {
                        window.clearTimeout(watchdog);
                        const stay = holenStayAfterFail({
                          fail: next.error,
                          storage: store,
                          fileEl: fileEl instanceof HTMLInputElement ? fileEl : null,
                        });
                        setHolenFileOn(stay.fileOn);
                        setHolenConfirm(stay.confirm);
                        setHolenFail(stay.fail);
                        toast.error(stay.fail);
                        return;
                      }
                      accepted = true;
                      if (next.at) {
                        applyTafelBackupDownload(store, new Date(next.at), live?.session.practiceId);
                      }
                      if (next.action === "login") {
                        window.clearTimeout(watchdog);
                        window.location.assign("/login");
                        return;
                      }
                      if (next.deferToast) {
                        const until = await waitHolenPendingUntilIdle();
                        window.clearTimeout(watchdog);
                        if (holenPendingShouldStay(until)) {
                          const stay = holenStayAfterFail({
                            fail: until.fail,
                            storage: store,
                            fileEl: fileEl instanceof HTMLInputElement ? fileEl : null,
                          });
                          setHolenFileOn(stay.fileOn);
                          setHolenConfirm(stay.confirm);
                          setHolenFail(stay.fail);
                          toast.error(stay.fail);
                          void loadHolenFailNotice();
                          return;
                        }
                        window.location.reload();
                        return;
                      }
                      window.clearTimeout(watchdog);
                      clearHolenReloadFlag(store);
                      toast.success(TAFEL_HOLEN_TOAST);
                      window.location.reload();
                    })
                    .catch((err) => {
                      if (accepted || holenRestoreAbortIsBenign(err)) return;
                      window.clearTimeout(watchdog);
                      const stay = holenStayAfterFail({
                        storage: store,
                        fileEl: fileEl instanceof HTMLInputElement ? fileEl : null,
                      });
                      setHolenFileOn(stay.fileOn);
                      setHolenConfirm(stay.confirm);
                      setHolenFail(stay.fail);
                      toast.error(stay.fail);
                    })
                    .finally(() => setRestoreBusy(false));
                }}
              >
                {restoreBusy ? "Holt…" : "Tafel holen"}
              </Button>
              {holenFail ? (
                <p id={TAFEL_HOLEN_HEUTE_FAIL_ID} className="text-sm">
                  {holenFail}
                </p>
              ) : holenWaitVisible({ busy: restoreBusy }) ? (
                <p id="heute-holen-wait" className="text-sm">
                  {TAFEL_HOLEN_WAIT}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/app/anrufe"
          search={{ c: undefined }}
          className="rounded-xl border border-border bg-card p-4 hover:bg-secondary/50"
        >
          <p className="font-display text-3xl font-semibold tabular-nums">{counts.calls}</p>
          <p className="mt-1 text-sm text-muted-foreground">Anrufe</p>
        </Link>
        <Link to="/app/kalender" className="rounded-xl border border-border bg-card p-4 hover:bg-secondary/50">
          <p className="font-display text-3xl font-semibold tabular-nums">{counts.appointments}</p>
          <p className="mt-1 text-sm text-muted-foreground">Termine</p>
        </Link>
        <Link
          id="heute-notfall-chip"
          to="/app/notfall"
          search={newestOpen ? { e: newestOpen.id } : {}}
          className={cn(
            "rounded-xl border bg-card p-4 hover:bg-secondary/50",
            openNight.length ? "border-flag/40" : "border-border",
          )}
        >
          <p className="font-display text-3xl font-semibold tabular-nums">{counts.emergencies}</p>
          <p className="mt-1 text-sm text-muted-foreground">Notfälle</p>
        </Link>
        <Link
          id="heute-protokoll-chip"
          to="/app/nachrichten"
          search={intern[0] ? { t: intern[0].id } : { t: undefined, m: undefined }}
          className={cn(
            "rounded-xl border bg-card p-4 hover:bg-secondary/50",
            intern.length ? "border-primary/30" : "border-border",
          )}
        >
          <p className="font-display text-3xl font-semibold tabular-nums">{unread}</p>
          <p className="mt-1 text-sm text-muted-foreground">Protokoll</p>
        </Link>
      </div>

      {inbound && leitungPublicShowsLive(anzeige) ? (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Öffentliche Leitung</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{inbound}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(inbound).then(
                  () => toast.success("Link kopiert."),
                  () => toast.error("Kopieren nicht möglich."),
                );
              }}
            >
              Link kopieren
            </Button>
            <Button size="sm" asChild>
              <Link to="/leitung/$slug" params={{ slug }}>
                Leitung öffnen
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      ) : inbound ? (
        <p id={HEUTE_LEITUNG_ANZEIGE_ID} className="mt-6 text-sm text-muted-foreground">
          {sprechenAnzeigeAuthLine(true)}
        </p>
      ) : null}

      {openNight.length ? (
        <section id="heute-notfall" className={cn(DESK_SCROLL_MT, "mt-8")}>
          <h2 className="font-display text-xl font-semibold">Offene Notfälle</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {emergencyDeskLead()} {nachtdienstReachCopy(live?.contact.nachtdienstPhone, anzeige)}
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-flag/40 bg-card">
            {openNight.map((e) => {
              const practiceName = live?.contact.practiceName || "Ordination";
              const nightBody = nachtdienstDraft({ practiceName, pet: e.pet });
              const ownerBody = ownerReachBody({
                pet: e.pet,
                caller: e.owner_name,
                practiceName,
                kind: "notfall",
              });
              function setNightStatus(status: "übernommen" | "abgeschlossen") {
                void updateEmergencyStatus({ data: { id: e.id, status } })
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
              return (
                <li
                  key={e.id}
                  id={`heute-notfall-${e.id}`}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="text-xs font-medium tracking-wider text-flag uppercase">
                      {emergencyStatusLabel(e.status)} · {format(new Date(e.at), "d.M. HH:mm", { locale: deAT })}
                    </p>
                    <p className="mt-1 font-medium">
                      {e.pet} · {displayOwner(e.owner_name)}
                    </p>
                    <p className="mt-1 text-sm">{e.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <NachtdienstReach
                      phone={live?.contact.nachtdienstPhone}
                      body={nightBody}
                      size="default"
                      idPrefix={`heute-notfall-nacht-${e.id}`}
                    />
                    <HalterinReach
                      openId={`heute-notfall-reach-${e.id}`}
                      ownerPhone={e.owner_phone}
                      ownerEmail={emailForPet(live?.patients ?? [], e.pet) || e.owner_email}
                      mailSubject={ownerReachMailSubject(e.pet, practiceName, e.owner_name)}
                      body={ownerBody}
                      size="default"
                    />
                    {notfallWriteVisible(anzeige) && e.status !== "übernommen" ? (
                      <Button
                        type="button"
                        id={`heute-notfall-uebernommen-${e.id}`}
                        disabled={anzeigeControl(anzeige).disabled}
                        title={anzeigeControl(anzeige).title}
                        onClick={() => {
                          if (anzeige) {
                            toast.error(anzeigeControl(true).title);
                            return;
                          }
                          setNightStatus("übernommen");
                        }}
                      >
                        Übernommen
                      </Button>
                    ) : null}
                    {notfallWriteVisible(anzeige) ? (
                    <Button
                      type="button"
                      id={`heute-notfall-abschliessen-${e.id}`}
                      variant="outline"
                      disabled={anzeigeControl(anzeige).disabled}
                      title={anzeigeControl(anzeige).title}
                      onClick={() => {
                        if (anzeige) {
                          toast.error(anzeigeControl(true).title);
                          return;
                        }
                        setNightStatus("abgeschlossen");
                      }}
                    >
                      Abschließen
                    </Button>
                    ) : null}
                    <Button variant="outline" asChild>
                      <Link to="/app/notfall" search={{ e: e.id }}>
                        Fall
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {waitingDesk.length ? (
        <section id="heute-an-der-leitung" className={cn(DESK_SCROLL_MT, "mt-8")}>
          <h2 className="font-display text-xl font-semibold">An der Leitung</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Silvia hat übergeben. Klientel bleibt in der Leitung – die Tierarzthelferin übernimmt, statt zurückzurufen.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-primary/30 bg-card">
            {waitingDesk.map((c) => {
              const practiceName = live?.contact.practiceName || "Ordination";
              const body = ownerReachBody({
                pet: c.pet,
                caller: c.caller,
                practiceName,
                kind: "leitung",
              });
              const ownerMail = emailForPet(live?.patients ?? [], c.pet) || c.owner_email;
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{c.pet !== "Patient" ? c.pet : displayOwner(c.caller)}</p>
                    <p className="text-sm text-muted-foreground">
                      {displayOwner(c.caller)}
                      {c.owner_phone ? ` · ${c.owner_phone}` : ""}
                      {ownerMail ? ` · ${ownerMail}` : ""}
                    </p>
                    <p className="mt-1 text-sm">{c.concern}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {callErledigtVisible(anzeige) ? (
                      <Button
                        id={`heute-anleitung-uebernommen-${c.id}`}
                        disabled={anzeigeControl(anzeige).disabled}
                        title={anzeigeControl(anzeige).title}
                        onClick={() => {
                          if (anzeige) {
                            toast.error(anzeigeControl(true).title);
                            return;
                          }
                          void updateCallStatus({ data: { id: c.id, status: "erledigt" } })
                            .then((res) => {
                              if (!res.ok) {
                                toast.error("error" in res && res.error ? res.error : "Status nicht gespeichert.");
                                return;
                              }
                              toast.success("Übernommen.");
                              void router.invalidate();
                            })
                            .catch(() => toast.error("Status nicht gespeichert."));
                        }}
                      >
                        Übernommen
                      </Button>
                    ) : null}
                    <HalterinReach
                      openId={`heute-anleitung-reach-${c.id}`}
                      ownerPhone={c.owner_phone}
                      ownerEmail={ownerMail}
                      mailSubject={ownerReachMailSubject(c.pet, practiceName, c.caller)}
                      body={body}
                      size="default"
                    />
                    <AkteHandyLink
                      pet={c.pet}
                      patients={live?.patients}
                      size="default"
                      owner={c.caller}
                      ownerPhone={c.owner_phone}
                      ownerEmail={ownerMail}
                      anzeige={anzeige}
                    />
                    <Button variant="outline" asChild>
                      <Link to="/app/anrufe" search={{ c: c.id }}>
                        Transkript
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {callbacks.length ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Rückrufe</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Silvia hat einen Zettel gelegt. Anrufen und E-Mail gehen an die Halterin, nicht an die Praxis.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {callbacks.map((c) => {
              const practiceName = live?.contact.practiceName || "Ordination";
              const body = ownerReachBody({
                pet: c.pet,
                caller: c.caller,
                practiceName,
                kind: "rueckruf",
              });
              const ownerMail = emailForPet(live?.patients ?? [], c.pet) || c.owner_email;
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{c.pet !== "Patient" ? c.pet : displayOwner(c.caller)}</p>
                    <p className="text-sm text-muted-foreground">
                      {displayOwner(c.caller)}
                      {c.owner_phone ? ` · ${c.owner_phone}` : ""}
                      {ownerMail ? ` · ${ownerMail}` : ""}
                    </p>
                    <p className="mt-1 text-sm">{c.concern}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <HalterinReach
                      openId={`heute-rueckruf-reach-${c.id}`}
                      ownerPhone={c.owner_phone}
                      ownerEmail={ownerMail}
                      mailSubject={ownerReachMailSubject(c.pet, practiceName, c.caller)}
                      body={body}
                      size="default"
                    />
                    <AkteHandyLink
                      pet={c.pet}
                      patients={live?.patients}
                      size="default"
                      owner={c.caller}
                      ownerPhone={c.owner_phone}
                      ownerEmail={ownerMail}
                      anzeige={anzeige}
                    />
                    <Button variant="outline" asChild>
                      <Link to="/app/anrufe" search={{ c: c.id }}>
                        Transkript
                      </Link>
                    </Button>
                    {callErledigtVisible(anzeige) ? (
                      <Button
                        type="button"
                        id={`heute-rueckruf-erledigt-${c.id}`}
                        variant="outline"
                        disabled={anzeigeControl(anzeige).disabled}
                        title={anzeigeControl(anzeige).title}
                        onClick={() => {
                          if (anzeige) {
                            toast.error(anzeigeControl(true).title);
                            return;
                          }
                          void updateCallStatus({ data: { id: c.id, status: "erledigt" } })
                            .then((res) => {
                              if (!res.ok) {
                                toast.error("error" in res && res.error ? res.error : "Status nicht gespeichert.");
                                return;
                              }
                              toast.success("Rückruf erledigt.");
                              void router.invalidate();
                            })
                            .catch(() => toast.error("Status nicht gespeichert."));
                        }}
                      >
                        Erledigt
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {waitlist.length ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Warteliste</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ausgebuchte Wunschtage — die Praxis meldet sich, sobald ein Termin frei wird.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {waitlist.map((w) => {
              const wunschtag = w.requestedDate
                ? format(new Date(`${w.requestedDate}T12:00:00`), "d.M.yyyy", { locale: deAT })
                : "";
              return (
                <li
                  key={w.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{w.pet !== "Patient" ? w.pet : displayOwner(w.caller)}</p>
                    <p className="text-sm text-muted-foreground">
                      {displayOwner(w.caller)}
                      {w.phone ? ` · ${w.phone}` : ""}
                    </p>
                    <p className="mt-1 text-sm">{w.concern}</p>
                  </div>
                  {wunschtag ? (
                    <p className="text-sm text-muted-foreground">Wunschtag {wunschtag}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div id="heute-walkin" className={cn(DESK_SCROLL_MT, "mt-8 max-w-md")}>
        <WalkInForm
          day={walkDay}
          onDayChange={pickWalkDay}
          idPrefix="heute-"
          showDate
          patients={live?.patients}
          appointments={live?.appointments}
          practiceName={live?.contact.practiceName}
          hours={hours}
          anzeige={anzeige}
        />
      </div>

      <VquadratSpiegelCard
        prefix="heute"
        rows={live?.vquadratSpiegel ?? []}
        anzeige={anzeige}
      />

      {counts.calls === 0 && counts.appointments === 0 ? (
        <div id={HEUTE_LEER_ID} className="mt-8 rounded-xl border border-dashed border-border p-6">
          <p className="font-medium">Noch nichts auf der Tafel.</p>
          <p className="mt-1 text-sm text-muted-foreground">{heuteEmptyCopy(anzeige)}</p>
          {sprechenDeskOpenVisible(anzeige) ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/sprechen" search={{ mode: undefined }}>
                  Silvia anrufen
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-xl font-semibold">Letzte Gespräche</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Anrufen, SMS, WhatsApp und E-Mail gehen an die Halterin. Offene Rückrufe und Übergabe-Zettel stehen oben.
            </p>
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
              {recent.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">Noch kein Anruf.</li>
              ) : (
                recent.map((c) => {
                  const practiceName = live?.contact.practiceName || "Ordination";
                  const body = ownerReachBody({
                    pet: c.pet,
                    caller: c.caller,
                    practiceName,
                    kind: "log",
                  });
                  const ownerMail = emailForPet(live?.patients ?? [], c.pet) || c.owner_email;
                  return (
                    <li key={c.id} className="flex flex-col gap-3 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <PhoneCall className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="font-medium">{c.pet !== "Patient" ? c.pet : displayOwner(c.caller)}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {displayOwner(c.caller)}
                            {c.owner_phone ? ` · ${c.owner_phone}` : ""}
                            {ownerMail ? ` · ${ownerMail}` : ""}
                            {c.action ? ` · ${c.action}` : ""}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">{c.concern}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <HalterinReach
                          openId={`heute-log-reach-${c.id}`}
                          ownerPhone={c.owner_phone}
                          ownerEmail={ownerMail}
                          mailSubject={ownerReachMailSubject(c.pet, practiceName, c.caller)}
                          body={body}
                        />
                        <AkteHandyLink
                          pet={c.pet}
                          patients={live?.patients}
                          owner={c.caller}
                          ownerPhone={c.owner_phone}
                          ownerEmail={ownerMail}
                          anzeige={anzeige}
                        />
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/app/anrufe" search={{ c: c.id }}>
                            Transkript
                          </Link>
                        </Button>
                        {callErledigtVisible(anzeige) && c.status !== "erledigt" ? (
                          <Button
                            type="button"
                            id={`heute-log-erledigt-${c.id}`}
                            variant="outline"
                            size="sm"
                            disabled={anzeigeControl(anzeige).disabled}
                            title={anzeigeControl(anzeige).title}
                            onClick={() => {
                              if (anzeige) {
                                toast.error(anzeigeControl(true).title);
                                return;
                              }
                              void updateCallStatus({ data: { id: c.id, status: "erledigt" } })
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
                            Erledigt
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="heute-naechste-termine" className="font-display text-xl font-semibold">
              Nächste Termine
            </h2>
            {openConfirm.count > 0 && openConfirmHref ? (
              <a
                id="heute-offen-bestaetigen"
                href={openConfirmHref}
                className="text-sm text-primary hover:underline"
              >
                {openConfirmLabel(openConfirm.count)}
              </a>
            ) : null}
            </div>
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
              {next.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">Kein Slot gelegt.</li>
              ) : (
                next.map((a) => {
                  const slot = format(new Date(a.start_at), "EEEE, d.M. 'um' HH:mm", { locale: deAT });
                  const practiceName = live?.contact.practiceName || "Ordination";
                  const body = ownerConfirmText({
                    action: { pet: a.pet, owner: a.owner_name },
                    slot,
                    practiceName,
                  });
                  const cancel = ownerCancelText({
                    action: { pet: a.pet, owner: a.owner_name },
                    slot,
                    practiceName,
                  });
                  const confirmDraft = a.status === "bestätigt" ? "" : halterinDraftHref(a.owner_phone, body);
                  const confirmSms = a.status === "bestätigt" ? "" : halterinSmsHref(a.owner_phone, body);
                  const confirmMail =
                    a.status === "bestätigt"
                      ? ""
                      : halterinMailHref(
                          ownerSlotMailSubject("termin", a.pet, practiceName, a.owner_name),
                          body,
                          a.owner_email,
                        );
                  const cancelDraft = halterinDraftHref(a.owner_phone, cancel);
                  const cancelSms = halterinSmsHref(a.owner_phone, cancel);
                  const cancelMail = halterinMailHref(
                    ownerSlotMailSubject("absage", a.pet, practiceName, a.owner_name),
                    cancel,
                    a.owner_email,
                  );
                  return (
                  <li key={a.id} id={heuteSlotDomId(a.id)} className="flex flex-col gap-3 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                    <div>
                    <p className="font-medium">
                      {a.pet} · {a.kind}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(a.start_at), "EEE d.M. · HH:mm", { locale: deAT })} · {displayOwner(a.owner_name)}
                      {a.owner_phone ? ` · ${a.owner_phone}` : ""}
                      {a.owner_email ? ` · ${a.owner_email}` : ""}
                      {a.status === "gelegt" ? " · zu bestätigen" : a.status && a.status !== "gelegt" ? ` · ${a.status}` : ""}
                    </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {a.status === "abgesagt" ? (
                        <>
                          {slotWriteVisible(anzeige) ? (
                          <Button
                            type="button"
                            id={`heute-einsetzen-${a.id}`}
                            variant="outline"
                            size="sm"
                            disabled={anzeigeControl(anzeige).disabled}
                            title={anzeigeControl(anzeige).title}
                            onClick={() => {
                              if (anzeige) {
                                toast.error(anzeigeControl(true).title);
                                return;
                              }
                              void updateAppointmentStatus({ data: { id: a.id, status: "gelegt" } })
                                .then((res) => {
                                  if (!res.ok) {
                                    toast.error("error" in res && res.error ? res.error : "Termin nicht geändert.");
                                    return;
                                  }
                                  const moved =
                                    "moved" in res && res.moved && "start" in res && res.start
                                      ? formatSlot(new Date(res.start))
                                      : "";
                                  toast.success(moved ? `Wieder gelegt: ${moved}.` : "Wieder gelegt.");
                                  void router.invalidate();
                                })
                                .catch(() => toast.error("Termin nicht geändert."));
                            }}
                          >
                            Wieder einsetzen
                          </Button>
                          ) : null}
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              id={`heute-im-kalender-${a.id}`}
                              to="/app/kalender"
                              search={kalenderAppointmentSearch(a)}
                            >
                              Im Kalender
                            </Link>
                          </Button>
                        </>
                      ) : (
                        <>
                      <SlotStatusDrafts
                        openId={`heute-channels-${a.id}`}
                        status={a.status}
                        anzeige={anzeige}
                        confirmWa={confirmDraft}
                        confirmSms={confirmSms}
                        confirmMail={confirmMail}
                        cancelWa={cancelDraft}
                        cancelSms={cancelSms}
                        cancelMail={cancelMail}
                        onConfirm={(channel) => {
                          void updateAppointmentStatus({ data: { id: a.id, status: "bestätigt" } })
                            .then((res) => {
                              if (!res.ok) {
                                toast.error("error" in res && res.error ? res.error : "Termin nicht geändert.");
                                return;
                              }
                              toast.success(confirmDraftToast(channel));
                              void router.invalidate();
                            })
                            .catch(() => toast.error("Termin nicht geändert."));
                        }}
                        onCancel={(channel) => {
                          void updateAppointmentStatus({ data: { id: a.id, status: "abgesagt" } })
                            .then((res) => {
                              if (!res.ok) {
                                toast.error("Termin nicht geändert.");
                                return;
                              }
                              toast.success(cancelDraftToast(channel));
                              void router.invalidate();
                            })
                            .catch(() => toast.error("Termin nicht geändert."));
                        }}
                      />
                      <HalterinReach
                        collapsed
                        openId={`heute-reach-${a.id}`}
                        ownerPhone={a.owner_phone}
                        ownerEmail={a.owner_email}
                        mailSubject={ownerReachMailSubject(a.pet, practiceName, a.owner_name)}
                        body={body}
                      />
                      <AkteHandyLink
                        pet={a.pet}
                        patients={live?.patients}
                        owner={a.owner_name}
                        ownerPhone={a.owner_phone}
                        ownerEmail={a.owner_email}
                        anzeige={anzeige}
                      />
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          id={`heute-im-kalender-${a.id}`}
                          to="/app/kalender"
                          search={kalenderAppointmentSearch(a)}
                        >
                          Im Kalender
                        </Link>
                      </Button>
                        </>
                      )}
                    </div>
                    </div>
                    {a.status !== "abgesagt" ? (
                      <RescheduleForm
                        id={a.id}
                        startAt={a.start_at}
                        pet={a.pet}
                        owner={a.owner_name}
                        phone={a.owner_phone}
                        email={a.owner_email}
                        practiceName={practiceName}
                        hours={hours}
                        appointments={live?.appointments}
                        onMoved={pickWalkDay}
                        anzeige={anzeige}
                      />
                    ) : null}
                  </li>
                  );
                })
              )}
            </ul>
            {laterHidden > 0 ? (
              <p className="mt-2 text-sm">
                <Link
                  id="heute-kalender-mehr"
                  to="/app/kalender"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  Noch {laterHidden} {laterHidden === 1 ? "Termin" : "Termine"} im Kalender
                  <ArrowRight className="size-3.5" />
                </Link>
              </p>
            ) : null}
          </section>
        </div>
      )}

      {intern.length ? (
        <section id="heute-frau-doktor" className={cn(DESK_SCROLL_MT, "mt-8")}>
          <h2 className="font-display text-xl font-semibold">An die Frau Doktor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ungelesenes Intern-Protokoll. Anrufen, WhatsApp, SMS und E-Mail gehen an die Nummer und Adresse aus
            den Einstellungen, nicht an die Halterin. Silvia sendet nicht selbst.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-primary/30 bg-card">
            {intern.map((t) => {
              const body = internDraftBody(t.messages, t.preview);
              const dest = threadDraftDest({
                intern: true,
                practiceWhatsapp: live?.contact.whatsapp,
                practicePhone: live?.contact.phone,
              });
              const wa = dest.whatsapp ? whatsappHref(body, dest.whatsapp) : "";
              const internSms = dest.phone ? smsHref(body, dest.phone) : "";
              const internTel = dest.phone ? telHref(dest.phone) : "";
              const mail = live?.contact.email
                ? mailtoHref(t.preview || `Protokoll: ${t.pet}`, body, live.contact.email)
                : "";
              const owner = live?.contact.ownerName || "die Frau Doktor";
              const internIds = internDraftDomIds("heute-intern", t.id);
              function markRead(openedDraft: boolean) {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                void markThreadRead({ data: { id: t.id } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error("error" in res && res.error ? res.error : "Protokoll nicht als gelesen markiert.");
                      return;
                    }
                    toast.success(
                      openedDraft ? "Protokoll gelesen. Entwurf ist offen." : "Protokoll gelesen.",
                    );
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Protokoll nicht als gelesen markiert."));
              }
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{internDeskTitle(t)}</p>
                    <p className="text-sm text-muted-foreground">{t.name}</p>
                    <p className="mt-1 text-sm">{t.preview}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {internTel ? (
                      <DeskDraftButton
                        id={internIds.tel}
                        href={internTel}
                        size="default"
                        newTab={false}
                        onAct={() => markRead(true)}
                      >
                        Frau Doktor anrufen
                      </DeskDraftButton>
                    ) : null}
                    {wa ? (
                      <DeskDraftButton id={internIds.wa} href={wa} size="default" onAct={() => markRead(true)}>
                        WhatsApp an {owner}
                      </DeskDraftButton>
                    ) : null}
                    {internSms ? (
                      <DeskDraftButton
                        id={internIds.sms}
                        href={internSms}
                        size="default"
                        variant="outline"
                        newTab={false}
                        onAct={() => markRead(true)}
                      >
                        SMS öffnen
                      </DeskDraftButton>
                    ) : null}
                    {mail ? (
                      <DeskDraftButton id={internIds.mail} href={mail} size="default" variant="outline" onAct={() => markRead(true)}>
                        E-Mail öffnen
                      </DeskDraftButton>
                    ) : null}
                    {(() => {
                      const internSettings = internSettingsTarget({ href: wa, mailHref: mail, smsHref: internSms });
                      if (!internSettings) return null;
                      return (
                        <Button variant="outline" asChild>
                          <Link
                            id={internIds.settings}
                            to="/app/einstellungen"
                            hash={internSettings.hash}
                          >
                            {internSettings.label}
                          </Link>
                        </Button>
                      );
                    })()}
                    <Button variant="outline" asChild>
                      <Link to="/app/nachrichten" search={{ t: t.id }}>
                        Protokoll
                      </Link>
                    </Button>
                    {internGelesenVisible(anzeige) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        id={internIds.gelesen}
                        disabled={anzeigeControl(anzeige).disabled}
                        title={anzeigeControl(anzeige).title}
                        onClick={() => markRead(false)}
                      >
                        Gelesen
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
