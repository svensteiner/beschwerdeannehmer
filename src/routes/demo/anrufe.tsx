import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { useState } from "react";
import { ChannelBadge, StatusBadge } from "@/components/demo/status-badge";
import { CALLS } from "@/lib/alma/data";
import { displayCallAction } from "@/lib/alma/phone";
import { useAlmaStore } from "@/lib/alma/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/anrufe")({ component: Anrufe });

function Anrufe() {
  const extra = useAlmaStore((s) => s.extraCalls);
  const all = [...extra, ...CALLS];
  const [id, setId] = useState(all[0]?.id);
  const selected = all.find((c) => c.id === id) ?? all[0];

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[20rem_1fr]">
      <aside className="border-b border-border lg:border-r lg:border-b-0">
        <div className="p-4">
          <h1 className="font-display text-2xl font-semibold">Anrufe</h1>
          <p className="text-sm text-muted-foreground">Protokoll, das Silvia hinterlässt.</p>
        </div>
        <ul>
          {all.map((c) => (
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
                  <span className="font-medium">{c.caller}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {format(new Date(c.at), "HH:mm", { locale: deAT })}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {c.pet} · {c.concern}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selected ? (
        <article className="min-w-0 p-4 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={selected.status} />
            <ChannelBadge channel={selected.channel} />
            <span className="text-sm text-muted-foreground tabular-nums">
              {format(new Date(selected.at), "d. MMM, HH:mm", { locale: deAT })} ·{" "}
              {selected.durationSec}s
            </span>
          </div>
          <h2 className="mt-3 font-display text-3xl font-semibold">{selected.caller}</h2>
          <p className="text-muted-foreground">
            {selected.pet} · {selected.species}
          </p>
          <p className="mt-4 rounded-lg bg-secondary px-4 py-3 text-sm">
            <span className="font-medium">Aktion: </span>
            {displayCallAction(selected.action)}
          </p>
          <div className="mt-6 flex w-full flex-col gap-3">
            {selected.transcript.map((line, i) => (
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
                  {line.from === "alma" ? "Silvia" : selected.caller}
                </p>
                {line.text}
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}
