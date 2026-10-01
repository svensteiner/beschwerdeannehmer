import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { AlmaMark } from "@/components/alma-mark";
import { HeaderAccount } from "@/components/layout/header-account";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DESK_HEADER_LOGIN_MOBILE_ID,
  DESK_HEADER_TAFEL_MOBILE_ID,
} from "@/lib/practice/desk-home";
import {
  DESK_HEADER_ANRUFEN_ID,
  DESK_HEADER_ANRUFEN_MOBILE_ID,
  DESK_HEADER_DEMO_MOBILE_ID,
  DESK_HEADER_PRAXISTAFEL_ID,
  DESK_HEADER_PRAXISTAFEL_MOBILE_ID,
  demoPublicNavTo,
  sprechenPublicNavTo,
} from "@/lib/practice/tafel-anzeige";

const navClass =
  "whitespace-nowrap text-[13.5px] font-medium leading-[1.95] text-foreground no-underline";

export function SiteHeader({
  anzeige,
  anrufen = true,
}: {
  anzeige?: boolean;
  anrufen?: boolean;
}) {
  const tafel = demoPublicNavTo(anzeige);
  const tafelLabel = anzeige ? "Praxistafel" : "Tageskalender";
  const productHash = anzeige ? "anrufen" : "produkt";
  const productLabel = anzeige ? "Start" : "Produkt";
  return (
    <header className="sticky top-0 z-50 min-h-16 border-b border-border bg-background/93 backdrop-blur-[10px]">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-[22px] gap-y-1 px-6 py-2">
        <AlmaMark mark="dot" className="order-1 shrink-0" />
        <nav className="order-2 hidden min-w-0 flex-[20_1_200px] flex-wrap items-center gap-x-3.5 gap-y-0.5 md:flex">
          <Link
            to="/"
            hash={productHash}
            className={navClass}
            activeOptions={{ exact: true }}
          >
            {productLabel}
          </Link>
          <Link to="/preise" className={navClass}>
            Preise
          </Link>
          <Link id={DESK_HEADER_PRAXISTAFEL_ID} to={tafel} className={navClass}>
            {tafelLabel}
          </Link>
          <Link to="/" hash="features" className={navClass}>
            Features
          </Link>
          {anzeige ? null : (
            <Link to="/" hash="ueber-uns" className={navClass}>
              Über uns
            </Link>
          )}
          {anrufen ? (
            anzeige ? (
              <Link
                id={DESK_HEADER_ANRUFEN_ID}
                to={sprechenPublicNavTo(true)}
                className={`${navClass} font-semibold text-primary`}
              >
                Anrufen
              </Link>
            ) : (
              <Link
                id={DESK_HEADER_ANRUFEN_ID}
                to="/"
                hash="anrufen"
                className={`${navClass} font-semibold text-primary`}
              >
                Anrufen
              </Link>
            )
          ) : null}
        </nav>
        <div className="order-3 hidden flex-1 items-center justify-between gap-2 md:flex">
          <HeaderAccount anzeige={anzeige} />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="order-4 ms-auto md:hidden"
              aria-label="Menü"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <AlmaMark mark="dot" className="mb-8" />
            <nav className="flex flex-col gap-1">
              <SheetClose asChild>
                <Link
                  to="/"
                  hash={productHash}
                  className="flex min-h-11 items-center px-2 text-base font-medium"
                >
                  {productLabel}
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link
                  to="/preise"
                  className="flex min-h-11 items-center px-2 text-base font-medium"
                >
                  Preise
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link
                  id={DESK_HEADER_PRAXISTAFEL_MOBILE_ID}
                  to={tafel}
                  className="flex min-h-11 items-center px-2 text-base font-medium"
                >
                  {tafelLabel}
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link
                  to="/"
                  hash="features"
                  className="flex min-h-11 items-center px-2 text-base font-medium"
                >
                  Features
                </Link>
              </SheetClose>
              {anzeige ? null : (
                <SheetClose asChild>
                  <Link
                    to="/"
                    hash="ueber-uns"
                    className="flex min-h-11 items-center px-2 text-base font-medium"
                  >
                    Über uns
                  </Link>
                </SheetClose>
              )}
              {anrufen ? (
                <SheetClose asChild>
                  {anzeige ? (
                    <Link
                      id={DESK_HEADER_ANRUFEN_MOBILE_ID}
                      to={sprechenPublicNavTo(true)}
                      className="flex min-h-11 items-center px-2 text-base font-semibold text-primary"
                    >
                      Anrufen
                    </Link>
                  ) : (
                    <Link
                      id={DESK_HEADER_ANRUFEN_MOBILE_ID}
                      to="/"
                      hash="anrufen"
                      className="flex min-h-11 items-center px-2 text-base font-semibold text-primary"
                    >
                      Anrufen
                    </Link>
                  )}
                </SheetClose>
              ) : null}
            </nav>
            <HeaderAccount
              className="mt-6"
              stack
              anzeige={anzeige}
              registerWhenLoggedOut
              ids={{
                tafel: DESK_HEADER_TAFEL_MOBILE_ID,
                login: DESK_HEADER_LOGIN_MOBILE_ID,
                demo: DESK_HEADER_DEMO_MOBILE_ID,
              }}
              wrap={({ children }: { children: ReactNode }) => (
                <SheetClose asChild>{children}</SheetClose>
              )}
            />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
