import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPracticeSession } from "@/lib/practice/auth";
import {
  DESK_DEMO_BOARD_ID,
  DESK_HOME_DEMO_ID,
  DESK_HOME_SILVIA_ID,
  DESK_HOME_TAFEL_ID,
  deskDemoBoardCopy,
  deskHeaderTafelLabel,
  deskHomeDemoCopy,
} from "@/lib/practice/desk-home";

export function DeskLoggedInDemoBanner({ variant }: { variant: "home" | "board" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    void getPracticeSession().then((session) => setShow(Boolean(session)));
  }, []);

  if (!show) return null;

  const home = variant === "home";
  return (
    <div
      id={home ? DESK_HOME_DEMO_ID : DESK_DEMO_BOARD_ID}
      className="border-b border-border bg-secondary/60 px-4 py-3 text-center text-sm text-muted-foreground sm:px-6"
    >
      {home ? deskHomeDemoCopy() : deskDemoBoardCopy()}{" "}
      <Link
        id={DESK_HOME_TAFEL_ID}
        to="/app"
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {deskHeaderTafelLabel()}
      </Link>
      {home ? (
        <>
          {" · "}
          <Link
            id={DESK_HOME_SILVIA_ID}
            to="/sprechen"
            search={{ mode: undefined }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Silvia anrufen
          </Link>
        </>
      ) : null}
    </div>
  );
}
