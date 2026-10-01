import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { akteDeskLabel, akteSearchParams, type HolderAkteRow } from "@/lib/practice/patient-query";

/** Opens the Kartei card so the Kassa can persist Handy / E-Mail for tel, sms, wa.me and mailto. */
export function AkteHandyLink({
  pet,
  patients,
  size = "sm",
  owner,
  ownerPhone,
  ownerEmail,
  anzeige = false,
}: {
  pet: string;
  patients?: HolderAkteRow[];
  size?: "sm" | "default";
  owner?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  anzeige?: boolean;
}) {
  const search = akteSearchParams(pet, patients, {
    owner,
    phone: ownerPhone,
    email: ownerEmail,
  });
  const label = akteDeskLabel(pet, ownerPhone, ownerEmail, search.p, anzeige);
  if (!label) return null;
  const hasSearch = Boolean(search.p || search.q || search.owner || search.phone || search.email);
  return (
    <Button size={size} variant="outline" asChild>
      <Link to="/app/akte" search={hasSearch ? search : {}}>
        {label}
      </Link>
    </Button>
  );
}
