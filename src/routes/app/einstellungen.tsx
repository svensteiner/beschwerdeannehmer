import { createFileRoute, getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { VquadratSpiegelCard } from "@/components/desk/vquadrat-spiegel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fetchPraxissoftwareImportPreview, type PraxissoftwareImportPreview } from "@/lib/practice/praxissoftware-import";
import { BUNDESLAENDER, PMS_HINT_ID, PMS_OPTIONS, PRAXISSOFTWARE_HINT } from "@/lib/alma/data";
import { formatHourDayAt, parseHourDayIso, prunePastExtraClosed } from "@/lib/alma/hours";
import { changePracticePassword } from "@/lib/practice/auth";
import { forgetPracticeFact, rememberPracticeFact } from "@/lib/practice/facts";
import {
  loadPracticeProfile,
  savePracticeProfile,
  SIGNUP_HOURS,
  type HourRow,
  type PracticeProfile,
} from "@/lib/practice/profile";
import { invitePracticeStaff, removePracticeStaff, resetPracticeStaffPassword } from "@/lib/practice/staff";
import { INHABERIN_SETTINGS_ERROR, isInhaberin, staffRoleLabel } from "@/lib/practice/staff-role";
import { DESK_SCROLL_MT } from "@/lib/practice/desk-chrome";
import { extraClosedDraftRow, hourDayAnzeigeId, hourDayId, hourDayInputType, hourPresetId, hourRowCount, hourTimeId, HOUR_EXTRA_CLOSED_ID, HOUR_TIME_PRESETS, MAX_HOUR_ROWS, parseSettingsProfile, settingsFromFields } from "@/lib/practice/settings-form";
import { cn } from "@/lib/utils";
import {
  SETTINGS_PASSWORD_CHANGED_TOAST,
  SETTINGS_PASSWORD_FORM_ID,
  SETTINGS_PASSWORD_USERNAME_ID,
  STAFF_INVITE_FORM_ID,
  STAFF_RESET_FORM_ID,
} from "@/lib/practice/desk-password-form";
import { deskDailyHostHint, deskStorageCopyValue, deskStorageIsVolatile, deskBackupCanDownload, deskBackupCanRestore, DESK_BACKUP_CONFIRM, lastTafelBackupLabel, newerTafelBackupIso, readLastTafelBackup, applyTafelBackupDownload, saveTafelBackupDownload, writeLastTafelBackup, writeHolenReloadFlag, clearHolenReloadFlag, holenChosenTafel, holenFileInputOn, holenRestoreNext, holenRestoreAbortIsBenign, holenRestoreReady, holenWaitVisible, waitHolenPendingUntilIdle, holenPendingShouldStay, holenStayAfterFail, HOLEN_RESTORE_NEED_BOTH, TAFEL_HOLEN_WATCHDOG_MS, TAFEL_HOLEN_TOAST, TAFEL_HOLEN_WAIT, TAFEL_HOLEN_WAIT_HREF, TAFEL_HOLEN_SETTINGS_FAIL_ID, TAFEL_BACKUP_FAIL, tafelBackupNoticeOf } from "@/lib/practice/desk-storage";
import { loadHolenFailNotice } from "@/lib/practice/holen-login-fn";
import { backupCipherPassphraseOk } from "@/lib/practice/backup-cipher";
import {
  TAFEL_ANZEIGE_ERROR,
  anzeigeControl,
  deskBackupAnzeigeLine,
  SETTINGS_BACKUP_ANZEIGE_ID,
  SETTINGS_BACKUP_LAST_ID,
  settingsBackupLastVisible,
  SETTINGS_FELDER_ANZEIGE,
  SETTINGS_FELDER_ANZEIGE_ID,
  SETTINGS_LEITUNG_ANZEIGE_ID,
  settingsAnzeigeId,
  settingsFelderVisible,
  SETTINGS_EMAIL_HINT_ID,
  settingsEmailHint,
  leitungPublicShowsLive,
  sprechenAnzeigeAuthLine,
  sprechenDeskOpenVisible,
  gelerntWriteVisible,
  SETTINGS_GELERNT_ANZEIGE,
  SETTINGS_GELERNT_ANZEIGE_ID,
  SETTINGS_GELERNT_LEAD_ID,
  settingsGelerntLead,
  zugangWriteVisible,
  SETTINGS_ZUGANG_ANZEIGE,
  SETTINGS_ZUGANG_ANZEIGE_ID,
  settingsSaveVisible,
  SETTINGS_SAVE_ANZEIGE_ID,
} from "@/lib/practice/tafel-anzeige";

const appRoute = getRouteApi("/app");

export const Route = createFileRoute("/app/einstellungen")({
  loader: () => loadPracticeProfile(),
  component: SettingsPage,
});

function SettingsPage() {
  const loaded = Route.useLoaderData();
  const board = appRoute.useLoaderData();
  const anzeige = Boolean(board.ok && board.anzeige);
  const router = useRouter();
  const initial = loaded.ok && loaded.profile ? loaded.profile : null;
  const facts = loaded.ok ? loaded.facts : [];
  const staff = loaded.ok ? loaded.staff : [];
  const storage = loaded.ok ? loaded.storage : null;
  const llm = loaded.ok ? loaded.llm : null;
  const pms = loaded.ok ? loaded.pms : null;
  const selfRole = staff.find((row) => row.self)?.role;
  const canInvite = isInhaberin(selfRole) || staff.length === 0;
  const canEditPractice = canInvite;
  const lock = anzeigeControl(anzeige);
  const practiceOff = !canInvite || lock.disabled;
  const [busy, setBusy] = useState(false);
  const [factBusy, setFactBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<PraxissoftwareImportPreview | null>(null);
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
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newFact, setNewFact] = useState("");
  const [form, setForm] = useState(() => emptyForm(initial));
  const [origin, setOrigin] = useState("");
  const [backupLast, setBackupLast] = useState<string | null>(() =>
    board.ok ? board.tafelBackupAt ?? null : null,
  );
  const boardBackupAt = board.ok ? board.tafelBackupAt : null;
  const shownBackup = newerTafelBackupIso(backupLast, boardBackupAt);
  const backupAnzeigeLine = deskBackupAnzeigeLine(anzeige);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const profileStamp = initial
    ? `${initial.id}\0${initial.email}\0${initial.whatsapp}\0${initial.nachtdienstPhone}\0${initial.nachtdienstName}\0${initial.nachtdienstNote}\0${initial.phone}\0${initial.street}\0${initial.zip}\0${initial.locationHint}\0${initial.city}\0${initial.bundesland}\0${initial.notes}\0${initial.ownerName}\0${initial.retentionDays}\0${initial.hours.map((h) => `${h.day}:${h.time}`).join("|")}`
    : "";
  const formProfileStampRef = useRef(profileStamp);
  useEffect(() => {
    if (!initial) return;
    if (formProfileStampRef.current === profileStamp) return;
    formProfileStampRef.current = profileStamp;
    setForm(emptyForm(initial));
  }, [initial, profileStamp]);

  useEffect(() => {
    const store = typeof localStorage === "undefined" ? null : localStorage;
    const last = newerTafelBackupIso(
      readLastTafelBackup(store, initial?.id),
      boardBackupAt,
    );
    if (last && store && initial?.id) writeLastTafelBackup(store, new Date(last), initial.id);
    setBackupLast(last);
  }, [initial?.id, board.ok, boardBackupAt]);

  if (!initial) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">Einstellungen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ordination nicht gefunden.</p>
      </div>
    );
  }

  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((curr) => ({ ...curr, [key]: value }));
  }

  function readField(id: string) {
    const el = document.getElementById(id);
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      return el.value;
    }
    return "";
  }

  function saveFromDom() {
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    if (!canEditPractice) {
      toast.error(INHABERIN_SETTINGS_ERROR);
      return;
    }
    if (!initial) {
      return;
    }
    const next = settingsFromFields(
      readField,
      hourRowCount((id) => Boolean(document.getElementById(id)), form.hours.length),
      form.hours,
      form.consentEnabled,
    );
    const hours = prunePastExtraClosed(next.hours);
    const saved = { ...next, hours };
    const parsed = parseSettingsProfile(saved, {
      loginEmail: staff.find((row) => row.self)?.email ?? "",
      bundesland: initial.bundesland,
      locationHint: initial.locationHint,
      name: initial.name,
      nachtdienstName: initial.nachtdienstName,
      nachtdienstPhone: initial.nachtdienstPhone,
      notes: initial.notes,
      ownerName: initial.ownerName,
      whatsapp: initial.whatsapp,
      nachtdienstNote: initial.nachtdienstNote,
      zip: initial.zip,
      street: initial.street,
      email: initial.email,
      phone: initial.phone,
      city: initial.city,
      retentionDays: initial.retentionDays,
    });
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const kept = { ...saved, ...parsed.value, retentionDays: String(parsed.value.retentionDays) };
    setForm(kept);
    setBusy(true);
    void savePracticeProfile({ data: { ...kept, retentionDays: parsed.value.retentionDays } })
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Gespeichert. Silvia kennt die neuen Zeiten beim nächsten Anruf.");
        const y = window.scrollY;
        const prev = history.scrollRestoration;
        history.scrollRestoration = "manual";
        void router.invalidate().then(() => {
          const pin = () => window.scrollTo(0, y);
          pin();
          requestAnimationFrame(() => {
            pin();
            requestAnimationFrame(pin);
          });
          window.setTimeout(pin, 120);
          history.scrollRestoration = prev;
        });
      })
      .catch(() => toast.error("Speichern fehlgeschlagen."))
      .finally(() => setBusy(false));
  }

  /** Read-only: holt Ärzte/Räume/Zeiten vom Connector. Schreibt nichts, öffnet nur den Review-Dialog. */
  function runPraxissoftwareImport() {
    if (!canEditPractice) {
      toast.error(INHABERIN_SETTINGS_ERROR);
      return;
    }
    setImportBusy(true);
    void fetchPraxissoftwareImportPreview()
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setImportPreview(res);
        setImportOpen(true);
      })
      .catch(() => toast.error("Übernahme aus der Praxissoftware fehlgeschlagen."))
      .finally(() => setImportBusy(false));
  }

  /** Explizite Bestätigung: füllt nur die Formularfelder. Gespeichert wird erst mit Einstellungen-Speichern. */
  function applyPraxissoftwareImport() {
    if (!importPreview || !importPreview.ok) return;
    setForm((curr) => ({
      ...curr,
      vets: importPreview.vets || curr.vets,
      resources: importPreview.resources || curr.resources,
      hours: importPreview.hoursFound ? importPreview.hours : curr.hours,
    }));
    setImportOpen(false);
    toast.success("Übernommen. Bitte prüfen und Speichern nicht vergessen.");
  }

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Einstellungen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Adresse, Zeiten und Nachtdienst – Silvia spricht ab dann für Ihre Ordination.
      </p>
      {anzeige ? (
        <p id={SETTINGS_FELDER_ANZEIGE_ID} className="mt-3 max-w-2xl text-sm text-foreground">
          {SETTINGS_FELDER_ANZEIGE}
        </p>
      ) : null}
      {!canEditPractice ? (
        <p className="mt-3 max-w-2xl rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          {INHABERIN_SETTINGS_ERROR} Passwort und was Silvia gelernt hat bleiben bei Ihnen.
        </p>
      ) : null}
      <div className="mt-8 grid max-w-2xl gap-6">
        <section id="adresse" className={cn(DESK_SCROLL_MT, "grid gap-4 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Ordination</h2>
          {settingsFelderVisible(anzeige) ? (
            <>
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              required
              disabled={practiceOff}
              title={lock.title}
              value={form.name}
              onChange={(e) => patch("name", e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inhaberin" htmlFor="ownerName">
              <Input
                id="ownerName"
                required
                className={DESK_SCROLL_MT}
                disabled={practiceOff}
                title={lock.title}
                value={form.ownerName}
                onChange={(e) => patch("ownerName", e.target.value)}
              />
            </Field>
            <Field label="Straße" htmlFor="street">
              <Input
                id="street"
                disabled={practiceOff}
                title={lock.title}
                value={form.street}
                onChange={(e) => patch("street", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="PLZ" htmlFor="zip">
              <Input id="zip" disabled={practiceOff} title={lock.title} value={form.zip} onChange={(e) => patch("zip", e.target.value)} />
            </Field>
            <Field label="Ort" htmlFor="city">
              <Input
                id="city"
                disabled={practiceOff}
                title={lock.title}
                value={form.city}
                onChange={(e) => patch("city", e.target.value)}
              />
            </Field>
            <Field label="Bundesland" htmlFor="bundesland">
              <select
                id="bundesland"
                disabled={practiceOff}
                title={lock.title}
                className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                value={form.bundesland}
                onChange={(e) => patch("bundesland", e.target.value)}
              >
                <option value="">Bitte wählen</option>
                {BUNDESLAENDER.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Anreise" htmlFor="locationHint">
            <Textarea
              id="locationHint"
              disabled={practiceOff}
              title={lock.title}
              value={form.locationHint}
              onChange={(e) => patch("locationHint", e.target.value)}
              placeholder="z. B. S-Bahn Gloggnitz, Parkplatz hinter dem Haus, Hund an der Leine"
            />
          </Field>
            </>
          ) : (
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd id={settingsAnzeigeId("name")}>{form.name.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inhaberin</dt>
                <dd id={settingsAnzeigeId("ownerName")}>{form.ownerName.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Straße</dt>
                <dd id={settingsAnzeigeId("street")}>{form.street.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">PLZ</dt>
                <dd id={settingsAnzeigeId("zip")}>{form.zip.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ort</dt>
                <dd id={settingsAnzeigeId("city")}>{form.city.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Bundesland</dt>
                <dd id={settingsAnzeigeId("bundesland")}>{form.bundesland.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Anreise</dt>
                <dd id={settingsAnzeigeId("locationHint")}>{form.locationHint.trim() || "—"}</dd>
              </div>
            </dl>
          )}
          <p className="text-xs text-muted-foreground">
            Das sagt Silvia, wenn jemand nach U-Bahn, Parken oder Anreise fragt. Ohne Text nimmt sie Straße und Ort –
            nicht die Huber-Demo in der Josefstadt.
          </p>
        </section>

        <section id="leitung" className={cn(DESK_SCROLL_MT, "grid gap-4 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Leitung</h2>
          {settingsFelderVisible(anzeige) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefon" htmlFor="phone">
              <Input
                id="phone"
                disabled={practiceOff}
                title={lock.title}
                value={form.phone}
                onChange={(e) => patch("phone", e.target.value)}
                placeholder="0316 … oder 0664 …"
              />
            </Field>
            <Field label="WhatsApp / SMS" htmlFor="whatsapp">
              <Input
                id="whatsapp"
                className={DESK_SCROLL_MT}
                disabled={practiceOff}
                title={lock.title}
                value={form.whatsapp}
                onChange={(e) => patch("whatsapp", e.target.value)}
                placeholder="0664 …"
              />
            </Field>
            <Field label="Inbox der Frau Doktor" htmlFor="email">
              <Input
                id="email"
                type="email"
                className={DESK_SCROLL_MT}
                disabled={practiceOff}
                title={lock.title}
                value={form.email}
                onChange={(e) => patch("email", e.target.value)}
                placeholder="rezeption@ordination.at"
              />
            </Field>
            <Field label="Praxissoftware" htmlFor="pms">
              <select
                id="pms"
                disabled={practiceOff}
                title={lock.title}
                className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                value={form.pms}
                onChange={(e) => patch("pms", e.target.value)}
              >
                {PMS_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Telefon</dt>
                <dd id={settingsAnzeigeId("phone")}>{form.phone.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">WhatsApp / SMS</dt>
                <dd id={settingsAnzeigeId("whatsapp")}>{form.whatsapp.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inbox der Frau Doktor</dt>
                <dd id={settingsAnzeigeId("email")}>{form.email.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Praxissoftware</dt>
                <dd id={settingsAnzeigeId("pms")}>{form.pms.trim() || "—"}</dd>
              </div>
            </dl>
          )}
          <p id={PMS_HINT_ID} className="text-xs text-muted-foreground">
            {PRAXISSOFTWARE_HINT}
          </p>
          {pms ? (
            <p
              id="pms-status"
              className={pms.connected ? "text-xs text-muted-foreground" : "text-xs text-flag"}
            >
              {pms.line}
            </p>
          ) : null}
          {pms ? (
            <p id="pms-booking-status" className="text-xs text-muted-foreground">
              {pms.bookingLine}
            </p>
          ) : null}
          {pms ? (
            <p id="pms-bridge-status" className="text-xs text-muted-foreground">
              {pms.bridgeLine}
            </p>
          ) : null}
          <VquadratSpiegelCard
            prefix="settings"
            rows={board.ok ? board.vquadratSpiegel : []}
            anzeige={anzeige}
          />
          <p id="whatsapp-hint" className="text-xs text-muted-foreground">
            Handy der Frau Doktor für Intern-WhatsApp. Festnetz bleibt bei Telefon und SMS.
          </p>
          <p id={SETTINGS_EMAIL_HINT_ID} className="text-xs text-muted-foreground">
            {settingsEmailHint(anzeige)}
          </p>
          {initial.slug && leitungPublicShowsLive(anzeige) ? (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-sm font-medium">Öffentliche Leitung</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Diesen Link können Anrufer öffnen, ohne sich anzumelden. Das Gespräch landet auf
                Ihrer Praxistafel.
              </p>
              <p className="mt-2 break-all font-mono text-xs">
                {origin ? `${origin}/leitung/${initial.slug}` : `/leitung/${initial.slug}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = `${origin || window.location.origin}/leitung/${initial.slug}`;
                    void navigator.clipboard.writeText(url).then(
                      () => toast.success("Link kopiert."),
                      () => toast.error("Kopieren nicht möglich."),
                    );
                  }}
                >
                  Link kopieren
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link to="/leitung/$slug" params={{ slug: initial.slug }}>
                    Vorschau
                  </Link>
                </Button>
              </div>
            </div>
          ) : initial.slug ? (
            <p id={SETTINGS_LEITUNG_ANZEIGE_ID} className="text-sm text-muted-foreground">
              {sprechenAnzeigeAuthLine(true)}
            </p>
          ) : null}
        </section>

        <section id="ersteinrichtung" className={cn(DESK_SCROLL_MT, "grid gap-4 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Ersteinrichtung</h2>
          <p className="text-sm text-muted-foreground">
            Ärzte, Räume und Öffnungszeiten von Hand pflegen — oder aus der Praxissoftware übernehmen. Nichts wird
            still überschrieben: erst der Review-Dialog, danach Einstellungen-Speichern.
          </p>
          {settingsFelderVisible(anzeige) ? (
            <Button
              type="button"
              variant="outline"
              disabled={practiceOff || importBusy}
              title={lock.title}
              onClick={runPraxissoftwareImport}
            >
              {importBusy ? "Wird geholt…" : "Aus Praxissoftware übernehmen"}
            </Button>
          ) : null}
          <Field label="Ärzte" htmlFor="vets">
            <Textarea
              id="vets"
              disabled={practiceOff}
              title={lock.title}
              value={form.vets}
              onChange={(e) => patch("vets", e.target.value)}
              placeholder={"Ein Name je Zeile, z. B.\nDr. Stein\nDr. Berger"}
            />
          </Field>
          <Field label="Räume" htmlFor="resources">
            <Textarea
              id="resources"
              disabled={practiceOff}
              title={lock.title}
              value={form.resources}
              onChange={(e) => patch("resources", e.target.value)}
              placeholder={"Ein Raum je Zeile, z. B.\nOP 1\nSprechzimmer 2"}
            />
          </Field>
          <Field label="So soll Silvia sich verhalten" htmlFor="behavior">
            <Textarea
              id="behavior"
              disabled={practiceOff}
              title={lock.title}
              value={form.behavior}
              onChange={(e) => patch("behavior", e.target.value)}
              placeholder="Freitext, z. B. Tonfall, was sie nie sagen soll, Besonderheiten der Praxis."
            />
            <p className="text-sm text-muted-foreground">
              Freitext, z. B. Tonfall, was sie nie sagen soll, Besonderheiten der Praxis. Max. 2000 Zeichen.
            </p>
          </Field>
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <input
                id="consentEnabled"
                type="checkbox"
                disabled={practiceOff}
                title={lock.title}
                checked={form.consentEnabled}
                onChange={(e) => patch("consentEnabled", e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="consentEnabled">Einwilligungsansage zu Gesprächsbeginn</Label>
            </div>
            <Field label="Text der Einwilligungsansage" htmlFor="consentNote">
              <Input
                id="consentNote"
                disabled={practiceOff || !form.consentEnabled}
                title={lock.title}
                value={form.consentNote}
                onChange={(e) => patch("consentNote", e.target.value)}
                maxLength={200}
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              Wird nach dem Grüß Gott gesagt und mit Zeitstempel am Anruf vermerkt.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            <Link to="/app/status" className="underline underline-offset-2">
              Status-Seite ansehen
            </Link>{" "}
            — läuft alles, was Silvia für den Betrieb braucht.
          </p>
        </section>

        <section id="zeiten" className={cn(DESK_SCROLL_MT, "grid gap-4 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Ordinationszeiten</h2>
          <p className="text-sm text-muted-foreground">
            {settingsFelderVisible(anzeige)
              ? "Silvia legt nur Slots in diesen Fenstern. Chips setzen das Fenster; die Tierarzthelferin darf die Uhrzeit danach noch tippen. Ein extra geschlossener Tag ist ein Datum (`2026-08-27`), nicht der Wochentag — sonst fällt jeder Donnerstag aus. Extra-Tage sind ein Datumsfeld; Heute kann denselben Tag wieder öffnen, ohne die Wochentag-Zeile zu ändern."
              : "Silvia legt nur Slots in diesen Fenstern."}
          </p>
          {settingsFelderVisible(anzeige) ? (
          <>
          <ul className="grid gap-3">
            {form.hours.map((row, i) => {
              const dayType = hourDayInputType(row.day);
              return (
              <li key={i} className="grid gap-2">
                <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                <div className="flex min-w-0 flex-col gap-1">
                <Input
                  id={hourDayId(i)}
                  type={dayType}
                  aria-label={parseHourDayIso(row.day) ? `Extra geschlossen ${i + 1}` : `Tag ${i + 1}`}
                  disabled={practiceOff}
                  title={lock.title}
                  value={row.day}
                  onChange={(e) => {
                    const day = e.target.value;
                    setForm((curr) => {
                      const current = curr.hours[i];
                      if (!current) return curr;
                      return { ...curr, hours: replaceHour(curr.hours, i, { ...current, day }) };
                    });
                  }}
                  onInput={
                    dayType === "date"
                      ? (e) => {
                          const day = (e.currentTarget as HTMLInputElement).value;
                          setForm((curr) => {
                            const current = curr.hours[i];
                            if (!current) return curr;
                            return { ...curr, hours: replaceHour(curr.hours, i, { ...current, day }) };
                          });
                        }
                      : undefined
                  }
                />
                {dayType === "date" ? (
                  <p id={hourDayAnzeigeId(i)} className="text-[11px] text-muted-foreground">
                    {formatHourDayAt(row.day)}
                  </p>
                ) : null}
                </div>
                <Input
                  id={hourTimeId(i)}
                  aria-label={`Zeit ${row.day}`}
                  disabled={practiceOff}
                  title={lock.title}
                  value={row.time}
                  onChange={(e) =>
                    patch("hours", replaceHour(form.hours, i, { ...row, time: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={practiceOff || form.hours.length <= 1}
                  aria-label={`${row.day || `Tag ${i + 1}`} entfernen`}
                  onClick={() =>
                    setForm((curr) =>
                      curr.hours.length <= 1
                        ? curr
                        : { ...curr, hours: curr.hours.filter((_, j) => j !== i) },
                    )
                  }
                >
                  Entfernen
                </Button>
                </div>
                <div className="flex flex-wrap gap-1 sm:pl-[8.5rem]">
                  {HOUR_TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      id={hourPresetId(i, preset.id)}
                      type="button"
                      disabled={practiceOff}
                      aria-pressed={row.time.trim() === preset.time}
                      className={cn(
                        "min-h-11 rounded-md border px-2.5 text-xs font-medium",
                        row.time.trim() === preset.time
                          ? "border-primary bg-secondary"
                          : "border-border bg-card hover:bg-secondary/60",
                      )}
                      onClick={() =>
                        setForm((curr) => {
                          const current = curr.hours[i];
                          if (!current) return curr;
                          return {
                            ...curr,
                            hours: replaceHour(curr.hours, i, { ...current, time: preset.time }),
                          };
                        })
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={practiceOff || form.hours.length >= MAX_HOUR_ROWS}
              data-testid="add-hour-row"
              onClick={() =>
                setForm((curr) =>
                  curr.hours.length >= MAX_HOUR_ROWS
                    ? curr
                    : { ...curr, hours: [...curr.hours, { day: "", time: "" }] },
                )
              }
            >
              Tag hinzufügen
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              id={HOUR_EXTRA_CLOSED_ID}
              disabled={practiceOff || form.hours.length >= MAX_HOUR_ROWS}
              onClick={() =>
                setForm((curr) =>
                  curr.hours.length >= MAX_HOUR_ROWS
                    ? curr
                    : {
                        ...curr,
                        hours: [...curr.hours, extraClosedDraftRow(curr.hours)],
                      },
                )
              }
            >
              Extra geschlossen
            </Button>
          </div>
          </>
          ) : (
            <dl className="grid gap-2 text-sm">
              {form.hours.map((row, i) => (
                <div key={`${row.day}-${i}`}>
                  <dt className="text-muted-foreground">{formatHourDayAt(row.day) || row.day || `Tag ${i + 1}`}</dt>
                  <dd id={settingsAnzeigeId(`hour-${i}`)}>{row.time.trim() || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section id="nachtdienst" className={cn(DESK_SCROLL_MT, "grid gap-4 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Nachtdienst</h2>
          <p className="text-xs text-muted-foreground">
            Handy oder Festnetz der Bereitschaft — Silvia erfindet keine Kliniknummer.
          </p>
          {settingsFelderVisible(anzeige) ? (
            <>
          <Field label="Stelle" htmlFor="nachtdienstName">
            <Input
              id="nachtdienstName"
              disabled={practiceOff}
              title={lock.title}
              value={form.nachtdienstName}
              onChange={(e) => patch("nachtdienstName", e.target.value)}
            />
          </Field>
          <Field label="Telefon" htmlFor="nachtdienstPhone">
            <Input
              id="nachtdienstPhone"
              disabled={practiceOff}
              title={lock.title}
              autoComplete="tel"
              inputMode="tel"
              placeholder="0316 … oder 0664 …"
              value={form.nachtdienstPhone}
              onChange={(e) => patch("nachtdienstPhone", e.target.value)}
            />
          </Field>
          <Field label="Hinweis" htmlFor="nachtdienstNote">
            <Input
              id="nachtdienstNote"
              disabled={practiceOff}
              title={lock.title}
              value={form.nachtdienstNote}
              onChange={(e) => patch("nachtdienstNote", e.target.value)}
            />
          </Field>
          <Field label="Interne Notiz für Silvia" htmlFor="notes">
            <Textarea
              id="notes"
              disabled={practiceOff}
              title={lock.title}
              value={form.notes}
              onChange={(e) => patch("notes", e.target.value)}
              placeholder="z. B. Mittwoch nur Kastrationen, keine neuen Katzen vor 14:30"
            />
          </Field>
          <Field label="Aufbewahrung Anrufe/Protokolle (Tage)" htmlFor="retentionDays">
            <Input
              id="retentionDays"
              type="number"
              min={7}
              max={3650}
              disabled={practiceOff}
              title={lock.title}
              value={form.retentionDays}
              onChange={(e) => patch("retentionDays", e.target.value)}
            />
          </Field>
            </>
          ) : (
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Stelle</dt>
                <dd id={settingsAnzeigeId("nachtdienstName")}>{form.nachtdienstName.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Telefon</dt>
                <dd id={settingsAnzeigeId("nachtdienstPhone")}>{form.nachtdienstPhone.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hinweis</dt>
                <dd id={settingsAnzeigeId("nachtdienstNote")}>{form.nachtdienstNote.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Interne Notiz für Silvia</dt>
                <dd id={settingsAnzeigeId("notes")}>{form.notes.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Aufbewahrung Anrufe/Protokolle (Tage)</dt>
                <dd id={settingsAnzeigeId("retentionDays")}>{form.retentionDays.trim() || "—"}</dd>
              </div>
            </dl>
          )}
        </section>

        <section id="gelernt" className={cn(DESK_SCROLL_MT, "grid gap-4 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Was Silvia gelernt hat</h2>
          <p id={SETTINGS_GELERNT_LEAD_ID} className="mt-0 text-sm text-muted-foreground">
            {settingsGelerntLead(anzeige)}
            {sprechenDeskOpenVisible(anzeige) ? (
              <>
                {" "}
                Am Telefon geht das auch unter{" "}
                <Link to="/app/training" className="text-primary underline-offset-2 hover:underline">
                  Training
                </Link>
                .
              </>
            ) : null}
          </p>
          {gelerntWriteVisible(anzeige) ? (
          <div className="grid gap-2">
            <Label htmlFor="new-fact">Neuer Hinweis</Label>
            <Textarea
              id="new-fact"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="z. B. Mittwoch nur Kastrationen."
              disabled={lock.disabled}
              title={lock.title}
            />
            <Button
              id="settings-fact-merken"
              type="button"
              variant="outline"
              disabled={factBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
              onClick={() => {
                if (anzeige) {
                  toast.error(anzeigeControl(true).title);
                  return;
                }
                const field = document.getElementById("new-fact");
                const value = field instanceof HTMLTextAreaElement ? field.value : newFact;
                setNewFact(value);
                setFactBusy(true);
                void rememberPracticeFact({ data: { fact: value } })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error("error" in res && res.error ? res.error : "Hinweis nicht gespeichert.");
                      return;
                    }
                    toast.success(res.duplicate ? "Hatte ich schon." : "Gemerkt. Gilt beim nächsten Anruf.");
                    setNewFact("");
                    if (field instanceof HTMLTextAreaElement) field.value = "";
                    void router.invalidate();
                  })
                  .catch(() => toast.error("Hinweis nicht gespeichert."))
                  .finally(() => setFactBusy(false));
              }}
            >
              {factBusy ? "Merkt…" : "Merken"}
            </Button>
          </div>
          ) : (
            <p id={SETTINGS_GELERNT_ANZEIGE_ID} className="text-sm text-foreground">
              {SETTINGS_GELERNT_ANZEIGE}
            </p>
          )}
          {facts.length ? (
            <ul className="grid gap-2">
              {facts.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <span>{row.fact}</span>
                  {gelerntWriteVisible(anzeige) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    id={`settings-fact-delete-${row.id}`}
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeigeControl(anzeige).title}
                    onClick={() => {
                      if (anzeige) {
                        toast.error(anzeigeControl(true).title);
                        return;
                      }
                      void forgetPracticeFact({ data: { id: row.id, expectedFact: row.fact } })
                        .then((res) => {
                          if (!res.ok) {
                            toast.error("error" in res && res.error ? res.error : "Löschen fehlgeschlagen.");
                            return;
                          }
                          toast.success("Hinweis gelöscht.");
                          void router.invalidate();
                        })
                        .catch(() => toast.error("Löschen fehlgeschlagen."));
                    }}
                  >
                    Löschen
                  </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {gelerntWriteVisible(anzeige)
                ? "Noch nichts. Oben einen Satz merken, oder Silvia unter Trainieren anrufen."
                : "Noch nichts. Hinweise erscheinen hier, sobald sie auf dem Schreib-Rechner liegen."}
            </p>
          )}
        </section>

        {canEditPractice && settingsSaveVisible(anzeige) ? (
          <Button
            id="settings-save"
            type="button"
            disabled={busy || anzeigeControl(anzeige).disabled}
            title={anzeigeControl(anzeige).title}
            onClick={() => saveFromDom()}
          >
            {busy ? "Speichert…" : "Speichern"}
          </Button>
        ) : canEditPractice && anzeige ? (
          <p id={SETTINGS_SAVE_ANZEIGE_ID} className="text-sm text-foreground">
            {TAFEL_ANZEIGE_ERROR}
          </p>
        ) : null}
      </div>

      <section
        id="settings-zugang"
        data-reset-for={resetFor ?? ""}
        className={cn(DESK_SCROLL_MT, "mt-8 grid max-w-2xl gap-4 rounded-xl border border-border bg-card p-4")}
      >
        <h2 className="font-display text-xl font-semibold">Zugang</h2>
        <p className="text-sm text-muted-foreground">
          Inhaberin und Tierarzthelferin melden sich mit eigener E-Mail an. Ohne SMTP legt die Inhaberin das Passwort hier fest
          und sagt es der Kollegin — auch wenn sie es vergessen hat. Das eigene Passwort bleibt gültig, bis das neue
          gespeichert ist.
        </p>
        <ul className="grid gap-2">
          {staff.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{row.name}</span>
                  {row.self ? " · Sie" : ""}
                  <span className="text-muted-foreground">
                    {" "}
                    · {staffRoleLabel(row.role)} · {row.email}
                  </span>
                </span>
                {canInvite && !row.self && zugangWriteVisible(anzeige) ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id={`staff-reset-open-${row.id}`}
                      disabled={anzeigeControl(anzeige).disabled}
                      title={anzeigeControl(anzeige).title}
                      onClick={() => setResetFor((curr) => (curr === row.id ? null : row.id))}
                    >
                      Passwort setzen
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={anzeigeControl(anzeige).disabled}
                      title={anzeigeControl(anzeige).title}
                      onClick={() => {
                        if (anzeige) {
                          toast.error(anzeigeControl(true).title);
                          return;
                        }
                        void removePracticeStaff({ data: { id: row.id } })
                          .then((res) => {
                            if (!res.ok) {
                              toast.error(res.error);
                              return;
                            }
                            toast.success("Zugang entfernt.");
                            if (resetFor === row.id) setResetFor(null);
                            void router.invalidate();
                          })
                          .catch(() => toast.error("Zugang nicht entfernt."));
                      }}
                    >
                      Entfernen
                    </Button>
                  </div>
                ) : null}
              </div>
              {canInvite && zugangWriteVisible(anzeige) && resetFor === row.id ? (
                <form
                  id={STAFF_RESET_FORM_ID}
                  className="grid gap-2 border-t border-border pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (anzeige) {
                      toast.error(anzeigeControl(true).title);
                      return;
                    }
                    const password = readField("staff-reset-password");
                    const confirm = readField("staff-reset-confirm");
                    setResetBusy(true);
                    void resetPracticeStaffPassword({ data: { id: row.id, password, confirm } })
                      .then((res) => {
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        toast.success("Passwort gesetzt. Sagen Sie es der Kollegin — Silvia sendet keine E-Mail.");
                        for (const id of ["staff-reset-password", "staff-reset-confirm"]) {
                          const el = document.getElementById(id);
                          if (el instanceof HTMLInputElement) el.value = "";
                        }
                        setResetFor(null);
                      })
                      .catch(() => toast.error("Passwort nicht gesetzt."))
                      .finally(() => setResetBusy(false));
                  }}
                >
                  <p className="text-xs text-muted-foreground">
                    Neues Passwort für {row.name}. Silvia sendet keine E-Mail — sagen Sie es der Kollegin.
                  </p>
                  <label className="sr-only" htmlFor="staff-reset-username">
                    E-Mail
                  </label>
                  <Input
                    id="staff-reset-username"
                    name="username"
                    type="email"
                    autoComplete="username"
                    defaultValue={row.email}
                    readOnly
                    className="sr-only"
                    tabIndex={-1}
                  />
                  <Field label="Neues Passwort" htmlFor="staff-reset-password">
                    <Input id="staff-reset-password" name="new-password" type="password" autoComplete="new-password" minLength={8} disabled={lock.disabled} title={lock.title} />
                  </Field>
                  <Field label="Neues Passwort wiederholen" htmlFor="staff-reset-confirm">
                    <Input id="staff-reset-confirm" name="new-password-confirm" type="password" autoComplete="new-password" minLength={8} disabled={lock.disabled} title={lock.title} />
                  </Field>
                  <Button
                    id="staff-reset-save"
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={resetBusy || anzeigeControl(anzeige).disabled}
                    title={anzeigeControl(anzeige).title}
                  >
                    {resetBusy ? "Setzt…" : "Passwort speichern"}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {canInvite && zugangWriteVisible(anzeige) ? (
          <form
            id={STAFF_INVITE_FORM_ID}
            className="grid gap-4 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (anzeige) {
                toast.error(anzeigeControl(true).title);
                return;
              }
              const name = readField("staff-name");
              const email = readField("staff-email");
              const role = readField("staff-role");
              const password = readField("staff-password");
              const confirm = readField("staff-confirm");
              setInviteBusy(true);
              void invitePracticeStaff({ data: { name, email, password, confirm, role } })
                .then((res) => {
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Kollegin angelegt. Sie kann sich mit dieser E-Mail anmelden.");
                  for (const id of ["staff-name", "staff-email", "staff-password", "staff-confirm"]) {
                    const el = document.getElementById(id);
                    if (el instanceof HTMLInputElement) el.value = "";
                  }
                  void router.invalidate();
                })
                .catch(() => toast.error("Kollegin nicht angelegt."))
                .finally(() => setInviteBusy(false));
            }}
          >
            <p className="text-sm font-medium">Kollegin anlegen</p>
            <Field label="Name" htmlFor="staff-name">
              <Input id="staff-name" name="name" autoComplete="off" disabled={lock.disabled} title={lock.title} />
            </Field>
            <Field label="E-Mail" htmlFor="staff-email">
              <Input id="staff-email" name="email" type="email" autoComplete="off" disabled={lock.disabled} title={lock.title} />
            </Field>
            <Field label="Rolle" htmlFor="staff-role">
              <select
                id="staff-role"
                name="role"
                className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                defaultValue="kassa"
                disabled={lock.disabled}
                title={lock.title}
              >
                <option value="kassa">Tierarzthelferin</option>
                <option value="inhaberin">Inhaberin</option>
              </select>
            </Field>
            <Field label="Passwort" htmlFor="staff-password">
              <Input id="staff-password" name="new-password" type="password" autoComplete="new-password" minLength={8} disabled={lock.disabled} title={lock.title} />
            </Field>
            <Field label="Passwort wiederholen" htmlFor="staff-confirm">
              <Input id="staff-confirm" name="new-password-confirm" type="password" autoComplete="new-password" minLength={8} disabled={lock.disabled} title={lock.title} />
            </Field>
            <Button
              id="staff-invite"
              type="submit"
              variant="outline"
              disabled={inviteBusy || anzeigeControl(anzeige).disabled}
              title={anzeigeControl(anzeige).title}
            >
              {inviteBusy ? "Legt an…" : "Kollegin anlegen"}
            </Button>
          </form>
        ) : anzeige ? (
          <p id={SETTINGS_ZUGANG_ANZEIGE_ID} className="text-sm text-foreground">
            {SETTINGS_ZUGANG_ANZEIGE}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Nur die Inhaberin legt Kolleginnen an.</p>
        )}
        {zugangWriteVisible(anzeige) ? (
        <form
          id={SETTINGS_PASSWORD_FORM_ID}
          className="grid gap-4 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (anzeige) {
              toast.error(anzeigeControl(true).title);
              return;
            }
            const current = readField("current-password");
            const next = readField("new-password");
            const confirm = readField("confirm-password");
            setPwBusy(true);
            void changePracticePassword({ data: { current, next, confirm } })
              .then((res) => {
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(SETTINGS_PASSWORD_CHANGED_TOAST);
                for (const id of ["current-password", "new-password", "confirm-password"]) {
                  const el = document.getElementById(id);
                  if (el instanceof HTMLInputElement) el.value = "";
                }
              })
              .catch(() => toast.error("Passwort nicht geändert."))
              .finally(() => setPwBusy(false));
          }}
        >
          <p className="text-sm font-medium">Eigenes Passwort</p>
          <label className="sr-only" htmlFor={SETTINGS_PASSWORD_USERNAME_ID}>
            E-Mail
          </label>
          <Input
            id={SETTINGS_PASSWORD_USERNAME_ID}
            name="username"
            type="email"
            autoComplete="username"
            defaultValue={staff.find((row) => row.self)?.email ?? ""}
            readOnly
            className="sr-only"
            tabIndex={-1}
          />
          <Field label="Bisheriges Passwort" htmlFor="current-password">
            <Input id="current-password" name="current-password" type="password" autoComplete="current-password" disabled={lock.disabled} title={lock.title} />
          </Field>
          <Field label="Neues Passwort" htmlFor="new-password">
            <Input id="new-password" name="new-password" type="password" autoComplete="new-password" minLength={8} disabled={lock.disabled} title={lock.title} />
          </Field>
          <Field label="Neues Passwort wiederholen" htmlFor="confirm-password">
            <Input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" minLength={8} disabled={lock.disabled} title={lock.title} />
          </Field>
          <Button
            id="settings-password-save"
            type="submit"
            variant="outline"
            disabled={pwBusy || anzeigeControl(anzeige).disabled}
            title={anzeigeControl(anzeige).title}
          >
            {pwBusy ? "Ändert…" : "Passwort ändern"}
          </Button>
        </form>
        ) : null}
      </section>

      {storage ? (
        <section id="settings-data" className={cn(DESK_SCROLL_MT, "mt-8 grid gap-3 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Tafel-Daten</h2>
          <p id="settings-data-host" className="text-sm text-muted-foreground">
            {deskDailyHostHint(storage)}
          </p>
          {board.ok && board.restart ? (
            <p id="settings-restart" className="text-sm">
              <strong>{board.restart.title}</strong> {board.restart.body}
            </p>
          ) : null}
          {storage.kind === "postgres" ? (
            <p className="text-sm text-muted-foreground">
              Die Ordination liegt in Postgres. Sicherung macht die Datenbank, nicht ein Ordner auf diesem Rechner.
            </p>
          ) : (
            <>
              {backupAnzeigeLine ? null : (
                <p className="text-sm text-muted-foreground">
                  Termine, Anrufe und Akten liegen in diesem Ordner. Zum Sichern <strong>Tafel sichern</strong> — die Datei
                  auf den Desktop oder einen Stick. Den Ordner kopieren geht weiter. Nicht in git legen.
                </p>
              )}
              <p id="settings-data-dir" className="break-all font-mono text-xs">
                {storage.path}
              </p>
              {backupAnzeigeLine ? (
                <p id={SETTINGS_BACKUP_ANZEIGE_ID} className="text-sm">
                  {backupAnzeigeLine}
                </p>
              ) : (
                <p id="settings-backup-restore-hint" className="text-sm text-muted-foreground">
                  Zum Wiederherstellen die gzip-Datei wählen und {DESK_BACKUP_CONFIRM} eintippen. Die laufende Tafel wird
                  ersetzt — nicht rückgängig, Silvia muss nicht beendet werden.
                </p>
              )}
              {settingsBackupLastVisible(anzeige) ? (
              <p id={SETTINGS_BACKUP_LAST_ID} className="text-sm text-muted-foreground">
                {lastTafelBackupLabel(shownBackup)}
              </p>
              ) : null}
              {deskStorageIsVolatile(storage) ? (
                <p className="text-sm text-flag">
                  Nur RAM: ein Restart löscht die Tafel. `SILVIA_DATA_DIR` nicht auf memory lassen. Tafel sichern legt
                  trotzdem eine Datei an.
                </p>
              ) : (
                <Button
                  id="settings-copy-data-dir"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    const path = deskStorageCopyValue(storage);
                    if (!path) return;
                    void navigator.clipboard.writeText(path).then(
                      () => toast.success("Pfad kopiert."),
                      () => toast.error("Kopieren nicht möglich."),
                    );
                  }}
                >
                  Pfad kopieren
                </Button>
              )}
              {deskBackupCanDownload(storage, anzeige, canEditPractice) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="settings-backup-pass"
                    type="password"
                    autoComplete="new-password"
                    className="max-w-xs"
                    placeholder="Passwort für die Sicherung (min. 8 Zeichen)"
                    value={backupPass}
                    onChange={(e) => setBackupPass(e.target.value)}
                  />
                  <Button
                    id="settings-backup-download"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
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
                      initial.id,
                      backupPass,
                    )
                      .then((res) => {
                        if (!res.ok) {
                          setBackupNotice(tafelBackupNoticeOf(res.error, "settings"));
                          toast.error(res.error);
                          return;
                        }
                        setBackupLast(res.iso || null);
                        toast.success("Sicherung heruntergeladen.");
                      })
                      .catch(() => {
                        setBackupNotice(tafelBackupNoticeOf(TAFEL_BACKUP_FAIL, "settings"));
                        toast.error(TAFEL_BACKUP_FAIL);
                      })
                      .finally(() => setBackupBusy(false));
                  }}
                  >
                    {backupBusy ? "Sichert…" : "Tafel sichern"}
                  </Button>
                </div>
              ) : null}
              {backupNotice ? (
                <p id={backupNotice.id} className="text-sm">
                  {backupNotice.text}
                </p>
              ) : null}
              {canEditPractice && deskBackupCanRestore(storage, anzeige, canEditPractice) ? (
                <div className="grid gap-2">
                  <Label htmlFor="settings-backup-file">Sicherung</Label>
                  <input
                    id="settings-backup-file"
                    ref={holenFileRef}
                    type="file"
                    accept=".gz,.tar.gz,.silvia,application/gzip,application/x-gzip,application/octet-stream"
                    className="max-w-md text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5"
                    onInput={(e) => setHolenFileOn(Boolean(e.currentTarget.files?.[0]))}
                    onChange={(e) => setHolenFileOn(Boolean(e.target.files?.[0]))}
                  />
                  <Label htmlFor="settings-backup-confirm">Zum Holen {DESK_BACKUP_CONFIRM} eintippen</Label>
                  <Input
                    id="settings-backup-confirm"
                    autoComplete="off"
                    className="max-w-xs"
                    placeholder={DESK_BACKUP_CONFIRM}
                    value={holenConfirm}
                    onChange={(e) => setHolenConfirm(e.target.value)}
                  />
                  <Label htmlFor="settings-backup-passwort">Passwort der Sicherung (falls verschlüsselt)</Label>
                  <Input
                    id="settings-backup-passwort"
                    type="password"
                    autoComplete="off"
                    className="max-w-xs"
                    placeholder="Passwort"
                    value={holenPass}
                    onChange={(e) => setHolenPass(e.target.value)}
                  />
                  <Button
                    id="settings-backup-restore"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={backupBusy || restoreBusy || anzeigeControl(anzeige).disabled || !holenReady}
                    title={anzeigeControl(anzeige).title || (holenReady ? undefined : HOLEN_RESTORE_NEED_BOTH)}
                    onClick={() => {
                      if (anzeige) {
                        toast.error(anzeigeControl(true).title);
                        return;
                      }
                      const fileEl = document.getElementById("settings-backup-file");
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
                        window.location.assign(`${TAFEL_HOLEN_WAIT_HREF}?next=/app/einstellungen`);
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
                            applyTafelBackupDownload(store, new Date(next.at), initial.id);
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
                    <p id={TAFEL_HOLEN_SETTINGS_FAIL_ID} className="text-sm">
                      {holenFail}
                    </p>
                  ) : holenWaitVisible({ busy: restoreBusy }) ? (
                    <p id="settings-holen-wait" className="text-sm">
                      {TAFEL_HOLEN_WAIT}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {llm ? (
        <section id="settings-llm" className={cn(DESK_SCROLL_MT, "mt-8 grid gap-3 rounded-xl border border-border bg-card p-4")}>
          <h2 className="font-display text-xl font-semibold">Gespräch</h2>
          <p id="settings-llm-provider" className="text-sm">
            {llm.label}
          </p>
          <p
            id="settings-llm-hint"
            className={llm.missingKey ? "text-sm text-flag" : "text-sm text-muted-foreground"}
          >
            {llm.hint}
          </p>
          <p className="text-sm text-muted-foreground">
            Silvia bekommt beim Gespräch nur die Akte, um die es gerade geht — nicht die ganze Kartei,
            und nur wenn Handy, Chip oder E-Mail schon hinterlegt sind.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Für den Techniker</summary>
            <p className="mt-1 text-muted-foreground">
              Zugang bleibt am Server in <code>.env</code>, nie im Browser. Umstieg auf einen eigenen
              Rechner über <code>SILVIA_LLM_BASE_URL</code>.
            </p>
          </details>
        </section>
      ) : null}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent id="praxissoftware-import-dialog">
          <DialogHeader>
            <DialogTitle>Aus Praxissoftware übernehmen</DialogTitle>
            <DialogDescription>
              Vor dem Speichern prüfen. Nichts wird still überschrieben — erst nach Übernehmen und
              Einstellungen-Speichern gilt das für Silvia.
            </DialogDescription>
          </DialogHeader>
          {importPreview && importPreview.ok ? (
            <div className="grid gap-3 text-sm">
              <div>
                <p className="font-medium">Ärzte</p>
                <p id="praxissoftware-import-vets" className="whitespace-pre-line text-muted-foreground">
                  {importPreview.vets || "Keine gefunden."}
                </p>
              </div>
              <div>
                <p className="font-medium">Räume</p>
                <p id="praxissoftware-import-resources" className="whitespace-pre-line text-muted-foreground">
                  {importPreview.resources || "Keine gefunden."}
                </p>
              </div>
              <div>
                <p className="font-medium">Öffnungszeiten</p>
                {importPreview.hoursFound ? (
                  <ul id="praxissoftware-import-hours" className="text-muted-foreground">
                    {importPreview.hours.map((row, i) => (
                      <li key={i}>
                        {row.day}: {row.time}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Keine Zeiten von der Praxissoftware — bleiben unverändert.</p>
                )}
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setImportOpen(false)}>
                  Abbrechen
                </Button>
                <Button id="praxissoftware-import-confirm" type="button" onClick={applyPraxissoftwareImport}>
                  Übernehmen
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function emptyForm(profile: PracticeProfile | null) {
  return {
    name: profile?.name ?? "",
    ownerName: profile?.ownerName ?? "",
    street: profile?.street ?? "",
    zip: profile?.zip ?? "",
    city: profile?.city ?? "",
    bundesland: profile?.bundesland ?? "",
    phone: profile?.phone ?? "",
    whatsapp: profile?.whatsapp ?? "",
    email: profile?.email ?? "",
    pms: profile?.pms ?? "",
    hours: (profile?.hours?.length ? profile.hours : SIGNUP_HOURS).map((h) => ({
      day: h.day,
      time: h.time,
    })),
    nachtdienstName: profile?.nachtdienstName ?? "",
    nachtdienstPhone: profile?.nachtdienstPhone ?? "",
    nachtdienstNote: profile?.nachtdienstNote ?? "",
    retentionDays: String(profile?.retentionDays ?? 90),
    notes: profile?.notes ?? "",
    locationHint: profile?.locationHint ?? "",
    vets: profile?.vets ?? "",
    resources: profile?.resources ?? "",
    behavior: profile?.behavior ?? "",
    consentEnabled: profile?.consentEnabled ?? true,
    consentNote: profile?.consentNote ?? "",
  };
}

function replaceHour(hours: HourRow[], index: number, row: HourRow) {
  return hours.map((h, i) => (i === index ? row : h));
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
