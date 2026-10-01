import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadPracticeKpis, type KpiSummary } from "@/lib/practice/kpi";

export const Route = createFileRoute("/app/auswertung")({ component: Auswertung });

const CHANNEL_LABELS: Record<string, string> = {
  telefon: "Telefon",
  web: "Web",
  whatsapp: "WhatsApp",
};

function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel] ?? channel;
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="font-display text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Auswertung() {
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadPracticeKpis()
      .then((res) => {
        if (live) setKpi(res);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">Auswertung</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Die Auswertung konnte nicht geladen werden.
        </p>
      </div>
    );
  }

  const hours =
    kpi?.byHour.map((h) => ({
      label: String(h.hour).padStart(2, "0"),
      anrufe: h.calls,
    })) ?? [];

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Auswertung</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {kpi ? `Letzte ${kpi.periodDays} Tage.` : "Wird geladen…"}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard value={kpi ? String(kpi.calls) : "—"} label="Gespräche" />
        <StatCard value={kpi ? String(kpi.appointments) : "—"} label="Termine gebucht" />
        <StatCard
          value={kpi ? `${Math.round(kpi.bookingRate * 100)} %` : "—"}
          label="Buchungsquote"
        />
        <StatCard value={kpi ? String(kpi.openCallbacks) : "—"} label="Offene Rückrufe" />
        <StatCard value={kpi ? String(kpi.emergencies) : "—"} label="Notfälle" />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 font-display text-xl font-semibold">Anrufe je Stunde (Wien)</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hours} barGap={0}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--color-secondary)" }}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="anrufe" name="Anrufe" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {kpi && kpi.byChannel.length ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-4 font-display text-xl font-semibold">Kanäle</h2>
          <ul className="divide-y divide-border">
            {kpi.byChannel.map((c) => (
              <li key={c.channel} className="flex items-center justify-between py-2">
                <span>{channelLabel(c.channel)}</span>
                <span className="font-medium tabular-nums">{c.calls}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
