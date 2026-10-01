import { format, startOfDay } from "date-fns";
import { deAT } from "date-fns/locale";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AkteHandyLink } from "@/components/desk/akte-handy-link";
import { DeskDraftButton } from "@/components/desk/desk-draft-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatHourDayAt,
  formatHourTimeAt,
  formatSlot,
  hoursLabelForDay,
  walkInFromDay,
  retargetClosedDayStart,
  type HourRow,
} from "@/lib/alma/hours";
import { slotSpokenName } from "@/lib/alma/protocol";
import { halterinDraftHref, halterinMailHref, halterinSmsHref } from "@/lib/alma/phone";
import { createWalkInAppointment, updateAppointmentStatus } from "@/lib/practice/desk-actions";
import { HALTERIN_PHONE_HINT, HALTERIN_PHONE_LABEL, WALK_IN_PLACEHOLDERS, walkInFieldIds, walkInFromFields } from "@/lib/practice/desk-status";
import { dateFromDayKey, kalenderDayFromSearch } from "@/lib/practice/appointment-query";
import { anzeigeControl, walkInFormVisible, walkInTitle } from "@/lib/practice/tafel-anzeige";
import {
  type DraftChannel,
  type LastWalkIn,
  confirmDraftToast,
  confirmReachHint,
  needsSilentConfirm,
  ownerSlotMailSubject,
  contactForWalkInLast,
  readLastWalkIn,
  walkInConfirmHref,
  walkInConfirmMailHref,
  walkInConfirmSmsHref,
  writeLastWalkIn,
} from "@/lib/practice/walk-in-last";

function readField(id: string) {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el.value : "";
}

export function WalkInForm({
  day,
  onDayChange,
  idPrefix = "",
  showDate = false,
  patients,
  appointments,
  practiceName = "Ordination",
  hours = [],
  anzeige = false,
}: {
  day: Date;
  onDayChange?: (next: Date) => void;
  idPrefix?: string;
  showDate?: boolean;
  patients?: Array<{ id: string; name: string; owner_name?: string; phone?: string; email?: string }>;
  appointments?: Array<{
    id: string;
    pet: string;
    status: string;
    start_at: string;
    minutes?: number;
    owner_name?: string;
    owner_phone?: string;
    owner_email?: string;
  }>;
  practiceName?: string;
  hours?: HourRow[];
  anzeige?: boolean;
}) {
  const router = useRouter();
  const [time, setTime] = useState(() => walkInFromDay(hours, appointments ?? [], day).time);
  const [timeLabel, setTimeLabel] = useState(() => walkInFromDay(hours, appointments ?? [], day).time);
  const [dateLabel, setDateLabel] = useState(() => format(day, "yyyy-MM-dd"));
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [last, setLast] = useState<LastWalkIn | null>(null);
  const hoursKey = hours.map((h) => `${h.day}\t${h.time}`).join("\n");
  const dayIso = format(day, "yyyy-MM-dd");
  const dayHours = hoursLabelForDay(hours, day);
  const nextFree = hours.length ? walkInFromDay(hours, appointments ?? [], day).start : null;

  const applySeed = useCallback((opts?: {
    toast?: boolean;
    extra?: Array<{ start_at: string; minutes?: number; status?: string; pet?: string }>;
    moveDay?: boolean;
  }) => {
    const extra = opts?.extra ?? [];
    const moveDay = opts?.moveDay ?? opts?.toast ?? idPrefix === "heute-";
    const seed = walkInFromDay(hours, [...(appointments ?? []), ...extra], day);
    if (!moveDay && format(seed.start, "yyyy-MM-dd") !== format(day, "yyyy-MM-dd")) return;
    setTime(seed.time);
    setTimeLabel(seed.time);
    if (moveDay) onDayChange?.(startOfDay(seed.start));
    if (opts?.toast) toast.success(`Walk-in übernimmt ${formatSlot(seed.start)}.`);
  }, [appointments, day, hours, idPrefix, onDayChange]);

  function applyNextFree() {
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    applySeed({ toast: true, moveDay: true });
  }

  const fields = walkInFieldIds(idPrefix);
  const ownerId = fields.owner;
  const phoneId = fields.phone;
  const emailId = fields.email;
  const petId = fields.pet;
  const kindId = fields.kind;
  const timeId = fields.time;
  const dateId = fields.date;

  useEffect(() => {
    setDateLabel(dayIso);
  }, [dayIso]);

  function remember(next: LastWalkIn | null) {
    setLast(next);
    writeLastWalkIn(typeof sessionStorage === "undefined" ? null : sessionStorage, next);
  }

  useEffect(() => {
    if (last) return;
    const stored = readLastWalkIn(typeof sessionStorage === "undefined" ? null : sessionStorage);
    if (stored) setLast(stored);
  }, [last]);

  useEffect(() => {
    if (!hours.length) return;
    applySeed();
  }, [applySeed, hours.length, hoursKey, dayIso]);

  useEffect(() => {
    if (!last) return;
    const slot = (appointments ?? []).find((a) => a.id === last.id);
    if (slot && slot.status !== "gelegt") {
      remember(null);
      return;
    }
    const { phone, email } = contactForWalkInLast({
      last,
      slot,
      patients: patients ?? [],
    });
    const startAt = slot?.start_at;
    const href = phone && startAt
      ? walkInConfirmHref({ phone, pet: last.pet, owner: last.owner, startAt, practiceName })
      : last.href;
    const smsHref =
      phone && startAt
        ? walkInConfirmSmsHref({ phone, pet: last.pet, owner: last.owner, startAt, practiceName })
        : last.smsHref;
    const mailHref = startAt
      ? walkInConfirmMailHref({ pet: last.pet, owner: last.owner, startAt, practiceName, email })
      : last.mailHref;
    if (href === last.href && smsHref === last.smsHref && mailHref === last.mailHref) return;
    remember({ ...last, href, smsHref, mailHref });
  }, [appointments, last, patients, practiceName]);

  function bookFromDom() {
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    const snap = walkInFromFields(
      readField,
      {
        owner: ownerId,
        phone: phoneId,
        email: emailId,
        pet: petId,
        kind: kindId,
        time: timeId,
        date: showDate ? dateId : undefined,
      },
      dayIso,
    );
    setTime(snap.time);
    if (!snap.start || snap.owner.length < 2 || snap.pet.length < 2) {
      toast.error("Halterin, Tier und Uhrzeit brauchen wir.");
      return;
    }
    const start = retargetClosedDayStart(hours, appointments ?? [], snap.start);
    if (+start !== +snap.start) {
      const nextTime = format(start, "HH:mm");
      setTime(nextTime);
      setTimeLabel(nextTime);
    }
    onDayChange?.(startOfDay(start));
    const bookedStart = start.toISOString();
    setBusy(true);
    void createWalkInAppointment({
      data: {
        pet: snap.pet,
        owner: snap.owner,
        kind: snap.kind,
        start: bookedStart,
        phone: snap.phone,
        email: snap.email,
      },
    })
      .then((res) => {
        if (!res.ok) {
          toast.error("error" in res && res.error ? res.error : "Termin nicht gelegt.");
          if ("nextStart" in res && res.nextStart) {
            const next = new Date(res.nextStart);
            if (!Number.isNaN(+next)) {
              setTime(format(next, "HH:mm"));
              onDayChange?.(startOfDay(next));
            }
          }
          return;
        }
        const href = "confirm" in res ? halterinDraftHref(res.phone, res.confirm) : "";
        const smsHref = "confirm" in res ? halterinSmsHref(res.phone, res.confirm) : "";
        const mailHref =
          "confirm" in res
            ? halterinMailHref(
                ownerSlotMailSubject("termin", res.pet, practiceName, "owner" in res ? res.owner : snap.owner),
                res.confirm,
                "email" in res ? res.email : snap.email,
              )
            : "";
        remember({
          id: res.id,
          pet: res.pet,
          owner: "owner" in res ? res.owner : snap.owner,
          href,
          smsHref,
          mailHref,
        });
        const named = slotSpokenName(res.pet, "owner" in res ? res.owner : snap.owner);
        const toastLead = named ? `Termin für ${named} liegt` : "Termin liegt";
        toast.success(
          href || smsHref
            ? `${toastLead}. WhatsApp-, SMS- oder E-Mail-Bestätigung an die Halterin ist bereit.`
            : `${toastLead}. E-Mail-Bestätigung an die Halterin ist bereit.`,
        );
        applySeed({
          extra: [
            {
              start_at: "start" in res && res.start ? res.start : bookedStart,
              minutes: 20,
              status: "gelegt",
              pet: res.pet,
            },
          ],
          moveDay: true,
        });
        setStamp((n) => n + 1);
        void router.invalidate();
      })
      .catch(() => toast.error("Termin nicht gelegt."))
      .finally(() => setBusy(false));
  }

  const lastContact = last
    ? contactForWalkInLast({
        last,
        slot: (appointments ?? []).find((a) => a.id === last.id),
        patients: patients ?? [],
      })
    : { phone: "", email: "" };

  function confirmLast(channel: DraftChannel) {
    if (!last) return;
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    const id = last.id;
    void updateAppointmentStatus({ data: { id, status: "bestätigt" } })
      .then((res) => {
        if (!res.ok) {
          toast.error("error" in res && res.error ? res.error : "Termin nicht bestätigt.");
          return;
        }
        toast.success(confirmDraftToast(channel));
        remember(null);
        void router.invalidate();
      })
      .catch(() => toast.error("Termin nicht bestätigt."));
  }

  const lock = anzeigeControl(anzeige);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="font-medium">{walkInTitle(anzeige)}</p>
        {anzeige ? (
          <p id={`${idPrefix}walkin-anzeige`} className="text-sm text-foreground">
            {anzeigeControl(true).title}
          </p>
        ) : null}
        {walkInFormVisible(anzeige) ? (
        <>
        <p className="text-xs text-muted-foreground">
          Für Klientel an der Tafel, ohne Anruf. Halterin und Telefon gehören in die Akte. Das Protokoll geht intern an
          die Frau Doktor. Tag und Uhrzeit starten am nächsten freien hinterlegten Slot, nicht um 15:00. Nach dem
          Legen: WhatsApp (nur Handy), SMS oder E-Mail an die Halterin im nächsten Klick (Silvia öffnet wa.me / sms: /
          mailto:, sendet nicht selbst). Außerhalb der Zeiten oder wenn der Slot schon liegt, nennt Silvia den nächsten freien
          Slot. Nächsten Slot übernehmen setzt Tag und Uhrzeit neu, wenn die Tierarzthelferin die Zeit verdreht hat.
        </p>
        <p id={`${idPrefix}fenster`} className="text-xs text-muted-foreground">
          {format(day, "EEEE", { locale: deAT })}: {dayHours}
          {nextFree ? `. Nächster Slot: ${formatSlot(nextFree)}.` : "."}
        </p>
        <Button
          id={`${idPrefix}naechster-slot`}
          type="button"
          variant="outline"
          disabled={lock.disabled}
          title={lock.title}
          onClick={applyNextFree}
        >
          Nächsten Slot übernehmen
        </Button>
        {showDate ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dateId}>Tag</Label>
            <Input
              id={dateId}
              type="date"
              value={dayIso}
              disabled={lock.disabled}
              title={lock.title}
              onChange={(e) => {
                setDateLabel(e.target.value);
                const key = kalenderDayFromSearch(e.target.value);
                if (!key) return;
                onDayChange?.(startOfDay(dateFromDayKey(key)));
              }}
              onInput={(e) => setDateLabel((e.currentTarget as HTMLInputElement).value)}
            />
            <p id={fields.dateAnzeige} className="text-xs text-muted-foreground">
              {formatHourDayAt(dateLabel || dayIso)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Slot am {format(day, "EEEE, d.M.", { locale: deAT })}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ownerId}>Halterin</Label>
          <Input
            id={ownerId}
            key={`o-${ownerId}-${stamp}`}
            required
            minLength={2}
            defaultValue=""
            placeholder={WALK_IN_PLACEHOLDERS.owner}
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={phoneId}>{HALTERIN_PHONE_LABEL}</Label>
          <Input
            id={phoneId}
            key={`p-${phoneId}-${stamp}`}
            defaultValue=""
            placeholder={WALK_IN_PLACEHOLDERS.phone}
            inputMode="tel"
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
          <p id={`${idPrefix}owner-phone-hint`} className="text-xs text-muted-foreground">
            {HALTERIN_PHONE_HINT}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={emailId}>E-Mail der Halterin</Label>
          <Input
            id={emailId}
            key={`e-${emailId}-${stamp}`}
            defaultValue=""
            placeholder={WALK_IN_PLACEHOLDERS.email}
            type="email"
            inputMode="email"
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={petId}>Tier</Label>
          <Input
            id={petId}
            key={`pet-${petId}-${stamp}`}
            required
            defaultValue=""
            placeholder={WALK_IN_PLACEHOLDERS.pet}
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={kindId}>Anliegen</Label>
          <Input
            id={kindId}
            key={`k-${kindId}-${stamp}`}
            defaultValue="Kontrolle"
            autoComplete="off"
            disabled={lock.disabled}
            title={lock.title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={timeId}>Uhrzeit</Label>
          <Input
            id={timeId}
            type="time"
            key={`t-${timeId}-${time}`}
            defaultValue={time}
            disabled={lock.disabled}
            title={lock.title}
            onChange={(e) => setTimeLabel(e.target.value)}
            onInput={(e) => setTimeLabel((e.currentTarget as HTMLInputElement).value)}
          />
          <p id={fields.timeAnzeige} className="text-xs text-muted-foreground">
            {formatHourTimeAt(timeLabel || time)}
          </p>
        </div>
        <Button
          id={fields.eintragen}
          type="button"
          disabled={busy || lock.disabled}
          title={lock.title}
          onClick={() => bookFromDom()}
        >
          {busy ? "Legt…" : "Eintragen"}
        </Button>
        </>
        ) : null}
      </div>
      {last && walkInFormVisible(anzeige) ? (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4">
          <p className="font-medium">Letzter Walk-in · {last.pet}</p>
          <p id={`${idPrefix}confirm-hint`} className="text-sm text-muted-foreground">
            {last.owner}
            {confirmReachHint(last)}
          </p>
          <div className="flex flex-wrap gap-2">
              {last.href ? (
                <DeskDraftButton
                  id={`${idPrefix}wa-bestaetigung`}
                  href={last.href}
                  size="default"
                  disabled={anzeigeControl(anzeige).disabled}
                  title={anzeigeControl(anzeige).title}
                  onAct={() => confirmLast("whatsapp")}
                >
                  WhatsApp-Bestätigung an die Halterin
                </DeskDraftButton>
              ) : null}
              {last.smsHref ? (
                <DeskDraftButton
                  id={`${idPrefix}sms-bestaetigung`}
                  href={last.smsHref}
                  size="default"
                  variant="outline"
                  newTab={false}
                  disabled={anzeigeControl(anzeige).disabled}
                  title={anzeigeControl(anzeige).title}
                  onAct={() => confirmLast("sms")}
                >
                  SMS-Bestätigung an die Halterin
                </DeskDraftButton>
              ) : null}
              {last.mailHref ? (
                <DeskDraftButton
                  id={`${idPrefix}mail-bestaetigung`}
                  href={last.mailHref}
                  size="default"
                  variant="outline"
                  newTab={false}
                  disabled={anzeigeControl(anzeige).disabled}
                  title={anzeigeControl(anzeige).title}
                  onAct={() => confirmLast("mail")}
                >
                  E-Mail-Bestätigung an die Halterin
                </DeskDraftButton>
              ) : null}
              {needsSilentConfirm(last) ? (
                <Button
                  id={`${idPrefix}trotzdem-bestaetigen`}
                  type="button"
                  variant="outline"
                  disabled={anzeigeControl(anzeige).disabled}
                  title={anzeigeControl(anzeige).title}
                  onClick={() => confirmLast("")}
                >
                  Trotzdem als bestätigt markieren
                </Button>
              ) : null}
              <AkteHandyLink
                pet={last.pet}
                patients={patients}
                size="default"
                owner={last.owner}
                ownerPhone={lastContact.phone}
                ownerEmail={lastContact.email}
                anzeige={anzeige}
              />
          </div>
        </div>
      ) : null}
    </div>
  );
}
