import { Badge } from "@/components/ui/badge";
import type { CallStatus, Channel, Urgency } from "@/lib/alma/types";

export function StatusBadge({ status }: { status: CallStatus }) {
  if (status === "notfall") return <Badge variant="danger">Notfall</Badge>;
  if (status === "erledigt") return <Badge variant="ok">Erledigt</Badge>;
  if (status === "weitergeleitet") return <Badge variant="warn">Weitergeleitet</Badge>;
  return <Badge>Offen</Badge>;
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  const label = channel === "whatsapp" ? "WhatsApp" : channel === "web" ? "Web" : "Telefon";
  return <Badge variant="outline">{label}</Badge>;
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  if (urgency === "notfall") return <Badge variant="danger">Notfall</Badge>;
  if (urgency === "bald") return <Badge variant="warn">Bald</Badge>;
  return <Badge variant="secondary">Routine</Badge>;
}
