import { Phone } from "lucide-react";
import { HearSilvia } from "@/components/silvia-voice";
import { SilviaVarianten } from "@/components/silvia-varianten";
import { SilviaLiveDemo } from "@/components/sprechen/silvia-live-demo";
import { Button } from "@/components/ui/button";
import { Kicker, Display } from "@/components/landing/landing-shared";
import { ProductFilm } from "@/components/landing/product-film";
import { cn } from "@/lib/utils";
import {
  DESK_HOME_CALL_ID,
  DESK_HOME_FACES_ID,
} from "@/lib/practice/tafel-anzeige";

interface CallSceneTurn {
  readonly speaker: "SILVIA" | "ANRUF";
  readonly text: string;
}

/** Example transcript for the homepage demo card: greeting, Datenabgleich, case, booking. */
const CALL_SCENE_TRANSCRIPT: readonly CallSceneTurn[] = [
  {
    speaker: "SILVIA",
    text: "Grüß Gott, Frau Leitner, Tierordination Huber, Silvia am Apparat. Ihre Anrufernummer wird mir angezeigt. Für den Datenabgleich brauche ich nur noch Ihre Adresse.",
  },
  { speaker: "ANRUF", text: "Lerchenfelder Straße 45, im Achten." },
  {
    speaker: "SILVIA",
    text: "Danke, Frau Leitner, ich hab Sie. Was kann ich für Sie tun?",
  },
  {
    speaker: "ANRUF",
    text: "Der Rudi hustet seit heute früh, und beim Fressen ist er heikel.",
  },
  {
    speaker: "SILVIA",
    text: "Der Rudi, Mischling, sieben Jahre. Seit wann genau, und ist er sonst munter?",
  },
  {
    speaker: "ANRUF",
    text: "Seit sechs in der Früh. Munter schon, aber der Husten ist trocken.",
  },
  {
    speaker: "SILVIA",
    text: "Dann schauen wir ihn uns an. Morgen um 14:20 bei der Frau Doktor, passt Ihnen das?",
  },
  { speaker: "ANRUF", text: "Ja, passt." },
  {
    speaker: "SILVIA",
    text: "Gebucht. Der Termin steht auf der Demo-Tafel. Das Team kann dort die Bestätigung öffnen und per SMS versenden. Bitte den Rudi an der Leine, und wenn es schlechter wird, rufen Sie sofort an – nachts zeigt Silvia den Nachtdienst-Kontakt nur, wenn eine Nummer hinterlegt ist.",
  },
  { speaker: "ANRUF", text: "Danke, grüß Gott." },
];

export function CallScene() {
  return (
    <section
      id={DESK_HOME_CALL_ID}
      className="bg-night py-[clamp(3.5rem,6vw,5rem)] text-night-foreground"
    >
      <div
        id="produkt"
        className="mx-auto grid max-w-6xl items-center gap-[clamp(2.25rem,4vw,3.5rem)] px-6 lg:grid-cols-2"
      >
        <div>
          <Kicker className="text-[#8FA79A]">Beispielanruf · Demo-Tafel</Kicker>
          <Display className="text-night-foreground">
            Grüß Gott, nicht Hallo. Stefanitag, nicht zweiter Weihnachtstag.
          </Display>
          <p className="mt-5 max-w-[32em] text-[clamp(0.97rem,1.2vw,1.15rem)] leading-relaxed text-[#B9C7C0]">
            Frau Leitner ruft wegen dem Rudi an. Ihre Anrufernummer und ihr Name
            sind sichtbar; Silvia fragt nur noch die Adresse für den
            Datenabgleich ab, dann geht es um den Fall. Hören
            Sie sich die Begrüßung an und rufen Sie dann selbst an.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <HearSilvia
              label="Marin anhören"
              sampleSrc="/sounds/voices/silvia-live-marin.wav"
              className="h-[50px] rounded-[3px] border-night-foreground bg-night-foreground px-6 text-[15.5px] font-semibold text-night hover:bg-white hover:text-night"
            />
            <Button
              size="lg"
              variant="outline"
              className="h-[50px] rounded-[3px] border-[#4A5B53] bg-transparent text-[15.5px] font-semibold text-night-foreground hover:border-night-foreground hover:bg-transparent hover:text-night-foreground"
              asChild
            >
              <a href="#anrufen">
                Jetzt selbst anrufen
                <Phone />
              </a>
            </Button>
          </div>
          <p className="mt-3 text-xs text-[#8FA79A]">
            Vorbereitete GPT-Live-1-Aufnahme mit Marin · nicht interaktiv
          </p>
        </div>
        <div className="flex justify-center">
          <div className="w-full max-w-[400px] rounded-md border border-[#35443E] bg-[#22302B] p-[22px]">
            <div className="mb-[18px] flex items-center gap-2.5">
              <span className="size-2 rounded-full bg-[#8FD3AE] alma-pulse" />
              <span className="text-[12.5px] font-semibold">
                Eingehender Anruf · Frau Leitner
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {CALL_SCENE_TRANSCRIPT.map((turn) => (
                <div
                  key={turn.text}
                  className={cn(
                    "max-w-[86%] rounded-[10px] px-3.5 py-2.5",
                    turn.speaker === "ANRUF" && "ml-auto",
                    turn.speaker === "SILVIA"
                      ? "bg-night-foreground text-night"
                      : "bg-white/12",
                  )}
                >
                  <p className="mb-1 text-[10px] font-semibold tracking-[0.08em] uppercase opacity-70">
                    {turn.speaker}
                  </p>
                  <p className="text-[13px] leading-snug">{turn.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-[18px] flex items-center justify-between border-t border-[#35443E] pt-4">
              <span className="font-display text-sm tabular-nums text-[#B9C7C0]">
                00:04 / 00:32
              </span>
              <span className="text-xs text-[#8FA79A]">
                Begrüßung · AT-Deutsch
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faces() {
  return (
    <section
      id={DESK_HOME_FACES_ID}
      className="mx-auto max-w-6xl px-6 py-[clamp(3.5rem,6vw,5rem)]"
    >
      <Kicker>Premium oder Live</Kicker>
      <Display className="max-w-[36em]">Die Stimme entscheidet.</Display>
      <p className="mt-[18px] max-w-[36em] text-[clamp(0.97rem,1.2vw,1.19rem)] leading-relaxed text-muted-foreground">
        Zwei Varianten für Ihre Ordination: Silvia Premium und Silvia Live.
        Hören Sie die Aufnahmen und erfahren Sie, was sie unterscheidet.
      </p>
      <SilviaVarianten />
      <SilviaLiveDemo />
    </section>
  );
}

export function Film() {
  return (
    <section
      id="film"
      className="scroll-mt-20 bg-night py-[clamp(3.5rem,6vw,5rem)] text-night-foreground"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-9 max-w-[36em]">
          <Kicker className="text-[#8FA79A]">Der Film</Kicker>
          <Display className="text-night-foreground">
            So hebt Silvia ab.
          </Display>
          <p className="mt-[18px] text-[clamp(0.97rem,1.2vw,1.15rem)] leading-relaxed text-[#B9C7C0]">
            32 Sekunden mit Ton und erfundenen Beispieldaten. So kann Silvia
            Ihre Rezeption unterstützen. Die Anbindung an Ihre Praxissoftware
            wird vor dem Einsatz geprüft; Nachrichten bleiben Versandentwürfe.
          </p>
        </div>
        <ProductFilm className="rounded-md" />
      </div>
    </section>
  );
}
