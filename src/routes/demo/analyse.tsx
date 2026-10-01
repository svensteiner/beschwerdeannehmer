import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WEEKLY_VOLUME } from "@/lib/alma/data";

export const Route = createFileRoute("/demo/analyse")({ component: Analyse });

function Analyse() {
  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-3xl font-semibold">Auswertung</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Diese Woche in der Demo-Ordination Huber. Zahlen sind beispielhaft, die Logik ist
        dieselbe.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { n: "91 %", l: "Automatisierungsquote" },
          { n: "4,7 Min.", l: "mittlere Wartezeit vorher" },
          { n: "12 s", l: "mittlere Annahme jetzt" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-border bg-card p-4">
            <p className="font-display text-3xl font-semibold tabular-nums">{s.n}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.l}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 font-display text-xl font-semibold">Gespräche diese Woche</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={WEEKLY_VOLUME} barGap={4}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--color-secondary)" }}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="auto" name="Silvia" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="hand" name="Team" fill="var(--color-warn)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
