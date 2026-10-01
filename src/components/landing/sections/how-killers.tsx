import { Link, useNavigate } from "@tanstack/react-router";
import { ChipLookup, LunchBanner } from "@/components/killers";
import { Kicker, Display } from "@/components/landing/landing-shared";
import { BOARD_ROWS } from "@/components/landing/landing-data";
import { cn } from "@/lib/utils";
import {
  DESK_HOME_HOW_HEAD_ID,
  DESK_HOME_HOW_ID,
  DESK_HOME_HOW_LINE_ID,
  DESK_HOME_HOW_PMS_ID,
  DESK_HOME_HOW_WORK_ID,
  DESK_HOME_CHIP_ID,
  DESK_HOME_KILLERS_ID,
  homePublicHowHeading,
  homePublicHowSteps,
  homePublicShowsDemo,
} from "@/lib/practice/tafel-anzeige";

export function How({ anzeige = false }: { anzeige?: boolean }) {
  const demo = homePublicShowsDemo(anzeige);
  const steps = homePublicHowSteps(
    [
      {
        n: "01",
        t: "Leitung gemeinsam einrichten",
        d: "Parallel zu Ihrer Linie oder als Nachtumleitung. Einrichtung und Leitungsweg prüfen wir gemeinsam.",
      },
      {
        n: "02",
        t: "Anbindung gemeinsam prüfen",
        d: "Vquadrat-Anbindung prüfen wir gemeinsam. Termine liegen zunächst auf der Praxistafel.",
      },
      {
        n: "03",
        t: "Silvia arbeitet",
        d: "Sie bucht, ordnet vor, dokumentiert. Sie behandeln. Am Bildschirm liegt das Protokoll.",
      },
    ],
    anzeige,
  );
  return (
    <section id={DESK_HOME_HOW_ID} className="py-[clamp(3.5rem,6vw,5rem)]">
      <div className="mx-auto max-w-6xl px-6">
        <Display id={DESK_HOME_HOW_HEAD_ID} className="mb-10 max-w-[26em]">
          {homePublicHowHeading(anzeige)}
        </Display>
        <ol className="grid gap-px border-y border-border bg-border md:grid-cols-3">
          {steps.map((s) => {
            const pms = s.n === "02";
            const line = s.n === "01";
            const work = s.n === "03";
            return (
              <li
                key={s.n}
                id={
                  pms
                    ? DESK_HOME_HOW_PMS_ID
                    : line
                      ? DESK_HOME_HOW_LINE_ID
                      : work
                        ? DESK_HOME_HOW_WORK_ID
                        : undefined
                }
                className="bg-background px-6 py-7 md:first:pl-0 md:last:pr-0"
              >
                <p className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#C9C1AE]">
                  {s.n}
                </p>
                <h3 className="mt-[18px] font-display text-[19px] font-semibold tracking-[-0.015em]">
                  {s.t}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-snug text-muted-foreground">
                  {s.d}
                </p>
              </li>
            );
          })}
        </ol>
        {demo ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded bg-card p-[22px] ring-1 ring-border">
              <p className="mb-3 text-[11.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Ihr Zeitaufwand
              </p>
              <p className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">
                Aufwand nach Abstimmung
              </p>
              <p className="mt-2.5 text-sm leading-snug text-muted-foreground">
                Aufwand, Betreuung und eine mögliche Anbindung stimmen wir
                gemeinsam nach den Anforderungen Ihrer Ordination ab.
              </p>
            </article>
            <article className="rounded bg-card p-[22px] ring-1 ring-border">
              <p className="mb-3 text-[11.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Wenn etwas schiefgeht
              </p>
              <p className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">
                Eine Nummer, ein Mensch
              </p>
              <p className="mt-2.5 text-sm leading-snug text-muted-foreground">
                Betreuung und Erreichbarkeit vereinbaren wir passend zu Ihrer
                Ordination und dem gewählten Einrichtungsumfang.
              </p>
            </article>
            <article className="rounded bg-card p-[22px] ring-1 ring-border">
              <p className="mb-3 text-[11.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Umstieg zurück
              </p>
              <p className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">
                Umleitung löschen
              </p>
              <p className="mt-2.5 text-sm leading-snug text-muted-foreground">
                Silvia hängt an einer Rufumleitung. Nehmen Sie sie weg, läutet
                es wieder am Empfang – Ihre Software bleibt unangetastet.
              </p>
            </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function Killers({ anzeige = false }: { anzeige?: boolean }) {
  return (
    <section
      id={DESK_HOME_KILLERS_ID}
      className="border-t border-border bg-[#F4F0E6] py-[clamp(3.5rem,6vw,5rem)]"
    >
      <div
        id="tafel"
        className="mx-auto grid max-w-6xl items-start gap-[clamp(2rem,4vw,3.5rem)] px-6 lg:grid-cols-2"
      >
        <div>
          <Kicker>Killer-Features</Kicker>
          <Display>
            Österreich allein reicht nicht. Sie muss den Fritz kennen.
          </Display>
          <p className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-muted-foreground">
            Die Wissensdatenbank ist die Sonderedition: Der Anruf landet in der
            Akte, das Protokoll geht an die Frau Doktor. Chip nachschlagen –
            Rudi oder Fritz.
          </p>
          {homePublicShowsDemo(anzeige) ? (
            <div className="mt-6">
              <LunchBanner />
            </div>
          ) : null}
          <Link
            to="/werkzeuge"
            className="mt-6 inline-flex border-b border-[#BFD3C6] pb-0.5 text-[14.5px] font-semibold text-primary no-underline hover:border-primary"
          >
            Alle Features ansehen →
          </Link>
        </div>
        {homePublicShowsDemo(anzeige) ? (
          <div id={DESK_HOME_CHIP_ID}>
            <ChipLookup />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function Board() {
  const navigate = useNavigate();
  const openProtocol = () => void navigate({ to: "/demo/anrufe" });
  return (
    <section className="py-[clamp(3.5rem,6vw,5rem)]">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-9 max-w-[38em]">
          <Kicker>Der Tageskalender</Kicker>
          <Display>Das liegt am Morgen am Bildschirm.</Display>
          <p className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-muted-foreground">
            Was zu tun ist, in einer Liste: wer angerufen hat, warum, was Silvia
            zugesagt hat und was noch offen ist. Kein Zurückhören von
            Bandansagen.
          </p>
        </div>
        <div className="overflow-hidden rounded-md bg-card shadow-soft ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[#F4F0E6] px-5 py-4">
            <span className="font-display text-[17px] font-semibold tracking-[-0.015em]">
              Mittwoch, 14. Jänner
            </span>
            <span className="text-[13px] text-muted-foreground">
              Tierordination Huber · Josefstadt
            </span>
            <span className="ms-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ok">
              <span className="size-1.5 rounded-full bg-ok" />7 Anrufe in der
              Nacht erledigt
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-left">
              <thead>
                <tr className="bg-[#F4F0E6] text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  <th className="px-4 py-2.5">Zeit</th>
                  <th className="px-4 py-2.5">Tier</th>
                  <th className="px-4 py-2.5">Was Silvia notiert hat</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {BOARD_ROWS.map((row) => (
                  <tr
                    key={row.time}
                    role="link"
                    tabIndex={0}
                    aria-label={`Protokoll für ${row.pet} von ${row.owner} öffnen`}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/60 focus-visible:outline-none"
                    onClick={openProtocol}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProtocol();
                      }
                    }}
                  >
                    <td className="px-4 py-3.5 font-display text-sm tabular-nums">
                      {row.time}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-semibold">{row.pet}</p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {row.owner}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-[13.5px] leading-snug text-[#4A453D]">
                      {row.note}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-block rounded-[3px] px-2.5 py-1 text-[11.5px] font-semibold",
                          row.tone === "ok" && "bg-[#E7F0EA] text-ok",
                          row.tone === "warn" && "bg-[#F6ECDF] text-warn",
                          row.tone === "flag" && "bg-[#F7E7E5] text-flag",
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-[#F4F0E6] px-5 py-3.5">
            <span className="text-[12.5px] text-muted-foreground">
              Eine Zeile antippen öffnet das Protokoll: Mitschrift, Chipnummer,
              SMS-Entwurf.
            </span>
            <Link
              to="/demo"
              className="ms-auto border-b border-[#BFD3C6] pb-0.5 text-[13.5px] font-semibold text-primary no-underline hover:border-primary"
            >
              Am eigenen Tag ausprobieren →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
