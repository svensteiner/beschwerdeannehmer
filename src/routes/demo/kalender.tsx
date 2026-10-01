import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, getDay, isSameDay, startOfDay } from "date-fns";
import { deAT } from "date-fns/locale";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChannelBadge } from "@/components/demo/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRACTICE, seedAppointments } from "@/lib/alma/data";
import { isHoliday, isMittagssperre, isOpenHour } from "@/lib/alma/hours";
import { useAlmaStore } from "@/lib/alma/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/kalender")({ component: Kalender });

function Kalender() {
  const extra = useAlmaStore((s) => s.extraAppointments);
  const addAppointment = useAlmaStore((s) => s.addAppointment);
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [owner, setOwner] = useState("Neue Klientin");
  const [pet, setPet] = useState("Luna");
  const [type, setType] = useState("Kontrolle");
  const [time, setTime] = useState("15:00");

  const weekday = getDay(day);
  const lunch = weekday >= 1 && weekday <= 5 && weekday !== 3;
  const saturday = weekday === 6;
  const sunday = weekday === 0;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i)), []);
  const all = [...extra, ...seedAppointments()];
  const ofDay = all
    .filter((a) => isSameDay(new Date(a.start), day))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  function book() {
    const [h, m] = time.split(":").map(Number);
    const start = new Date(day);
    start.setHours(h || 15, m || 0, 0, 0);
    if (sunday || isHoliday(start) || isMittagssperre(start) || !isOpenHour(start)) {
      toast.error("Zwischen 12 und 14, am Feiertag und am Sonntag ist geschlossen. Silvia legt den nächsten offenen Slot.");
      return;
    }
    addAppointment({
      id: crypto.randomUUID(),
      start: start.toISOString(),
      minutes: 20,
      owner,
      pet,
      type,
      vet: "Dr. Huber",
      channel: "web",
    });
    toast.success(`Termin für ${pet} liegt im Kalender.`);
  }

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Kalender</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Silvia bucht in denselben Slot. Feiertage, Sonntag und 12:00–14:00 sind gesperrt.
      </p>
      <p className="mt-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        Nächster Feiertag: Nationalfeiertag, 26. Oktober – Ordination zu, Nachtdienst{" "}
        {PRACTICE.nachtdienst.name}.
      </p>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => setDay(d)}
            className={cn(
              "flex min-h-16 min-w-16 flex-col items-center justify-center rounded-lg border px-3",
              isSameDay(d, day)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            <span className="text-[10px] uppercase">
              {format(d, "EE", { locale: deAT })}
            </span>
            <span className="font-display text-lg tabular-nums">{format(d, "d")}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {ofDay.length === 0 && !sunday ? (
            <li className="p-6 text-sm text-muted-foreground">Keine Termine an diesem Tag.</li>
          ) : (
            ofDay.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    <span className="tabular-nums">
                      {format(new Date(a.start), "HH:mm", { locale: deAT })}
                    </span>{" "}
                    · {a.pet}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {a.owner} · {a.type} · {a.minutes} Min.
                  </p>
                </div>
                <ChannelBadge channel={a.channel} />
              </li>
            ))
          )}
          {lunch ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              12:00–14:00 geschlossen · geöffnet 8:00–12:00 und 14:00–18:00
            </li>
          ) : null}
          {weekday === 3 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Ab 12:00 geschlossen · Mittwoch nur Vormittag
            </li>
          ) : null}
          {saturday ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Ab 12:00 geschlossen · Samstag nur Früh
            </li>
          ) : null}
          {sunday ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Nachtdienst · {PRACTICE.nachtdienst.name}
            </li>
          ) : null}
        </ul>
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            book();
          }}
        >
          <p className="font-medium">Slot legen</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="owner">Halterin</Label>
            <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pet">Tier</Label>
            <Input id="pet" value={pet} onChange={(e) => setPet(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Anliegen</Label>
            <Input id="type" value={type} onChange={(e) => setType(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="time">Uhrzeit</Label>
            <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <Button type="submit">Eintragen</Button>
        </form>
      </div>
    </div>
  );
}
