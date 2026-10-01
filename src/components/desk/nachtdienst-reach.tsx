import { Button } from "@/components/ui/button";
import { nachtdienstReachHrefs } from "@/lib/alma/protocol";

/** tel: / sms: / wa.me to the Nachtdienst number from Einstellungen — same click, no popup. */
export function NachtdienstReach({
  phone,
  body,
  size = "sm",
  idPrefix,
}: {
  phone?: string;
  body: string;
  size?: "sm" | "default";
  idPrefix?: string;
}) {
  const { call, sms, wa } = nachtdienstReachHrefs(phone, body);
  if (!call && !sms && !wa) return null;
  return (
    <>
      {call ? (
        <Button size={size} asChild>
          <a id={idPrefix ? `${idPrefix}-tel` : undefined} href={call}>
            Nachtdienst anrufen
          </a>
        </Button>
      ) : null}
      {sms ? (
        <Button size={size} variant="outline" asChild>
          <a id={idPrefix ? `${idPrefix}-sms` : undefined} href={sms}>
            SMS an Nachtdienst
          </a>
        </Button>
      ) : null}
      {wa ? (
        <Button size={size} variant="outline" asChild>
          <a id={idPrefix ? `${idPrefix}-wa` : undefined} href={wa} target="_blank" rel="noreferrer">
            WhatsApp an Nachtdienst
          </a>
        </Button>
      ) : null}
    </>
  );
}
