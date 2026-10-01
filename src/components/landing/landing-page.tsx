import { DeskLoggedInDemoBanner } from "@/components/desk/desk-logged-in-demo-banner";
import {
  DESK_HOME_FILM_ID,
  homePublicShowsDemo,
} from "@/lib/practice/tafel-anzeige";
import { Hero, Cities } from "@/components/landing/sections/hero";
import {
  CallScene,
  Faces,
  Film,
} from "@/components/landing/sections/call-scene";
import {
  LogoStrip,
  Problem,
  Austria,
} from "@/components/landing/sections/stats-problem";
import { How, Killers, Board } from "@/components/landing/sections/how-killers";
import {
  Difference,
  FeatureGrid,
  Night,
} from "@/components/landing/sections/difference-features";
import { Social, About } from "@/components/landing/sections/social-about";
import { Faq, Daten, Close } from "@/components/landing/sections/faq-close";

export function LandingPage({ anzeige = false }: { anzeige?: boolean }) {
  const demo = homePublicShowsDemo(anzeige);
  return (
    <main>
      {demo ? <DeskLoggedInDemoBanner variant="home" /> : null}
      <Hero anzeige={anzeige} />
      <Cities />
      {demo ? <CallScene /> : null}
      {demo ? <Faces /> : null}
      {demo ? (
        <div id={DESK_HOME_FILM_ID}>
          <Film />
        </div>
      ) : null}
      <LogoStrip anzeige={anzeige} />
      <Problem anzeige={anzeige} />
      {demo ? <Austria /> : null}
      <How anzeige={anzeige} />
      {demo ? <Killers anzeige={anzeige} /> : null}
      {demo ? <Board /> : null}
      <Difference anzeige={anzeige} />
      <FeatureGrid anzeige={anzeige} />
      {demo ? <Night /> : null}
      {demo ? <Social /> : null}
      {demo ? <About /> : null}
      {demo ? <Faq /> : null}
      {demo ? <Daten /> : null}
      {demo ? <Close /> : null}
    </main>
  );
}
