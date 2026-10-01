import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-footer";
import { COMPANY } from "@/lib/alma/data";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import {
  DATENSCHUTZ_WA,
  DESK_DATENSCHUTZ_ID,
  DESK_DATENSCHUTZ_STORE_ID,
  datenschutzStore,
} from "@/lib/practice/desk-legal";

export const Route = createFileRoute("/datenschutz")({
  loader: async () => ({ anzeige: await loadTafelAnzeigeFlag() }),
  component: DatenschutzPage,
});

function DatenschutzPage() {
  const { anzeige } = Route.useLoaderData();
  return (
    <SiteShell anzeige={anzeige}>
      <main id={DESK_DATENSCHUTZ_ID} className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl font-semibold">Datenschutz</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          DSGVO und österreichisches Datenschutzgesetz (DSG).
        </p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            Verantwortliche Stelle ist die {COMPANY.name}, {COMPANY.street}, {COMPANY.zip}{" "}
            {COMPANY.city}, {COMPANY.email}.
          </p>
          <p>
            Silvia verarbeitet Gesprächs- und Chatprotokolle im Auftrag der jeweiligen Ordination
            (Art. 28 DSGVO). Rechtsgrundlage gegenüber Endkundinnen ist der Vertrag mit der
            Ordination (Art. 6 Abs. 1 lit. b) sowie berechtigte Interessen an Erreichbarkeit und
            Dokumentation (lit. f). Gesundheitsdaten im engeren Sinn werden nicht diagnostisch
            ausgewertet.
          </p>
          <p>{DATENSCHUTZ_WA}</p>
          <p>
            Sie haben Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und
            Widerspruch. Beschwerde: Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030
            Wien.
          </p>
          <p id={DESK_DATENSCHUTZ_STORE_ID}>{datenschutzStore(anzeige)}</p>
        </div>
      </main>
    </SiteShell>
  );
}
