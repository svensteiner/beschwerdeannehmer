import { Link } from "@tanstack/react-router";
import { DemoRequestButton } from "@/components/demo-request-dialog";
import { HearSilvia } from "@/components/silvia-voice";
import { SprechenCall } from "@/components/sprechen/sprechen-call";
import { Button } from "@/components/ui/button";
import { BUNDESLAENDER } from "@/lib/alma/data";
import {
  DESK_HOME_ANZEIGE_ID,
  DESK_HOME_HEAR_ID,
  DESK_HOME_HERO_COPY_ID,
  DESK_HOME_HERO_TAFEL_ID,
  DESK_HOME_MITTAG_ID,
  DESK_HOME_TESTEN_ID,
  homePublicShowsDemo,
  sprechenAnzeigeAuthLine,
} from "@/lib/practice/tafel-anzeige";

export function Hero({ anzeige = false }: { anzeige?: boolean }) {
  const anzeigeLine = sprechenAnzeigeAuthLine(anzeige);
  const demo = homePublicShowsDemo(anzeige);
  return (
    <section
      id="anrufen"
      className="scroll-mt-20 px-0 py-[clamp(2.5rem,5vw,4.5rem)] pb-[clamp(3rem,5vw,4.75rem)]"
    >
      <div className="mx-auto grid max-w-6xl items-start gap-[clamp(2.25rem,4vw,3.5rem)] px-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-[22px] flex items-start gap-2.5">
            <span className="mt-1.5 size-[7px] shrink-0 rounded-full bg-flag alma-pulse" />
            <span className="min-w-0 text-xs font-semibold leading-snug tracking-[0.14em] text-muted-foreground uppercase">
              Gebaut in Wien · alle neun Bundesländer
            </span>
          </div>
          <h1 className="font-display text-[clamp(2.375rem,5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-pretty">
            Silvia kennt Ihre Katze wie ihre Westentasche.
          </h1>
          <p
            id={DESK_HOME_HERO_COPY_ID}
            className="mt-[22px] max-w-[34em] text-[clamp(1rem,1.25vw,1.22rem)] leading-[1.58] text-[#4A453D]"
          >
            {demo
              ? "Und sie ist aus Österreich. Nicht importiert, kein „Hallo am Apparat“ – sondern Grüß Gott, offen von 8 bis 12 und von 14 bis 18. Und sie weiß, dass der Kater Fritz nur in der Box zu Ihnen kommt, weil er sich sonst nicht einfangen lässt."
              : "Und sie ist aus Österreich. Nicht importiert, nicht Hallo am Apparat – Grüß Gott. Die Tafel liegt auf dem Schreib-Rechner."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {demo ? (
              <span id={DESK_HOME_HEAR_ID}>
                <HearSilvia
                  label="Marin anhören"
                  sampleSrc="/sounds/voices/silvia-live-marin.wav"
                  className="h-[50px] rounded-[3px] border-primary bg-primary px-6 text-[15.5px] font-semibold text-primary-foreground hover:bg-[#173729] hover:text-primary-foreground"
                />
              </span>
            ) : null}
            {demo ? (
              <DemoRequestButton
                id={DESK_HOME_TESTEN_ID}
                size="lg"
                variant="outline"
                className="h-[50px] rounded-[3px] border-[#C9C1AE] bg-transparent px-6 text-[15.5px] font-semibold hover:border-foreground hover:bg-card"
              >
                Demo und Test besprechen
              </DemoRequestButton>
            ) : (
              <Button
                size="lg"
                variant="outline"
                className="h-[50px] rounded-[3px]"
                asChild
              >
                <Link id={DESK_HOME_HERO_TAFEL_ID} to="/app">
                  Zur Tafel
                </Link>
              </Button>
            )}
          </div>
          {demo ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Vorbereitete GPT-Live-1-Aufnahme mit Marin – das interaktive
              Gespräch ist erst nach Freigabe verfügbar.
            </p>
          ) : null}
          {anzeigeLine ? null : (
            <p className="mt-[22px] max-w-[32em] border-l-2 border-border pl-3.5 text-[14.5px] leading-relaxed text-muted-foreground">
              <span className="lg:hidden">Testen Sie Silvia direkt hier.</span>
              <span className="hidden lg:inline">
                Testen Sie Silvia direkt hier.
              </span>{" "}
              Anrufen, nach dem Fritz fragen – oder auf{" "}
              <strong className="font-semibold text-foreground">
                Trainieren
              </strong>{" "}
              stellen und Silvia sagen, wie es in Ihrer Ordination zugeht.
            </p>
          )}
          {demo ? (
            <div id={DESK_HOME_MITTAG_ID} className="mt-5 max-w-[32em]">
              <div className="flex items-center gap-3 rounded-[3px] border border-border border-l-[3px] border-l-warn bg-[#F4F0E6] px-4 py-3">
                <span className="font-display text-[15px] font-semibold text-warn">
                  12–14
                </span>
                <span className="text-[13.5px] leading-snug text-[#4A453D]">
                  Mittagspause. Die Ordination hat zu – Silvia hebt trotzdem ab.
                </span>
              </div>
            </div>
          ) : null}
          {demo ? (
            <a
              href="#film"
              className="mt-[22px] inline-flex border-b border-[#BFD3C6] pb-0.5 text-[14.5px] font-semibold text-primary no-underline hover:border-primary"
            >
              Produktfilm ansehen · 32 Sekunden →
            </a>
          ) : null}
        </div>
        <div className="flex min-w-0 justify-center">
          {anzeigeLine ? (
            <div className="max-w-md self-center">
              <p
                id={DESK_HOME_ANZEIGE_ID}
                className="text-sm text-muted-foreground"
              >
                {anzeigeLine}
              </p>
              <Link
                to="/login"
                className="mt-4 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
              >
                Anmelden
              </Link>
            </div>
          ) : (
            <SprechenCall layout="embed" forceDemo />
          )}
        </div>
      </div>
    </section>
  );
}

export function Cities() {
  return (
    <section className="border-y border-border bg-[#F4F0E6]">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-6 py-[18px] text-[13px]">
        {BUNDESLAENDER.map((land, i) => (
          <span key={land} className="contents">
            {i > 0 ? <span className="text-[#C9C1AE]">·</span> : null}
            <span
              className={i === 0 ? "font-semibold" : "text-muted-foreground"}
            >
              {land}
            </span>
          </span>
        ))}
      </p>
    </section>
  );
}
