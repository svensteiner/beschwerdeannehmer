import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { DemoRequestButton } from "@/components/demo-request-dialog";
import { SiteShell } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AT_HOLIDAYS, ADDON_AKTE } from "@/lib/alma/data";
import { SILVIA_PAKETE } from "@/lib/silvia-pakete";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import {
  DESK_PREISE_AKTE_ID,
  DESK_PREISE_FAQ_ID,
  DESK_PREISE_FAQ_NACHT_ID,
  DESK_PREISE_FAQ_WA_ID,
  DESK_PREISE_LEAD_ID,
  DESK_PREISE_FEIER_ID,
  homePublicShowsDemo,
} from "@/lib/practice/tafel-anzeige";

const SILVIA_PREISE_FAQ = [
  { q: "Was ist Silvia Premium?", a: "Silvia Premium ist die lokale Praxisversion mit warmer weiblicher Stimme. Sie kann vor der Einrichtung als Demo mit Beispieldaten ausprobiert werden." },
  { q: "Was ist Silvia Live?", a: "Silvia Live ist die separate GPT-Live-1-Demo mit Marin. Sie ist technisch isoliert, standardmäßig gesperrt und darf nur nach ausdrücklicher Freigabe mit erfundenen Inhalten gestartet werden. Echte Praxisdaten bleiben lokal." },
  { q: "Was kostet ein Paket?", a: "Leistungsumfang und Preis vereinbaren wir gemeinsam. Die Pakete sind noch nicht final bepreist." },
  { q: "Was ist die Akte-Demo?", a: "Die Akte-Demo zeigt die Funktion mit Beispieldaten. Eine Anbindung an Ihre Praxissoftware wird separat geprüft." },
] as const;

export const Route = createFileRoute("/preise")({
  loader: async () => ({ anzeige: await loadTafelAnzeigeFlag() }),
  component: PreisePage,
});

function PreisePage() {
  const { anzeige } = Route.useLoaderData();
  const addonTagline = "Akte-Demo mit Beispieldaten für die Gesprächsversion.";
  const addonFeatures = [
    "Patienten, Chip und Hinweise der Tierarzthelferin in der Demo",
    "Eigene Tiere in der Demo nachtragen",
    "Praxissoftware-Anbindung separat zu prüfen",
  ];
  return (
    <SiteShell anzeige={anzeige}>
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
          Preise
        </p>
        <h1 className="mt-2 max-w-2xl font-display text-4xl font-semibold">
          Zwei Silvia-Varianten. Preis nach Abstimmung.
        </h1>
        <p
          id={DESK_PREISE_LEAD_ID}
          className="mt-4 max-w-xl text-muted-foreground"
        >
          Leistungsumfang und Preis vereinbaren wir gemeinsam. Die beiden Varianten sind noch nicht final bepreist.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {SILVIA_PAKETE.map((plan) => (
            <Card
              key={plan.id}
              className={cn(plan.id === "premium" && "border-primary ring-1 ring-primary")}
            >
              <CardHeader>
                {plan.id === "premium" ? (
                  <p className="text-xs font-medium tracking-wider text-primary uppercase">
                    Lokale Praxisversion
                  </p>
                ) : null}
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <p className="pt-2 text-sm text-muted-foreground">{plan.status}</p>
                <p className="pt-2 font-display text-3xl font-semibold">Preis nach Abstimmung</p>
                <p className="text-sm text-muted-foreground">Leistungsumfang und Preis vereinbaren wir gemeinsam.</p>
              </CardHeader>
              <CardContent>
                {plan.usageNotice ? (
                  <p className="mb-4 text-sm text-muted-foreground">{plan.usageNotice}</p>
                ) : null}
                <ul className="mb-6 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.id === "premium" && homePublicShowsDemo(anzeige) ? (
                  <DemoRequestButton
                    className="w-full"
                    variant="default"
                    defaultMessage="Interesse: Silvia Premium"
                  >
                    Unverbindliche Demo-Anfrage
                  </DemoRequestButton>
                ) : plan.id === "live" ? (
                  <p className="rounded-md border border-border px-4 py-3 text-center text-sm text-muted-foreground">
                    Separate Demo · nur isoliert und nach Freigabe
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
        <section
          id={DESK_PREISE_AKTE_ID}
          className="mt-16 rounded-xl border border-primary/30 bg-card p-6 sm:p-8"
        >
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
            Praxissoftware-Anbindung
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold">
            Akte-Demo mit Beispieldaten
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground">{addonTagline}</p>
          <p className="mt-4 font-display text-2xl font-semibold">{ADDON_AKTE.monthlyText}</p>
          <p className="text-sm text-muted-foreground">
            Funktion und Demo vorhanden · Integrationsfreigabe offen
          </p>
          <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            {addonFeatures.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {homePublicShowsDemo(anzeige) ? (
              <DemoRequestButton defaultMessage="Interesse: Akte-Demo">
                    Unverbindliche Akte-Anfrage
                  </DemoRequestButton>
            ) : (
              <Button asChild>
                <Link to="/app">Zur Tafel</Link>
              </Button>
            )}
          </div>
        </section>
        <section id={DESK_PREISE_FEIER_ID} className="mt-20">
          <h2 className="font-display text-2xl font-semibold">
            Feiertagsregeln für Ihre Ordination
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Beispiele für Kalenderregeln. Öffnungszeiten, Schließtage und Nachtdienst werden für Ihre Ordination abgestimmt.
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {AT_HOLIDAYS.map((h) => (
              <li
                key={h.name}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <span>{h.name}</span>
                <span className="text-muted-foreground">{h.date}</span>
              </li>
            ))}
          </ul>
        </section>
        {SILVIA_PREISE_FAQ.length ? (
          <section id={DESK_PREISE_FAQ_ID} className="mx-auto mt-20 max-w-3xl">
            <h2 className="font-display text-2xl font-semibold">
              Fragen zu den Varianten
            </h2>
            <Accordion type="single" collapsible className="mt-6">
              {SILVIA_PREISE_FAQ.map((item) => {
                const text = `${item.q} ${item.a}`;
                const wa = /Kanal eins|wa\.me-Entwurf/i.test(text);
                const nacht = /Nachtdienst/i.test(item.q);
                return (
                  <AccordionItem
                    key={item.q}
                    value={item.q}
                    id={
                      wa
                        ? DESK_PREISE_FAQ_WA_ID
                        : nacht
                          ? DESK_PREISE_FAQ_NACHT_ID
                          : undefined
                    }
                  >
                    <AccordionTrigger>{item.q}</AccordionTrigger>
                    <AccordionContent>{item.a}</AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </section>
        ) : null}
      </main>
    </SiteShell>
  );
}
