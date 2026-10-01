/** Testdatabases only: never accept a product or network PostgreSQL target. */
export function safeLocalPostgresAuditUrl(raw) {
  if (!raw || raw.includes("\n") || raw.includes("\r")) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const database = decodeURIComponent(url.pathname.slice(1));
    const safeHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
    const safeDatabase = /^silvia_audit_[a-z0-9_]+$/i.test(database);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !safeHost ||
      !safeDatabase
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}
