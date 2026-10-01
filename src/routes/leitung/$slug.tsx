import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { LiveLeitungCall } from "@/components/sprechen/live-leitung-call";
import { SprechenCall } from "@/components/sprechen/sprechen-call";
import { SiteShell } from "@/components/layout/site-footer";
import { holenWaitNext } from "@/lib/practice/desk-session";
import { TAFEL_HOLEN_WAIT_HREF } from "@/lib/practice/desk-storage";
import { peekAppHolenPending } from "@/lib/practice/holen-wait-gate";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import { loadPublicLine } from "@/lib/practice/profile";
import {
  DESK_LEITUNG_FEHLT_ID,
  LEITUNG_ANZEIGE_ID,
  leitungMissingShowsAnrufen,
  leitungMissingShowsDemo,
  leitungPublicShowsLive,
  sprechenAnzeigeAuthLine,
} from "@/lib/practice/tafel-anzeige";

export const Route = createFileRoute("/leitung/$slug")({
  beforeLoad: async ({ params }) => {
    if (await peekAppHolenPending()) {
      throw redirect({
        to: TAFEL_HOLEN_WAIT_HREF,
        search: { next: holenWaitNext(`/leitung/${params.slug}`) },
      });
    }
  },
  loader: async ({ params }) => {
    const [loaded, anzeige] = await Promise.all([
      loadPublicLine({ data: { slug: params.slug } }),
      loadTafelAnzeigeFlag(),
    ]);
    return { loaded, anzeige };
  },
  component: LeitungPage,
});

function LeitungPage() {
  const { slug } = Route.useParams();
  const { loaded, anzeige } = Route.useLoaderData();
  const anzeigeLine = sprechenAnzeigeAuthLine(anzeige);

  if (anzeigeLine && !leitungPublicShowsLive(anzeige)) {
    return (
      <SiteShell anzeige={anzeige}>
        <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <p id={LEITUNG_ANZEIGE_ID} className="text-sm text-muted-foreground">
            {anzeigeLine}
          </p>
          <Link
            to="/login"
            className="mt-4 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            Anmelden
          </Link>
        </main>
      </SiteShell>
    );
  }

  if (!loaded.ok || !loaded.profile) {
    return (
      <SiteShell anzeige={anzeige} anrufen={leitungMissingShowsAnrufen(anzeige)}>
        <main id={DESK_LEITUNG_FEHLT_ID} className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Leitung</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Diese Leitung gibt es nicht.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Der Link ist ungültig oder die Ordination hat die öffentliche Leitung noch nicht eingerichtet.
          </p>
          <p className="mt-6 text-sm">
            <Link to="/" className="font-medium text-primary underline-offset-2 hover:underline">
              Zur Startseite
            </Link>
            {leitungMissingShowsDemo(anzeige) ? (
              <>
                {" · "}
                <Link to="/sprechen" search={{ mode: undefined }} className="font-medium text-primary underline-offset-2 hover:underline">
                  Silvia in der Demo anrufen
                </Link>
              </>
            ) : null}
          </p>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell anzeige={anzeige}>
      {anzeige ? null : <LiveLeitungCall slug={slug} />}
      <SprechenCall profile={loaded.profile} inboundSlug={slug} anzeige={anzeige} />
    </SiteShell>
  );
}
