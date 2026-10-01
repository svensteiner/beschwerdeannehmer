import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { DemoRequestButton } from "@/components/demo-request-dialog";
import { Button } from "@/components/ui/button";
import { getPracticeSession, type SessionView } from "@/lib/practice/auth";
import {
  DESK_HEADER_LOGIN_ID,
  DESK_HEADER_TAFEL_ID,
  deskHeaderTafelLabel,
} from "@/lib/practice/desk-home";
import {
  DESK_HEADER_DEMO_ID,
  headerShowsDemoRequest,
} from "@/lib/practice/tafel-anzeige";
import { loadDeskRegisterCta } from "@/lib/practice/holen-login-fn";
import { cn } from "@/lib/utils";

function Identity({ children }: { children: ReactNode }) {
  return children;
}

export function HeaderAccount({
  className,
  ids,
  registerWhenLoggedOut = false,
  stack = false,
  anzeige,
  wrap: Wrap = Identity,
}: {
  className?: string;
  ids?: { tafel?: string; login?: string; demo?: string };
  registerWhenLoggedOut?: boolean;
  stack?: boolean;
  anzeige?: boolean;
  wrap?: (props: { children: ReactNode }) => ReactNode;
}) {
  const [session, setSession] = useState<SessionView | null | undefined>(
    undefined,
  );
  const [showRegister, setShowRegister] = useState(false);
  const tafelId = ids?.tafel ?? DESK_HEADER_TAFEL_ID;
  const loginId = ids?.login ?? DESK_HEADER_LOGIN_ID;

  useEffect(() => {
    void getPracticeSession().then(setSession);
    void loadDeskRegisterCta().then(setShowRegister);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        stack && "flex-col items-stretch",
        className,
      )}
    >
      {session === undefined ? null : session ? (
        <Wrap>
          <Button
            variant="outline"
            size={stack ? "default" : "sm"}
            className={stack ? undefined : "rounded-[3px]"}
            asChild
          >
            <Link id={tafelId} to="/app">
              {deskHeaderTafelLabel()}
            </Link>
          </Button>
        </Wrap>
      ) : (
        <>
          <Wrap>
            {stack ? (
              <Button variant="outline" asChild>
                <Link id={loginId} to="/login">
                  Anmelden
                </Link>
              </Button>
            ) : (
              <Link
                id={loginId}
                to="/login"
                className="inline-flex min-h-11 items-center px-3 text-[14.5px] font-medium text-foreground no-underline"
              >
                Anmelden
              </Link>
            )}
          </Wrap>
          {registerWhenLoggedOut && showRegister ? (
            <Wrap>
              <Button variant="secondary" className="rounded-[3px]" asChild>
                <Link to="/registrieren">Ordination eröffnen</Link>
              </Button>
            </Wrap>
          ) : null}
        </>
      )}
      {headerShowsDemoRequest(anzeige) ? (
        <Wrap>
          <DemoRequestButton
            id={ids?.demo ?? DESK_HEADER_DEMO_ID}
            className={cn(
              "rounded-[3px] bg-primary px-[18px] text-[14.5px] font-semibold text-primary-foreground hover:bg-[#173729] hover:text-primary-foreground",
              stack ? "w-full min-h-11" : "h-11",
            )}
          >
            Demo anfragen
          </DemoRequestButton>
        </Wrap>
      ) : null}
    </div>
  );
}
