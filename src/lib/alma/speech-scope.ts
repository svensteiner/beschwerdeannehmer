/** Public demos must not read or change an authenticated practice's vocabulary. */
export function speechPracticeId(
  demo: boolean,
  sessionPracticeId?: string,
): string | undefined {
  return demo ? undefined : sessionPracticeId;
}
