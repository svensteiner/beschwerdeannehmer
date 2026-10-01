// Monatliches Voice-Minutenbudget je Praxis (Live-Leitung).

export type LiveBudget = {
  tenantId: string;
  monthKey: string; // "YYYY-MM" (UTC)
  usedSeconds: number;
  limitSeconds: number;
};

/**
 * Extrahiert "YYYY-MM" aus Date (UTC).
 */
export function monthKeyOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Verbleibende Sekunden im Budget.
 */
export function remainingSeconds(budget: LiveBudget): number {
  return Math.max(0, budget.limitSeconds - budget.usedSeconds);
}

/**
 * Prüft, ob neue Session startet (mindestens minSessionSeconds verfügbar).
 */
export function canStartSession(
  budget: LiveBudget,
  minSessionSeconds: number = 30
): { ok: boolean; reason?: "budget_exhausted" } {
  const remaining = remainingSeconds(budget);
  if (remaining < minSessionSeconds) {
    return { ok: false, reason: "budget_exhausted" };
  }
  return { ok: true };
}

/**
 * Addiert Nutzungszeit (ignoriert NaN/negativ, immutable).
 */
export function recordUsage(
  budget: LiveBudget,
  seconds: number
): LiveBudget {
  // NaN oder negativ ignorieren
  if (!Number.isFinite(seconds) || seconds < 0) {
    return budget;
  }
  return {
    ...budget,
    usedSeconds: Math.min(
      budget.usedSeconds + seconds,
      budget.limitSeconds // Clamp oben
    ),
  };
}

/**
 * Rollover bei Monatswechsel (reset usedSeconds).
 */
export function rolloverIfNewMonth(
  budget: LiveBudget,
  now: Date
): LiveBudget {
  const currentMonth = monthKeyOf(now);
  if (currentMonth !== budget.monthKey) {
    return {
      ...budget,
      monthKey: currentMonth,
      usedSeconds: 0,
    };
  }
  return budget;
}
