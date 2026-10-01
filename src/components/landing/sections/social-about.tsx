import { Kicker, Display } from "@/components/landing/landing-shared";
import { TeamTile } from "@/components/landing/team-tile";
import { DESK_HOME_SOCIAL_ID } from "@/lib/practice/tafel-anzeige";

export const SOCIAL_SCENARIOS = [
  { title: "Außerhalb der Öffnungszeiten", text: "Silvia nimmt das Anliegen auf und hinterlegt eine Nachricht für das Praxisteam." },
  { title: "Rückrufwunsch", text: "Silvia nimmt den Rückrufwunsch auf; das Praxisteam prüft ihn anschließend." },
  { title: "Terminwunsch", text: "Silvia fragt nach dem Anliegen und schlägt nach den vorhandenen Regeln einen Termin vor, der bestätigt werden muss." },
] as const;

export function Social() {
  return (
    <section
      id={DESK_HOME_SOCIAL_ID}
      className="border-t border-border bg-[#F4F0E6] py-[clamp(3.5rem,6vw,5rem)]"
    >
      <div className="mx-auto max-w-6xl px-6">
        <Display className="mb-9">
          Beispielszenarien für Ihre Ordination
        </Display>
        <div className="grid gap-4 md:grid-cols-3">
          {SOCIAL_SCENARIOS.map((scenario) => (
            <article
              key={scenario.title}
              className="flex flex-col gap-[18px] rounded bg-card px-6 py-[26px] ring-1 ring-border"
            >
              <p className="font-display text-lg leading-[1.45] tracking-[-0.01em]">
                {scenario.title}
              </p>
              <footer className="mt-auto text-[13px] leading-[1.5] text-muted-foreground">
                {scenario.text}
              </footer>
            </article>
          ))}
        </div>
        <div className="mt-9 overflow-hidden rounded-md bg-[#EDE7D9]">
          <img
            src="/images/exam.jpg"
            alt="Untersuchung einer Katze in einer österreichischen Ordination"
            className="aspect-[21/9] w-full object-cover object-[center_35%]"
          />
        </div>
      </div>
    </section>
  );
}

export function About() {
  return (
    <section
      id="ueber-uns"
      className="scroll-mt-20 py-[clamp(3.5rem,6vw,5rem)]"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 max-w-[36em]">
          <Kicker>Über uns</Kicker>
          <Display>
            Gebaut in Wien, von Leuten, die Prozesse ernst nehmen.
          </Display>
          <p className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-muted-foreground">
            Silvia kommt aus dem AI_Studioxyz in Wien und von{" "}
            <a href="https://www.bizzsoft.at" target="_blank" rel="noopener noreferrer" className="text-foreground underline-offset-4 hover:underline">
              bizzsoft.at
            </a>
            , dem Haus hinter Vquadrat. Dort automatisieren wir seit Jahren die
            Abläufe, die ein Team aufhalten – Silvia ist dieselbe Arbeit, nur am
            Empfang der Ordination.
          </p>
        </div>
        <p className="mb-5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Das Team
        </p>
        <p className="mb-6 max-w-[36em] text-sm leading-relaxed text-muted-foreground">
          Die Firmen hinter Silvia: aistudioxyz und{" "}
          <a
            href="https://www.bizzsoft.at"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            bizzSoft
          </a>
          .
        </p>
        <div className="mb-6 rounded-md bg-card px-6 py-5 ring-1 ring-border">
          <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Warum das zählt
          </p>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              Vquadrat-Anbindung in Prüfung; Termine liegen zunächst auf der Praxistafel.
            </li>
            <li>Über 20 Jahre Erfahrung mit Tierarztpraxen im Team.</li>
          </ul>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TeamTile
            name="Mag. Sven Steiner"
            role="Gründer von Silvia · Interim CFO · WKO Beraterpool Wien"
            photo="/images/sven-steiner.jpg"
            initials="SS"
            intro="Fünfzehn Jahre lang war mein Handwerk, Abläufe so zu bauen, dass sie eine Prüfung überstehen: jede Zahl bis zum Beleg nachvollziehbar, jeder Schritt dokumentiert. Eine Ordination braucht am Empfang genau dasselbe – nur heißt der Beleg dort Anruf."
            cv={[
              "Bitpanda – Finance Director: reguliertes Umfeld, hohes Tempo – Prozesse müssen halten, wenn das Volumen kippt.",
              "Volksbank – Head of Group Accounting: Konzernrechnungswesen unter Aufsicht, Dokumentation als Pflicht, nicht als Kür.",
              "BUWOG, BIG, STRABAG – Controlling in großen österreichischen Häusern, gelernt wie hier wirklich gearbeitet wird.",
              "Wirtschaftsprüfung – Maßstab dahinter: Was nicht dokumentiert ist, ist nicht passiert.",
              "Baut und betreibt Silvia in Wien selbst – kein Konzept zum Übergeben, sondern eine Rezeption, die im Alltag trägt.",
            ]}
          />
          <TeamTile
            name="Christian Ukobitz"
            role="Developer & Datenbankspezialist · CEO bizzSoft GmbH"
            photo="/images/christian-ukobitz.jpg"
            initials="CU"
            intro="Seit über 20 Jahren arbeitet er mit Tierärztinnen und Tierärzten; er kennt den Praxisalltag von der Terminvergabe bis zur Abrechnung aus hunderten Ordinationen."
            cv={[
              "Über 20 Jahre Softwareentwicklung für Tierarztpraxen.",
              "Architekt und Datenbankspezialist hinter Vquadrat (Firebird-Datenbank, Terminplanung, Abrechnung, Labor- und Geräteanbindung).",
              "CEO der bizzSoft GmbH, Österreich.",
              "Bei Silvia verantwortlich für die Praxissoftware-Brücke (Vquadrat-Anbindung), Datenmodell und Datensicherheit.",
              "Sparringspartner für alles, was in der Ordination wirklich passiert.",
            ]}
            links={[
              { label: "bizzsoft.at", href: "https://www.bizzsoft.at" },
              { label: "vquadrat.com", href: "https://www.vquadrat.com" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
