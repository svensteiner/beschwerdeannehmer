import { timingSafeEqual } from "node:crypto";

export function hasOperatorKey(provided: string | null, expected = process.env.GARAGEN_OPERATOR_KEY ?? "") {
  if (!provided || expected.length < 16) return false;
  const actualBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
