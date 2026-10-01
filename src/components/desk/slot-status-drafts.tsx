import { useState } from "react";
import { DeskDraftButton } from "@/components/desk/desk-draft-button";
import { Button } from "@/components/ui/button";
import {
  SLOT_MORE_CHANNELS_LABEL,
  type DraftChannel,
  slotStatusDraftDomIds,
  slotStatusDraftPlan,
} from "@/lib/practice/slot-status-drafts";
import { anzeigeControl, slotWriteVisible } from "@/lib/practice/tafel-anzeige";

export function SlotStatusDrafts({
  openId,
  status,
  confirmWa,
  confirmSms,
  confirmMail,
  cancelWa,
  cancelSms,
  cancelMail,
  onConfirm,
  onCancel,
  anzeige,
}: {
  openId: string;
  status?: string;
  confirmWa?: string;
  confirmSms?: string;
  confirmMail?: string;
  cancelWa?: string;
  cancelSms?: string;
  cancelMail?: string;
  onConfirm: (channel: DraftChannel) => void;
  onCancel: (channel: DraftChannel) => void;
  anzeige?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ids = slotStatusDraftDomIds(openId);
  const { primary, folded } = slotStatusDraftPlan({
    status,
    confirmWa,
    confirmSms,
    confirmMail,
    cancelWa,
    cancelSms,
    cancelMail,
  });
  if (!slotWriteVisible(anzeige)) return null;
  if (!primary.length && !folded.length) return null;

  function row(btn: (typeof primary)[number]) {
    const writeOff = anzeigeControl(anzeige);
    return (
      <DeskDraftButton
        key={btn.kind}
        id={ids[btn.kind]}
        href={btn.href}
        variant={btn.kind === "confirm-wa" ? "default" : "outline"}
        newTab={btn.newTab}
        disabled={writeOff.disabled}
        title={writeOff.title}
        onAct={() => {
          if (writeOff.disabled) return;
          if (btn.action === "bestätigt") onConfirm(btn.channel);
          else onCancel(btn.channel);
        }}
      >
        {btn.label}
      </DeskDraftButton>
    );
  }

  return (
    <>
      {primary.map(row)}
      {folded.length && !open ? (
        <Button id={openId} type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          {SLOT_MORE_CHANNELS_LABEL}
        </Button>
      ) : null}
      {open ? folded.map(row) : null}
      {open ? (
        <Button id={ids.close} type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Schließen
        </Button>
      ) : null}
    </>
  );
}
