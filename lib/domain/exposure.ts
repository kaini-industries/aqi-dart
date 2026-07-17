export const CIGARETTE_EQUIVALENT_PM25_UG_M3 = 22;
export const CIGARETTE_EQUIVALENT_METHODOLOGY_VERSION =
  "berkeley-earth-22-v1";

const HOURS_PER_DAY = 24;
const HOUR_MS = 60 * 60 * 1_000;

export interface Pm25ExposureInterval {
  pm25UgM3: number | null | undefined;
  durationHours?: number;
}

export interface HourlyPm25Reading {
  observedAt: Date | string | number;
  pm25UgM3: number | null | undefined;
}

export interface TrailingExposureSummary {
  cigaretteEquivalents: number | null;
  capturedHours: number;
  expectedHours: number;
  completenessPercent: number;
  distinctHourlyReadings: number;
  longestMissingGapHours: number;
  isComplete: boolean;
  windowStart: string;
  windowEnd: string;
  methodologyVersion: typeof CIGARETTE_EQUIVALENT_METHODOLOGY_VERSION;
}

export interface TrailingExposureOptions {
  /** End of the half-open window. Defaults to one hour after the latest sample. */
  endAt?: Date | string | number;
  expectedHours?: number;
  minimumCompleteReadings?: number;
  maximumMissingGapHours?: number;
}

function validConcentration(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  // Negative instrument readings are preserved in source data but contribute
  // zero to this derived analogy.
  return Math.max(0, value);
}

export function projectCigaretteEquivalentsPerDay(
  pm25UgM3: number | null | undefined,
): number | null {
  const concentration = validConcentration(pm25UgM3);
  return concentration == null
    ? null
    : concentration / CIGARETTE_EQUIVALENT_PM25_UG_M3;
}

/**
 * Integrates measured PM2.5 intervals without filling or extrapolating gaps.
 * Returns null when no valid measured duration is present.
 */
export function accumulateCigaretteEquivalents(
  intervals: readonly Pm25ExposureInterval[],
): number | null {
  let total = 0;
  let capturedHours = 0;

  for (const interval of intervals) {
    const concentration = validConcentration(interval.pm25UgM3);
    const durationHours = interval.durationHours ?? 1;

    if (
      concentration == null ||
      !Number.isFinite(durationHours) ||
      durationHours <= 0
    ) {
      continue;
    }

    total +=
      (concentration * durationHours) /
      (CIGARETTE_EQUIVALENT_PM25_UG_M3 * HOURS_PER_DAY);
    capturedHours += durationHours;
  }

  return capturedHours > 0 ? total : null;
}

function toValidTimestamp(value: Date | string | number): number | null {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function floorToHour(timestamp: number): number {
  return Math.floor(timestamp / HOUR_MS) * HOUR_MS;
}

function longestMissingRun(present: readonly boolean[]): number {
  let longest = 0;
  let current = 0;

  for (const isPresent of present) {
    if (isPresent) {
      current = 0;
    } else {
      current += 1;
      longest = Math.max(longest, current);
    }
  }

  return longest;
}

/**
 * Summarizes distinct hourly measurements in a trailing window. Duplicate
 * timestamps are de-duplicated by hour, with the last supplied value winning.
 */
export function summarizeTrailingExposure(
  readings: readonly HourlyPm25Reading[],
  options: TrailingExposureOptions = {},
): TrailingExposureSummary {
  const expectedHours = options.expectedHours ?? HOURS_PER_DAY;
  const minimumCompleteReadings =
    options.minimumCompleteReadings ?? Math.min(20, expectedHours);
  const maximumMissingGapHours = options.maximumMissingGapHours ?? 3;

  if (!Number.isInteger(expectedHours) || expectedHours <= 0) {
    throw new RangeError("expectedHours must be a positive integer");
  }
  if (
    !Number.isInteger(minimumCompleteReadings) ||
    minimumCompleteReadings < 0 ||
    minimumCompleteReadings > expectedHours
  ) {
    throw new RangeError(
      "minimumCompleteReadings must be between zero and expectedHours",
    );
  }
  if (
    !Number.isInteger(maximumMissingGapHours) ||
    maximumMissingGapHours < 0
  ) {
    throw new RangeError("maximumMissingGapHours must be a non-negative integer");
  }

  const timestampedReadings = readings
    .map((reading) => ({
      ...reading,
      timestamp: toValidTimestamp(reading.observedAt),
    }))
    .filter(
      (reading): reading is typeof reading & { timestamp: number } =>
        reading.timestamp != null,
    );

  const explicitEnd =
    options.endAt == null ? null : toValidTimestamp(options.endAt);
  if (options.endAt != null && explicitEnd == null) {
    throw new RangeError("endAt must be a valid date");
  }

  const latestTimestamp = timestampedReadings.reduce(
    (latest, reading) => Math.max(latest, reading.timestamp),
    Number.NEGATIVE_INFINITY,
  );
  const windowEnd = floorToHour(
    explicitEnd ??
      (Number.isFinite(latestTimestamp) ? latestTimestamp + HOUR_MS : Date.now()),
  );
  const windowStart = windowEnd - expectedHours * HOUR_MS;

  const byHour = new Map<number, number | null>();
  for (const reading of timestampedReadings) {
    const hour = floorToHour(reading.timestamp);
    if (hour < windowStart || hour >= windowEnd) {
      continue;
    }
    byHour.set(hour, validConcentration(reading.pm25UgM3));
  }

  const presence = Array.from({ length: expectedHours }, (_, index) => {
    const hour = windowStart + index * HOUR_MS;
    return byHour.get(hour) != null;
  });
  const intervals = Array.from(byHour.values())
    .filter((value): value is number => value != null)
    .map((pm25UgM3) => ({ pm25UgM3, durationHours: 1 }));
  const distinctHourlyReadings = intervals.length;
  const longestMissingGapHours = longestMissingRun(presence);

  return {
    cigaretteEquivalents: accumulateCigaretteEquivalents(intervals),
    capturedHours: distinctHourlyReadings,
    expectedHours,
    completenessPercent: (distinctHourlyReadings / expectedHours) * 100,
    distinctHourlyReadings,
    longestMissingGapHours,
    isComplete:
      distinctHourlyReadings >= minimumCompleteReadings &&
      longestMissingGapHours <= maximumMissingGapHours,
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(windowEnd).toISOString(),
    methodologyVersion: CIGARETTE_EQUIVALENT_METHODOLOGY_VERSION,
  };
}

export function formatCigaretteEquivalent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return "Not available";
  }
  if (value > 0 && value < 0.1) {
    return "<0.1";
  }
  if (value < 10) {
    return value.toFixed(1);
  }
  return Math.round(value).toString();
}
