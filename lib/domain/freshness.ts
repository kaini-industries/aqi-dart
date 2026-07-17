export const FRESH_OBSERVATION_MAX_HOURS = 2;
export const STALE_OBSERVATION_MAX_HOURS = 6;

export type FreshnessState = "fresh" | "stale" | "expired";

export interface FreshnessDetails {
  state: FreshnessState;
  ageMilliseconds: number | null;
  ageMinutes: number | null;
  ageHours: number | null;
}

function timestampOf(value: Date | string | number): number | null {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Invalid timestamps fail closed as expired rather than appearing current. */
export function getFreshness(
  observedAt: Date | string | number,
  now: Date | string | number = new Date(),
): FreshnessDetails {
  const observedTimestamp = timestampOf(observedAt);
  const nowTimestamp = timestampOf(now);

  if (observedTimestamp == null || nowTimestamp == null) {
    return {
      state: "expired",
      ageMilliseconds: null,
      ageMinutes: null,
      ageHours: null,
    };
  }

  // Small source or client clock skew should not make a reading appear older.
  const ageMilliseconds = Math.max(0, nowTimestamp - observedTimestamp);
  const ageHours = ageMilliseconds / (60 * 60 * 1_000);
  const state: FreshnessState =
    ageHours <= FRESH_OBSERVATION_MAX_HOURS
      ? "fresh"
      : ageHours <= STALE_OBSERVATION_MAX_HOURS
        ? "stale"
        : "expired";

  return {
    state,
    ageMilliseconds,
    ageMinutes: ageMilliseconds / (60 * 1_000),
    ageHours,
  };
}

export function classifyFreshness(
  observedAt: Date | string | number,
  now: Date | string | number = new Date(),
): FreshnessState {
  return getFreshness(observedAt, now).state;
}
