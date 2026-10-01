export const MINIMUM_PRODUCTION_NODE_VERSION = "22.12.0";

export function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? "").trim());
  if (!match) return null;
  return match.slice(1).map(Number);
}

export function isSupportedProductionNode(version) {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  const [major, minor, patch] = parsed;
  if (major !== 22) return major > 22;
  if (minor !== 12) return minor > 12;
  return patch >= 0;
}

export function unsupportedNodeMessage(version) {
  const found = String(version ?? "unbekannt").trim() || "unbekannt";
  return [
    `Silvia benötigt für den produktiven Start Node >=${MINIMUM_PRODUCTION_NODE_VERSION}; gefunden: ${found}.`,
    `Behoben: Node auf ${MINIMUM_PRODUCTION_NODE_VERSION} oder neuer aktualisieren, dann dieses Fenster schließen und neu öffnen.`,
    "Auf diesem Rechner: winget upgrade --id OpenJS.NodeJS.LTS",
    "Danach prüfen: node --version",
  ].join(" ");
}

export function assertSupportedProductionNode(version = process.versions.node) {
  if (!isSupportedProductionNode(version)) {
    throw new Error(unsupportedNodeMessage(version));
  }
}
