import { CalendarClock, MessageCircle, Moon, PhoneCall } from "lucide-react";
import { Kicker, Display } from "@/components/landing/landing-shared";
import { AT_FACTS, NACHTDIENSTE, STATS } from "@/lib/alma/data";
import { cn } from "@/lib/utils";
import {
  DESK_HOME_AUSTRIA_ID,
  DESK_HOME_PROBLEM_ID,
  DESK_HOME_PROBLEM_LEAD_ID,
  DESK_HOME_PROBLEM_NACHT_ID,
  DESK_HOME_PROBLEM_WA_ID,
  DESK_HOME_STATS_ERLEDIGT_ID,
  DESK_HOME_STATS_ID,
  DESK_HOME_STATS_NUMMER_ID,
  HOME_PROBLEM_NACHT,
  HOME_PROBLEM_WA,
  homePublicProblemItems,
  homePublicProblemLead,
  homePublicStats,
} from "@/lib/practice/tafel-anzeige";

export function LogoStrip({ anzeige = false }: { anzeige?: boolean }) {
  const stats = homePublicStats(STATS, anzeige);
  return (
    <section
      id={DESK_HOME_STATS_ID}
      className="border-b border-border bg-[#F4F0E6]"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            id={
              /eine Nummer|ohne Portierung/i.test(s.label)
                ? DESK_HOME_STATS_NUMMER_ID
                : /ohne Ihr Zutun|92\s*%/i.test(`${s.value} ${s.label}`)
                  ? DESK_HOME_STATS_ERLEDIGT_ID
                  : undefined
            }
            className={cn(
              "px-6 py-8 sm:first:pl-0 sm:last:pr-0",
              i < stats.length - 1 && "sm:border-r sm:border-border",
            )}
          >
            <p className="font-display text-[clamp(1.875rem,3vw,2.625rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              {s.value}
            </p>
            <p className="mt-2.5 text-sm leading-snug text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Problem({ anzeige = false }: { anzeige?: boolean }) {
  const items = homePublicProblemItems(
    [
      {
        icon: PhoneCall,
        t: "Verpasste Anrufe",
        d: "Während einer Behandlung können Anrufe unbeantwortet bleiben.",
      },
      { icon: MessageCircle, t: "WhatsApp ungelesen", d: HOME_PROBLEM_WA },
      { icon: Moon, t: "Nacht ohne Netz", d: HOME_PROBLEM_NACHT },
      {
        icon: CalendarClock,
        t: "Kalender daneben",
        d: "Feiertage und Mittagspause werden falsch angeboten.",
      },
    ],
    anzeige,
  );
  return (
    <section
      id={DESK_HOME_PROBLEM_ID}
      className="mx-auto max-w-6xl px-6 py-[clamp(3.5rem,6vw,5rem)]"
    >
      <div className="mb-10 max-w-[36em]">
        <Kicker>Das Loch in der Ordination</Kicker>
        <Display>In Österreich läutet das Telefon oft ins Leere.</Display>
        <p
          id={DESK_HOME_PROBLEM_LEAD_ID}
          className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-muted-foreground"
        >
          {homePublicProblemLead(anzeige)}
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((item, i) => {
          const wa = /WhatsApp/i.test(item.t);
          const nacht = /Nacht/i.test(item.t);
          return (
            <li
              key={item.t}
              id={
                wa
                  ? DESK_HOME_PROBLEM_WA_ID
                  : nacht
                    ? DESK_HOME_PROBLEM_NACHT_ID
                    : undefined
              }
              className="rounded bg-card p-6 ring-1 ring-border"
            >
              <p className="mb-3.5 font-display text-[13px] font-semibold text-flag">
                {String(i + 1).padStart(2, "0")}
              </p>
              <p className="font-display text-[19px] font-semibold tracking-[-0.015em]">
                {item.t}
              </p>
              <p className="mt-2.5 text-[14.5px] leading-snug text-muted-foreground">
                {item.d}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Austria() {
  return (
    <section
      id={DESK_HOME_AUSTRIA_ID}
      className="border-t border-border bg-[#F4F0E6] py-[clamp(3.5rem,6vw,5rem)]"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 max-w-[38em]">
          <Kicker>Nur in Österreich</Kicker>
          <Display>Neun Nachtdienste. Eine Stimme im achten Bezirk.</Display>
          <p className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-muted-foreground">
            Silvia sitzt in der Josefstadt, kennt die U2 und die Kurzparkzone –
            und zeigt in der Nacht den hinterlegten Nachtdienstkontakt für Ihr
            Bundesland.
          </p>
        </div>
        <ol className="mb-11 grid overflow-hidden rounded bg-border ring-1 ring-border sm:grid-cols-2 lg:grid-cols-3">
          {NACHTDIENSTE.map((n) => (
            <li key={n.land} className="bg-card p-5">
              <p
                className={cn(
                  "mb-2.5 text-[11.5px] font-semibold tracking-[0.1em] uppercase",
                  n.land === "Wien" ? "text-primary" : "text-muted-foreground",
                )}
              >
                {n.land}
              </p>
              <p className="font-display text-[17px] font-semibold tracking-[-0.01em]">
                {n.place}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-snug text-muted-foreground">
                {n.detail}
              </p>
            </li>
          ))}
        </ol>
        <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {AT_FACTS.map((f) => (
            <li key={f.t} className="border-t border-border pt-4">
              <p className="font-display text-[17px] font-semibold">{f.t}</p>
              <p className="mt-2 text-sm leading-snug text-muted-foreground">
                {f.d}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
