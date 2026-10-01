import { format, startOfDay } from "date-fns";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { DeskDraftButton } from "@/components/desk/desk-draft-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  dayIsWalkInClosed,
  formatHourDayAt,
  formatHourTimeAt,
  walkInFromDay,
  type HourRow,
} from "@/lib/alma/hours";
import { rescheduleAppointment } from "@/lib/practice/desk-actions";
import { anzeigeControl, slotWriteVisible } from "@/lib/practice/tafel-anzeige";
import { umlegenFieldIds } from "@/lib/practice/desk-status";
import {
  lastUmlegenDraft,
  readLastUmlegen,
  umlegenDraftToast,
  writeLastUmlegen,
  type DraftChannel,
  type LastUmlegen,
} from "@/lib/practice/walk-in-last";

export function RescheduleForm({
  id,
  startAt,
  pet,
  owner,
  phone,
  email,
  practiceName = "Ordination",
  hours = [],
  appointments = [],
  onMoved,
  anzeige,
}: {
  id: string;
  startAt: string;
  pet: string;
  owner?: string;
  phone?: string;
  email?: string;
  practiceName?: string;
  hours?: HourRow[];
  appointments?: Array<{ id?: string; start_at: string; minutes?: number; status?: string; pet?: string }>;
  onMoved?: (next: Date) => void;
  anzeige?: boolean;
}) {
  const router = useRouter();
  const [day, setDay] = useState(() => format(new Date(startAt), "yyyy-MM-dd"));
  const [time, setTime] = useState(() => format(new Date(startAt), "HH:mm"));
  const [dayLabel, setDayLabel] = useState(() => format(new Date(startAt), "yyyy-MM-dd"));
  const [timeLabel, setTimeLabel] = useState(() => format(new Date(startAt), "HH:mm"));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<LastUmlegen | null>(null);
  const fields = umlegenFieldIds(id);

  useEffect(() => {
    const start = new Date(startAt);
    if (Number.isNaN(+start)) return;
    setDay(format(start, "yyyy-MM-dd"));
    setTime(format(start, "HH:mm"));
    setDayLabel(format(start, "yyyy-MM-dd"));
    setTimeLabel(format(start, "HH:mm"));
  }, [startAt]);

  useEffect(() => {
    const stored = readLastUmlegen(typeof sessionStorage === "undefined" ? null : sessionStorage);
    if (stored?.id === id) setLast(stored);
    else setLast(null);
  }, [id]);

  if (!slotWriteVisible(anzeige)) return null;

  function remember(next: LastUmlegen | null) {
    setLast(next);
    writeLastUmlegen(typeof sessionStorage === "undefined" ? null : sessionStorage, next);
  }

  function nextFromFields(nextDay = day, nextTime = time) {
    const [h, m] = nextTime.split(":").map(Number);
    const start = startOfDay(new Date(`${nextDay}T12:00:00`));
    start.setHours(h || 15, m || 0, 0, 0);
    return start;
  }

  function opened(channel: DraftChannel) {
    const msg = umlegenDraftToast(channel);
    if (msg) toast.success(msg);
  }

  function save(nextDay = day, nextTime = time) {
    if (anzeige) {
      toast.error(anzeigeControl(true).title);
      return;
    }
    const start = nextFromFields(nextDay, nextTime);
    setBusy(true);
    void rescheduleAppointment({ data: { id, start: start.toISOString() } })
      .then((res) => {
        if (!res.ok) {
          toast.error("error" in res && res.error ? res.error : "Termin nicht umgelegt.");
          if ("nextStart" in res && res.nextStart) {
            const next = new Date(res.nextStart);
            if (!Number.isNaN(+next)) {
              setDay(format(next, "yyyy-MM-dd"));
              setTime(format(next, "HH:mm"));
              onMoved?.(startOfDay(next));
            }
          }
          return;
        }
        if ("unchanged" in res && res.unchanged) {
          toast.success("Schon dieser Slot.");
          return;
        }
        const moved = new Date(res.start);
        toast.success(
          res.resetConfirm
            ? `Umgelegt auf ${format(moved, "HH:mm")}. Bitte neu bestätigen.`
            : `Umgelegt auf ${format(moved, "HH:mm")}.`,
        );
        const draft = lastUmlegenDraft({
          id,
          pet: res.pet || pet,
          owner: ("owner" in res && res.owner) || owner,
          phone: ("phone" in res && res.phone) || phone,
          email: ("email" in res && res.email) || email,
          previousStart: ("previousStart" in res && res.previousStart) || startAt,
          startAt: res.start,
          practiceName,
        });
        remember(draft);
        setOpen(false);
        onMoved?.(startOfDay(moved));
        void router.invalidate();
      })
      .catch(() => toast.error("Termin nicht umgelegt."))
      .finally(() => setBusy(false));
  }

  function saveFromDom() {
    const dateEl = document.getElementById(fields.date);
    const timeEl = document.getElementById(fields.time);
    let nextDay = dateEl instanceof HTMLInputElement && dateEl.value ? dateEl.value : day;
    let nextTime = timeEl instanceof HTMLInputElement && timeEl.value ? timeEl.value : time;
    const typed = nextFromFields(nextDay, nextTime);
    if (dayIsWalkInClosed(hours, typed)) {
      const others = appointments.filter((row) => row.id !== id);
      const next = walkInFromDay(hours, others, typed);
      nextDay = format(next.start, "yyyy-MM-dd");
      nextTime = next.time;
      onMoved?.(startOfDay(next.start));
    }
    setDay(nextDay);
    setTime(nextTime);
    setDayLabel(nextDay);
    setTimeLabel(nextTime);
    save(nextDay, nextTime);
  }

  const drafts = last ? (
    <div id={fields.drafts} className="mt-2 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-3">
      <p className="text-sm text-muted-foreground">
        Der Halterin Bescheid sagen. Öffnen ändert den Status nicht.
      </p>
      <div className="flex flex-wrap gap-2">
        {last.href ? (
          <DeskDraftButton id={fields.wa} href={last.href} size="sm" onAct={() => opened("whatsapp")}>
            WhatsApp: Termin umgelegt
          </DeskDraftButton>
        ) : null}
        {last.smsHref ? (
          <DeskDraftButton
            id={fields.sms}
            href={last.smsHref}
            size="sm"
            variant="outline"
            newTab={false}
            onAct={() => opened("sms")}
          >
            SMS: Termin umgelegt
          </DeskDraftButton>
        ) : null}
        {last.mailHref ? (
          <DeskDraftButton
            id={fields.mail}
            href={last.mailHref}
            size="sm"
            variant="outline"
            newTab={false}
            onAct={() => opened("mail")}
          >
            E-Mail: Termin umgelegt
          </DeskDraftButton>
        ) : null}
      </div>
    </div>
  ) : null;

  if (!open) {
    return (
      <div>
        <Button
          id={fields.open}
          type="button"
          size="sm"
          variant="outline"
          disabled={anzeigeControl(anzeige).disabled}
          title={anzeigeControl(anzeige).title}
          onClick={() => setOpen(true)}
        >
          Umlegen
        </Button>
        {drafts}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={fields.date} className="text-xs">
            Tag
          </Label>
          <Input
            id={fields.date}
            type="date"
            key={`d-${id}-${day}`}
            defaultValue={day}
            className="h-9 w-[9.5rem]"
            onChange={(e) => setDayLabel(e.target.value)}
            onInput={(e) => setDayLabel((e.currentTarget as HTMLInputElement).value)}
          />
          <p id={fields.dateAnzeige} className="text-[11px] text-muted-foreground">
            {formatHourDayAt(dayLabel || day)}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={fields.time} className="text-xs">
            Uhrzeit
          </Label>
          <Input
            id={fields.time}
            type="time"
            key={`t-${id}-${time}`}
            defaultValue={time}
            className="h-9 w-[7.5rem]"
            onChange={(e) => setTimeLabel(e.target.value)}
            onInput={(e) => setTimeLabel((e.currentTarget as HTMLInputElement).value)}
          />
          <p id={fields.timeAnzeige} className="text-[11px] text-muted-foreground">
            {formatHourTimeAt(timeLabel || time)}
          </p>
        </div>
        <Button
          id={fields.save}
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || anzeigeControl(anzeige).disabled}
          title={anzeigeControl(anzeige).title}
          onClick={saveFromDom}
        >
          {busy ? "Legt um…" : "Umlegen"}
        </Button>
        <Button
          id={fields.cancel}
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Abbrechen
        </Button>
      </div>
      {drafts}
    </div>
  );
}
