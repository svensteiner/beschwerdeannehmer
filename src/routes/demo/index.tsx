import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { ArrowRight, PhoneCall, Siren } from "lucide-react";
import { useEffect, useState } from "react";
import { ChannelBadge, StatusBadge } from "@/components/demo/status-badge";
import { Waveform } from "@/components/phone-frame";
import { Button } from "@/components/ui/button";
import { CALLS, EMERGENCIES, PRACTICE, seedAppointments } from "@/lib/alma/data";
import { useAlmaStore } from "@/lib/alma/store";

export const Route = createFileRoute("/demo/")({ component: DemoHome });

type LiveCall = "idle" | "active" | "done";

function DemoHome() {
  const extra = useAlmaStore((s) => s.extraAppointments);
  const extraCalls = useAlmaStore((s) => s.extraCalls);
  const extraEmergencies = useAlmaStore((s) => s.extraEmergencies);
  const appointments = [...extra, ...seedAppointments()].slice(0, 5);
  const openEmergency =
    extraEmergencies.find((e) => e.status !== "dokumentiert") ??
    EMERGENCIES.find((e) => e.status !== "dokumentiert");
  const recentCalls = [...extraCalls, ...CALLS].slice(0, 4);
  const [live, setLive] = useState<LiveCall>("idle");

  useEffect(() => {
    const start = window.setTimeout(() => setLive("active"), 2200);
    const done = window.setTimeout(() => setLive("done"), 9000);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(done);
    };
  }, []);

  return (
    <div className="p-4 sm:p-8">
      <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
        {format(new Date(), "EEEE, d. MMMM yyyy", { locale: deAT })}
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold">Heute in der Ordination</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {PRACTICE.owner} · Silvia hat 47 Gespräche angenommen, 43 ohne Ihr Zutun.
      </p>

      {live !== "idle" ? (
        <div
          className={`mt-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
            live === "active"
              ? "border-ok/30 bg-ok/8"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-start gap-3">
            {live === "active" ? <Waveform className="mt-1 text-ok" /> : <PhoneCall className="mt-0.5 size-5 text-ok" />}
            <div>
              <p className="font-medium">
                {live === "active" ? "Silvia spricht gerade" : "Soeben erledigt"}
              </p>
              <p className="text-sm text-muted-foreground">
                {live === "active"
                  ? "Karin Moser · Nationalfeiertag, Öffnungszeiten"
                  : "Karin Moser · Info hinterlegt, kein Termin nötig"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/demo/anrufe">Protokoll</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {[
          { n: live === "done" ? "48" : "47", l: "Anrufe & Chats" },
          { n: live === "done" ? "44" : "43", l: "automatisch erledigt" },
          { n: "12", l: "Termine gelegt" },
          { n: "1", l: "Notfallhinweis" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-border bg-card p-4">
            <p className="font-display text-3xl font-semibold tabular-nums">{s.n}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.l}</p>
          </div>
        ))}
      </div>

      {openEmergency ? (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Siren className="mt-0.5 size-5 text-destructive" />
            <div>
              <p className="font-medium">
                Notfall · {openEmergency.pet} ({openEmergency.owner})
              </p>
              <p className="text-sm text-muted-foreground">{openEmergency.summary}</p>
            </div>
          </div>
          <Button variant="destructive" asChild>
            <Link to="/demo/notfall">Protokoll öffnen</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Letzte Gespräche</h2>
            <Link to="/demo/anrufe" className="text-sm text-primary hover:underline">
              Alle
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {recentCalls.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{c.caller}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.pet} · {c.concern}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Kalender</h2>
            <Link to="/demo/kalender" className="text-sm text-primary hover:underline">
              Woche
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    <span className="tabular-nums">
                      {format(new Date(a.start), "HH:mm", { locale: deAT })}
                    </span>{" "}
                    · {a.pet}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {a.owner} · {a.type}
                  </p>
                </div>
                <ChannelBadge channel={a.channel} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/sprechen" search={{ mode: undefined }}>
            Anruf als Klientel
            <ArrowRight />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">
            <PhoneCall className="size-4" />
            Zurück zum Produkt
          </Link>
        </Button>
      </div>
    </div>
  );
}
