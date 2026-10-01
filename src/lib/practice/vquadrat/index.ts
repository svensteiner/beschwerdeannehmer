export { vquadratAdapter, vquadratStatusView } from "./adapter.ts";
export type { PraxissoftwareStatusView } from "./adapter.ts";
export {
  isVquadratPartnerPort,
  vquadratAdminNeeds,
  vquadratBindableProtocol,
  vquadratPublicSurface,
  VQUADRAT_ADMIN_NEEDS,
  VQUADRAT_PARTNER_PORTS,
  VQUADRAT_PUBLIC_MODULES,
  VQUADRAT_PUBLIC_SOURCE,
  VQUADRAT_STORE,
  VQUADRAT_VENDOR,
} from "./oeffentlich.ts";
export type { VquadratAdminNeed, VquadratPublicSurface } from "./oeffentlich.ts";
export {
  VQUADRAT_TAFEL_AKTE,
  VQUADRAT_TAFEL_KONTAKT,
  VQUADRAT_TAFEL_SLOT,
  VQUADRAT_TAFEL_STATUS,
  vquadratFelderOffen,
} from "./daten.ts";
export type { VquadratTafelFeld } from "./daten.ts";
export {
  flattenPraxissoftwareOffer,
  spiegelRowLine,
} from "./spiegel-row.ts";
export type { PraxissoftwareSpiegelRow } from "./spiegel-row.ts";
export { fetchPraxissoftwareSpiegel, offerTafelToSpiegel, SPIEGEL_LIMIT } from "./spiegel.ts";
