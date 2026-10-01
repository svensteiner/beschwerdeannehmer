/** Server-Fn-Eingaben sind nicht vertrauenswürdig: nur ein echtes Boolean `true` aktiviert einen Schalter. */
export function isStrictTrue(value: unknown): value is true {
  return value === true;
}
