import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AlmaMark } from "@/components/alma-mark";
import { SiteHeader } from "@/components/layout/site-header";
import { COMPANY } from "@/lib/alma/data";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import {
  DESK_FOOTER_ANRUFEN_ID,
  DESK_FOOTER_PRAXISTAFEL_ID,
  demoPublicNavTo,
  sprechenPublicNavTo,
} from "@/lib/practice/tafel-anzeige";

export function SiteFooter({
  anzeige,
  anrufen = true,
}: {
  anzeige?: boolean;
  anrufen?: boolean;
}) {
  const productHash = anzeige ? "anrufen" : "produkt";
  const productLabel = anzeige ? "Start" : "Produkt";
  return (
    <footer className="bg-night pb-8 pt-[clamp(2.75rem,5vw,4rem)] text-[#C6D8CD]">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-start justify-between gap-7 border-b border-[#35443E] pb-8">
          <div className="min-w-[200px] max-w-[22em]">
            <AlmaMark mark="dot" onDark className="mb-3" />
            <p className="text-[13.5px] leading-[1.55] text-[#8FA79A]">
              Die Rezeption für österreichische Ordinationen. Gebaut in Wien,
              Josefstadt.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-[26px] gap-y-3 text-sm">
            <Link
              to="/"
              hash={productHash}
              className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
            >
              {productLabel}
            </Link>
            <Link
              to="/preise"
              className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
            >
              Preise
            </Link>
            <Link
              id={DESK_FOOTER_PRAXISTAFEL_ID}
              to={demoPublicNavTo(anzeige)}
              className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
            >
              {anzeige ? "Praxistafel" : "Tageskalender"}
            </Link>
            <Link
              to="/"
              hash="features"
              className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
            >
              Features
            </Link>
            {anzeige ? null : (
              <Link
                to="/"
                hash="ueber-uns"
                className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
              >
                Über uns
              </Link>
            )}
            {anrufen ? (
              anzeige ? (
                <Link
                  id={DESK_FOOTER_ANRUFEN_ID}
                  to={sprechenPublicNavTo(true)}
                  className="font-semibold text-[#8FD3AE] no-underline hover:text-[#F3EFE6]"
                >
                  Anrufen
                </Link>
              ) : (
                <Link
                  id={DESK_FOOTER_ANRUFEN_ID}
                  to="/"
                  hash="anrufen"
                  className="font-semibold text-[#8FD3AE] no-underline hover:text-[#F3EFE6]"
                >
                  Anrufen
                </Link>
              )
            ) : null}
            <Link
              to="/datenschutz"
              className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
            >
              Datenschutz
            </Link>
            <Link
              to="/avv"
              className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
            >
              AVV
            </Link>
            <Link
              to="/impressum"
              className="text-[#C6D8CD] no-underline hover:text-[#F3EFE6]"
            >
              Impressum
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 pt-5 text-[12.5px] text-[#6F8378]">
          <span>
            © 2026 Silvia · ein Produkt von AI_Studioxyz und{" "}
            <a href="https://www.bizzsoft.at" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              bizzsoft.at
            </a>
            , {COMPANY.city}
          </span>
          <span>
            Rezeptionssoftware, keine tierärztliche Beratung · DSGVO + DSG · 20
            % USt
          </span>
        </div>
      </div>
    </footer>
  );
}

export function SiteShell({
  children,
  anzeige,
  anrufen = true,
}: {
  children: ReactNode;
  anzeige?: boolean;
  anrufen?: boolean;
}) {
  const [flag, setFlag] = useState(anzeige);
  useEffect(() => {
    if (anzeige !== undefined) {
      setFlag(anzeige);
      return;
    }
    void loadTafelAnzeigeFlag().then(setFlag);
  }, [anzeige]);
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteHeader anzeige={flag} anrufen={anrufen} />
      <div className="flex-1">{children}</div>
      <SiteFooter anzeige={flag} anrufen={anrufen} />
    </div>
  );
}
