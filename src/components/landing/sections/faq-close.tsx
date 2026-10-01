import { Link } from "@tanstack/react-router";
import { DemoRequestButton } from "@/components/demo-request-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CloseRegisterCta,
  Kicker,
  Display,
} from "@/components/landing/landing-shared";
import { FAQ } from "@/lib/alma/data";
import {
  DESK_HOME_CLOSE_ID,
  DESK_HOME_FAQ_ID,
} from "@/lib/practice/tafel-anzeige";

export function Faq() {
  return (
    <section
      id={DESK_HOME_FAQ_ID}
      className="border-t border-border bg-[#F4F0E6] py-[clamp(3.5rem,6vw,5rem)]"
    >
      <div className="mx-auto max-w-[52rem] px-6">
        <Display className="mb-8">Häufige Fragen</Display>
        <Accordion type="single" collapsible className="mt-2">
          {FAQ.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger className="text-[16.5px] font-semibold">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-[38em] text-[15px] leading-[1.6] text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function Daten() {
  return (
    <section className="border-t border-border bg-[#F4F0E6] py-[clamp(3.5rem,6vw,5rem)]">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-9 max-w-[38em]">
          <Kicker>Ihre Daten</Kicker>
          <Display>Was mit Ihren Anrufen und Daten geschieht.</Display>
          <p className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-muted-foreground">
            Vor dem Praxisbetrieb besprechen wir, welche Daten verarbeitet,
            exportiert und gelöscht werden.
          </p>
        </div>
        <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded bg-card p-6 ring-1 ring-border">
            <h3 className="font-display text-lg font-semibold tracking-[-0.015em]">
              Export, bevor Sie gehen
            </h3>
            <p className="mt-2.5 text-sm leading-[1.55] text-muted-foreground">
              Wir besprechen gemeinsam, welche Protokolle, Termine und Notizen
              Sie für Ihre Ordination exportieren können.
            </p>
          </article>
          <article className="rounded bg-card p-6 ring-1 ring-border">
            <h3 className="font-display text-lg font-semibold tracking-[-0.015em]">
              Aufbewahrung und Löschung
            </h3>
            <p className="mt-2.5 text-sm leading-[1.55] text-muted-foreground">
              Vor dem Praxisbetrieb legen wir fest, welche Daten wie lange
              aufbewahrt und wie sie gelöscht werden.
            </p>
          </article>
          <article className="rounded bg-card p-6 ring-1 ring-border">
            <h3 className="font-display text-lg font-semibold tracking-[-0.015em]">
              Datenverarbeitung gemeinsam klären
            </h3>
            <p className="mt-2.5 text-sm leading-[1.55] text-muted-foreground">
              Anbieter, Speicherort und Auftragsverarbeitung nach Art. 28
              DSGVO prüfen wir gemeinsam vor dem Praxisbetrieb.
            </p>
          </article>
          <article className="rounded bg-card p-6 ring-1 ring-border">
            <h3 className="font-display text-lg font-semibold tracking-[-0.015em]">
              Gesprächsprotokoll
            </h3>
            <p className="mt-2.5 text-sm leading-[1.55] text-muted-foreground">
              Im Gespräch entsteht eine Mitschrift. Ob Tonaufnahmen, eine
              Einwilligungsansage und welche Aufbewahrung gelten, legen wir vor
              dem Einsatz gemeinsam fest.
            </p>
          </article>
        </div>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-muted-foreground">
          <Link
            to="/datenschutz"
            className="border-b border-[#BFD3C6] pb-0.5 font-semibold text-primary no-underline hover:border-primary"
          >
            Datenschutzerklärung
          </Link>
          <span>
            Verantwortlich bleibt die Ordination · Silvia ist
            Auftragsverarbeiterin · DSGVO und österreichisches DSG
          </span>
        </p>
      </div>
    </section>
  );
}

export function Close() {
  return (
    <section
      id={DESK_HOME_CLOSE_ID}
      className="scroll-mt-20 bg-primary py-[clamp(3.75rem,7vw,6rem)] text-primary-foreground"
    >
      <div id="abschluss" className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="mx-auto max-w-[22em] font-display text-[clamp(1.875rem,3.6vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
          Demo und Test gemeinsam planen
        </h2>
        <p
          id="preise"
          className="mx-auto mt-[18px] max-w-[34em] scroll-mt-20 text-[clamp(0.97rem,1.2vw,1.15rem)] leading-relaxed text-[#C6D8CD]"
        >
          Sie sehen Silvia zuerst in einer Demo. Paketumfang, Testbedingungen
          und Preis stimmen wir anschließend mit Ihrer Ordination ab.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <CloseRegisterCta />
          <DemoRequestButton
            size="lg"
            variant="outline"
            className="h-[52px] rounded-[3px] border-[#5C7D6E] bg-transparent px-[26px] text-base font-semibold text-primary-foreground hover:border-primary-foreground hover:bg-transparent"
          >
            Demo anfragen
          </DemoRequestButton>
        </div>
      </div>
    </section>
  );
}
