import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HALTERIN_REACH_OPEN_LABEL,
  halterinReachDomIds,
  halterinReachHrefs,
} from "@/lib/practice/halterin-reach";

export function HalterinReach({
  ownerPhone,
  ownerEmail,
  mailSubject,
  body,
  size = "sm",
  collapsed = false,
  openId,
}: {
  ownerPhone?: string;
  /** Pass (even empty) to offer mailto. Omit on intern protocol — that mail goes to the practice. */
  ownerEmail?: string | null;
  mailSubject?: string;
  body: string;
  size?: "sm" | "default";
  /** Appointment cards: one button until the Kassa opens tel/sms/wa/mailto. */
  collapsed?: boolean;
  openId?: string;
}) {
  const { call, sms, wa, mail } = halterinReachHrefs({ ownerPhone, ownerEmail, mailSubject, body });
  const ids = halterinReachDomIds(openId);
  const [open, setOpen] = useState(!collapsed);
  if (!call && !sms && !wa && !mail) return null;
  if (collapsed && !open) {
    return (
      <Button id={openId} type="button" size={size} variant="outline" onClick={() => setOpen(true)}>
        {HALTERIN_REACH_OPEN_LABEL}
      </Button>
    );
  }
  return (
    <>
      {call ? (
        <Button size={size} variant={size === "default" ? "default" : "outline"} asChild>
          <a id={ids.tel} href={call}>
            Halterin anrufen
          </a>
        </Button>
      ) : null}
      {sms ? (
        <Button size={size} variant="outline" asChild>
          <a id={ids.sms} href={sms}>
            SMS an Halterin
          </a>
        </Button>
      ) : null}
      {wa ? (
        <Button size={size} variant="outline" asChild>
          <a id={ids.wa} href={wa} target="_blank" rel="noreferrer">
            WhatsApp an Halterin
          </a>
        </Button>
      ) : null}
      {mail ? (
        <Button size={size} variant="outline" asChild>
          <a id={ids.mail} href={mail}>
            E-Mail an Halterin
          </a>
        </Button>
      ) : null}
      {collapsed ? (
        <Button id={ids.close} type="button" size={size} variant="ghost" onClick={() => setOpen(false)}>
          Schließen
        </Button>
      ) : null}
    </>
  );
}
