import { createFileRoute, Link } from "@tanstack/react-router";
import { ChipLookup, LunchBanner, NightBoard, ReiseCheck } from "@/components/killers";
import { SiteShell } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import {
  DESK_WERKZEUGE_AKTE_ID,
  DESK_WERKZEUGE_CHIP_ID,
  DESK_WERKZEUGE_FRITZ_ID,
  DESK_WERKZEUGE_HEAD_ID,
  DESK_WERKZEUGE_LEAD_ID,
  DESK_WERKZEUGE_MITTAG_ID,
  DESK_WERKZEUGE_NACHT_ID,
  DESK_WERKZEUGE_REISE_ID,
  demoAkteNavTo,
  homePublicShowsDemo,
  sprechenPublicNavTo,
  werkzeugePublicHeading,
  werkzeugePublicLead,
} from "@/lib/practice/tafel-anzeige";

export const Route = createFileRoute("/werkzeuge")({
  loader: async () => ({ anzeige: await loadTafelAnzeigeFlag() }),
  component: WerkzeugePage,
});

function WerkzeugePage() {
  const { anzeige } = Route.useLoaderData();
  return (
    <SiteShell anzeige={anzeige}>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Killer-Features</p>
        <h1 id={DESK_WERKZEUGE_HEAD_ID} className="mt-2 font-display text-4xl font-semibold">
          {werkzeugePublicHeading(anzeige)}
        </h1>
        <p id={DESK_WERKZEUGE_LEAD_ID} className="mt-4 max-w-xl text-muted-foreground">
          {werkzeugePublicLead(anzeige)}
        </p>
        {homePublicShowsDemo(anzeige) ? (
          <div id={DESK_WERKZEUGE_MITTAG_ID} className="mt-6">
            <LunchBanner />
          </div>
        ) : null}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {homePublicShowsDemo(anzeige) ? (
            <div id={DESK_WERKZEUGE_CHIP_ID}>
              <ChipLookup />
            </div>
          ) : null}
          {homePublicShowsDemo(anzeige) ? (
            <div id={DESK_WERKZEUGE_REISE_ID}>
              <ReiseCheck anzeige={anzeige} />
            </div>
          ) : null}
          {homePublicShowsDemo(anzeige) ? (
            <div id={DESK_WERKZEUGE_NACHT_ID}>
              <NightBoard />
            </div>
          ) : null}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Praxissoftware-Anbindung</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">
              {homePublicShowsDemo(anzeige) ? "Akte-Demo mit Beispieldaten" : "Akte"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {homePublicShowsDemo(anzeige)
                ? "Die Wissensdatenbank der Ordination als Demo. Ohne Akte legt sie nur Slots. Mit Akte zeigt sie, welche Hinweise der Tierarzthelferin hinterlegt sind. Eine Praxissoftware-Anbindung wird separat geprüft."
                : "Die Kartei der Ordination liegt auf der Tafel."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {homePublicShowsDemo(anzeige) ? (
                <Button asChild>
                  <Link id={DESK_WERKZEUGE_FRITZ_ID} to={sprechenPublicNavTo(anzeige)}>
                    Nach Fritz fragen
                  </Link>
                </Button>
              ) : null}
              <Button variant="outline" asChild>
                <Link id={DESK_WERKZEUGE_AKTE_ID} to={demoAkteNavTo(anzeige)}>
                  Kartei öffnen
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
