import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-footer";
import { COMPANY } from "@/lib/alma/data";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";

export const Route = createFileRoute("/avv")({
  loader: async () => ({ anzeige: await loadTafelAnzeigeFlag() }),
  component: AvvPage,
});

function AvvPage() {
  const { anzeige } = Route.useLoaderData();
  return (
    <SiteShell anzeige={anzeige}>
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl font-semibold">
          Auftragsverarbeitungsvertrag (Muster)
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">nach Art. 28 DSGVO</p>

        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Muster – vor Nutzung juristisch prüfen lassen. Keine Rechtsberatung.
        </div>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <p>
            Dieser Auftragsverarbeitungsvertrag (AVV) regelt die Verarbeitung personenbezogener
            Daten durch die {COMPANY.name}, {COMPANY.street}, {COMPANY.zip} {COMPANY.city}
            ("Auftragsverarbeiter", "Silvia") im Auftrag der jeweiligen Tierarztpraxis
            ("Verantwortlicher") gemäß Art. 28 DSGVO.
          </p>

          <Section title="1. Gegenstand und Dauer">
            <p>
              Gegenstand ist die Verarbeitung personenbezogener Daten durch Silvia im Rahmen der
              Telefonannahme, Terminvereinbarung und Anbindung an die Praxissoftware des
              Verantwortlichen. Die Laufzeit dieses AVV entspricht der Laufzeit des zugrunde
              liegenden Hauptvertrags (Silvia-Nutzungsvertrag) zwischen den Parteien.
            </p>
          </Section>

          <Section title="2. Art und Zweck der Verarbeitung">
            <p>
              Silvia verarbeitet Daten zum Zweck der telefonischen und digitalen Rezeption der
              Praxis: Entgegennahme von Anrufen, Vereinbarung, Verschiebung und Stornierung von
              Terminen, sowie den dafür notwendigen Datenaustausch mit der eingesetzten
              Praxissoftware (z. B. Terminkalender, Kundendaten).
            </p>
          </Section>

          <Section title="3. Art der Daten und Kategorien betroffener Personen">
            <p>
              Verarbeitet werden insbesondere: Halterdaten (Name, Kontaktdaten, Adresse),
              Tierdaten (Name, Art, Rasse, Anliegen), Rufnummern sowie Gesprächsinhalte
              (Transkripte bzw. Zusammenfassungen von Telefonaten). Betroffene Personen sind
              Tierhalterinnen und Tierhalter sowie sonstige anrufende Personen der Praxis.
            </p>
          </Section>

          <Section title="4. Pflichten des Auftragsverarbeiters">
            <ul className="list-disc space-y-1 pl-5">
              <li>Verarbeitung ausschließlich auf dokumentierte Weisung des Verantwortlichen.</li>
              <li>Gewährleistung der Vertraulichkeit bei allen zugriffsberechtigten Personen.</li>
              <li>Umsetzung angemessener technischer und organisatorischer Maßnahmen (TOM).</li>
              <li>Unterstützung bei Betroffenenrechten, Meldepflichten und Datenschutz-Folgenabschätzungen.</li>
              <li>Löschung oder Rückgabe der Daten nach Beendigung der Verarbeitung.</li>
              <li>Bereitstellung aller zur Kontrolle erforderlichen Informationen.</li>
            </ul>
          </Section>

          <Section title="5. Weisungsrecht">
            <p>
              Der Verantwortliche ist berechtigt, Weisungen zu Art, Umfang und Verfahren der
              Verarbeitung zu erteilen. Silvia verarbeitet Daten ausschließlich im Rahmen dieser
              Weisungen und des Hauptvertrags; eine eigenmächtige Zweckänderung erfolgt nicht.
            </p>
          </Section>

          <Section title="6. Unterauftragsverarbeiter">
            <p>Der Verantwortliche stimmt dem Einsatz folgender Unterauftragsverarbeiter zu:</p>
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Dienstleister</th>
                    <th className="px-3 py-2 font-medium">Zweck</th>
                    <th className="px-3 py-2 font-medium">Ort der Verarbeitung</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2">[Platzhalter: OpenAI / Azure OpenAI]</td>
                    <td className="px-3 py-2">Spracherkennung, Sprachsynthese, Textverarbeitung (KI-Modelle)</td>
                    <td className="px-3 py-2">[Platzhalter: EU-Region]</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2">[Platzhalter: Hosting-Anbieter]</td>
                    <td className="px-3 py-2">Hosting der Anwendung und Datenspeicherung</td>
                    <td className="px-3 py-2">[Platzhalter: EU-Region]</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2">[Platzhalter: Telefonie-Anbieter]</td>
                    <td className="px-3 py-2">Anbindung und Vermittlung von Telefonanrufen</td>
                    <td className="px-3 py-2">[Platzhalter: EU-Region]</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              Änderungen an Unterauftragsverarbeitern werden der Praxis vorab in Textform
              angekündigt; die Praxis kann diesen Änderungen innerhalb von 14 Tagen widersprechen
              (Art. 28 Abs. 2 DSGVO). Die aktuelle Liste der Unterauftragsverarbeiter kann jederzeit
              bei Silvia angefordert werden.
            </p>
          </Section>

          <Section title="7. Technische und organisatorische Maßnahmen (TOM)">
            <ul className="list-disc space-y-1 pl-5">
              <li>Lokale Datenhaltung auf dem Praxis-PC, keine unnötige Datenverlagerung.</li>
              <li>Definierte Aufbewahrungsfristen (Retention) für Gesprächsdaten und Protokolle.</li>
              <li>Rollenbasierte Zugriffsrechte (z. B. Inhaberin, Kassa) mit getrennten Berechtigungen.</li>
              <li>Absicherung von Schnittstellen über Bearer-Tokens.</li>
              <li>Protokollierung sicherheitsrelevanter Zugriffe und Ereignisse.</li>
            </ul>
          </Section>

          <Section title="8. Löschung nach Vertragsende">
            <p>
              Nach Beendigung der Leistungserbringung löscht Silvia sämtliche im Auftrag
              verarbeiteten personenbezogenen Daten oder gibt sie auf Wunsch des Verantwortlichen
              heraus, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
            </p>
          </Section>

          <Section title="9. Kontrollrechte">
            <p>
              Der Verantwortliche ist berechtigt, sich im angemessenen Rahmen von der Einhaltung
              der in diesem Vertrag vereinbarten Pflichten zu überzeugen, insbesondere durch
              Einholung von Auskünften und Nachweisen.
            </p>
          </Section>

          <Section title="10. Haftung">
            <p>
              Es gelten die gesetzlichen Haftungsregelungen der DSGVO (Art. 82). Im Übrigen
              richtet sich die Haftung nach den Bestimmungen des Hauptvertrags zwischen den
              Parteien.
            </p>
          </Section>

          <Section title="11. Schlussbestimmungen">
            <p>
              Änderungen und Ergänzungen dieses AVV bedürfen der Schriftform. Sollte eine
              Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
              Es gilt österreichisches Recht.
            </p>
          </Section>

          <Section title="Praxisdaten (Verantwortlicher)">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium tracking-wider uppercase">Praxisname</dt>
                <dd>[Platzhalter]</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wider uppercase">Anschrift</dt>
                <dd>[Platzhalter]</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wider uppercase">Vertretung</dt>
                <dd>[Platzhalter]</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wider uppercase">Datum</dt>
                <dd>[Platzhalter]</dd>
              </div>
            </dl>
          </Section>

          <Section title="Unterschriften">
            <div className="mt-2 grid grid-cols-1 gap-8 sm:grid-cols-2">
              <div className="border-t border-border pt-2">
                Für {COMPANY.name} (Auftragsverarbeiter)
                <br />
                [Platzhalter: Ort, Datum, Unterschrift]
              </div>
              <div className="border-t border-border pt-2">
                Für die Praxis (Verantwortlicher)
                <br />
                [Platzhalter: Ort, Datum, Unterschrift]
              </div>
            </div>
          </Section>
        </div>
      </main>
    </SiteShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
