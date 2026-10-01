/**
 * Browser-safe database contracts.
 *
 * Runtime access lives in `db.server.ts`. Keep this module type-only so shared
 * client code can describe SQL adapters without pulling PGlite, pg or Node
 * filesystem helpers into the browser bundle.
 */
export type DbSource = "neon" | "pglite";

export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

export type AnzeigeKeptSession = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string | Date;
};
