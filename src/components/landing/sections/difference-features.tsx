import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Kicker, Display } from "@/components/landing/landing-shared";
import { DIFFERENCE, FEATURES } from "@/lib/alma/data";
import {
  DESK_HOME_DIFFERENCE_ID,
  DESK_HOME_DIFFERENCE_NACHT_ID,
  DESK_HOME_DIFFERENCE_REGISTER_ID,
  DESK_HOME_DIFFERENCE_WA_ID,
  DESK_HOME_FEATURES_FEIER_ID,
  DESK_HOME_FEATURES_ID,
  DESK_HOME_FEATURES_LEAD_ID,
  DESK_HOME_FEATURES_NACHT_ID,
  DESK_HOME_FEATURES_PMS_ID,
  DESK_HOME_FEATURES_PROTOKOLL_ID,
  DESK_HOME_FEATURES_WA_ID,
  DESK_HOME_NIGHT_ID,
  DESK_LANDING_PRAXISTAFEL_ID,
  demoPublicNavTo,
  homePublicDifference,
  homePublicFeatures,
  homePublicFeaturesLead,
} from "@/lib/practice/tafel-anzeige";

export function Difference({ anzeige = false }: { anzeige?: boolean }) {
  const rows = homePublicDifference(DIFFERENCE, anzeige);
  return (
    <section
      id={DESK_HOME_DIFFERENCE_ID}
      className="mx-auto max-w-6xl px-6 py-[clamp(3.5rem,6vw,5rem)]"
    >
      <Kicker>Für Ihre Ordination</Kicker>
      <Display className="max-w-[36em]">
        Für die Abläufe Ihrer Ordination
      </Display>
      <div className="mt-9 overflow-hidden rounded bg-card ring-1 ring-border">
        <div className="grid grid-cols-[1fr_1fr] border-b border-border bg-[#F4F0E6] px-4 py-3 text-[11.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:grid-cols-[8rem_1fr_1fr] sm:px-4">
          <span className="hidden sm:block">Thema</span>
          <span className="text-primary">Silvia</span>
          <span>Vor dem Einsatz klären</span>
        </div>
        {rows.map((row) => {
          const wa = /WhatsApp|wa\.me/i.test(`${row.title} ${row.ours}`);
          const nacht =
            /^Nacht$/i.test(row.title) ||
            /Tiernotruf|Notfall auf der Tafel/i.test(row.ours);
          const register =
            /Register|Heimtier|Hundeabgabe|Chip in der Akte/i.test(
              `${row.title} ${row.ours}`,
            );
          return (
            <div
              key={row.title}
              id={
                wa
                  ? DESK_HOME_DIFFERENCE_WA_ID
                  : nacht
                    ? DESK_HOME_DIFFERENCE_NACHT_ID
                    : register
                      ? DESK_HOME_DIFFERENCE_REGISTER_ID
                      : undefined
              }
              className="grid grid-cols-1 border-b border-border last:border-0 sm:grid-cols-[8rem_1fr_1fr]"
            >
              <p className="px-4 pt-4 text-[13.5px] font-semibold sm:py-4">
                {row.title}
              </p>
              <p className="px-4 pb-2 text-[13.5px] leading-snug sm:py-4">
                {row.ours}
              </p>
              <p className="px-4 pb-4 text-[13.5px] leading-snug text-muted-foreground sm:py-4">
                {row.other}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FeatureGrid({ anzeige = false }: { anzeige?: boolean }) {
  const features = homePublicFeatures(FEATURES, anzeige);
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-primary py-[clamp(3.5rem,6vw,5rem)] text-primary-foreground"
    >
      <div id={DESK_HOME_FEATURES_ID} className="mx-auto max-w-6xl px-6">
        <Display className="max-w-[38em] text-primary-foreground">
          Alles, was die Rezeption tut. Nichts, was der Kammer gehört.
        </Display>
        <p
          id={DESK_HOME_FEATURES_LEAD_ID}
          className="mt-[18px] max-w-[38em] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-[#C6D8CD]"
        >
          {homePublicFeaturesLead(anzeige)}
        </p>
        <div className="mt-10 grid overflow-hidden rounded ring-1 ring-[#356153] sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const wa = /WhatsApp/i.test(`${f.title} ${f.body}`);
            const nacht = /Notfall/i.test(f.title);
            const pms = /Systeme|vetera|easyVET|Vquadrat/i.test(
              `${f.title} ${f.body}`,
            );
            const protokoll = /Protokoll|Praxissoftware/i.test(
              `${f.title} ${f.body}`,
            );
            const feier = /offen halten|Feiertage bleiben geschlossen/i.test(
              `${f.title} ${f.body}`,
            );
            return (
              <article
                key={f.title}
                id={
                  wa
                    ? DESK_HOME_FEATURES_WA_ID
                    : nacht
                      ? DESK_HOME_FEATURES_NACHT_ID
                      : pms
                        ? DESK_HOME_FEATURES_PMS_ID
                        : protokoll
                          ? DESK_HOME_FEATURES_PROTOKOLL_ID
                          : feier
                            ? DESK_HOME_FEATURES_FEIER_ID
                            : undefined
                }
                className="border-b border-[#356153] bg-primary px-[22px] py-[26px] sm:border-r"
              >
                <h3 className="font-display text-[19px] font-semibold tracking-[-0.015em]">
                  {f.title}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-snug text-[#C6D8CD]">
                  {f.body}
                </p>
              </article>
            );
          })}
        </div>
        <div className="mt-9">
          <Button
            variant="secondary"
            size="lg"
            className="h-[50px] rounded-[3px] bg-primary-foreground px-6 text-[15.5px] font-semibold text-primary hover:bg-white"
            asChild
          >
            <Link
              id={DESK_LANDING_PRAXISTAFEL_ID}
              to={demoPublicNavTo(anzeige)}
            >
              Den Tageskalender öffnen →
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Night() {
  return (
    <section
      id={DESK_HOME_NIGHT_ID}
      className="mx-auto grid max-w-6xl items-center gap-[clamp(2rem,4vw,3.5rem)] px-6 py-[clamp(3.5rem,6vw,5rem)] lg:grid-cols-2"
    >
      <div className="overflow-hidden rounded-md">
        <img
          src="/images/night.jpg"
          alt="Tierordination in Wien bei Nacht, warmes Licht hinter den Fenstern"
          className="aspect-[4/3] w-full object-cover"
        />
      </div>
      <div>
        <span className="mb-5 inline-block rounded-full bg-night px-2.5 py-1 text-[11.5px] font-semibold tracking-[0.1em] text-night-foreground uppercase">
          Nachtdienst
        </span>
        <Display>Um drei Uhr früh liegt der Fall auf der Tafel.</Display>
        <p className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.15rem)] leading-relaxed text-muted-foreground">
          Routine bekommt den nächsten freien Termin. Atemnot, Blutung, Krampf,
          Giftköder: Silvia legt den Fall auf die Praxistafel. Die
          Tierarzthelferin prüft ihn und öffnet den hinterlegten Nachtdienstkontakt.
        </p>
        <ul className="mt-6 space-y-3 text-[14.5px]">
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ok" />
            Das Protokoll liegt auf der Tafel, bevor jemand anruft.
          </li>
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ok" />
            Kein medizinischer Rat – die menschliche Abnahme bleibt bei der Ordination.
          </li>
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ok" />
            Im Zweifel immer hinauf, nie hinunter: unklar heißt Nachtdienst.
          </li>
          <li className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ok" />
            Der Fall und die Mitschrift liegen auf der Praxistafel.
          </li>
        </ul>
      </div>
    </section>
  );
}
