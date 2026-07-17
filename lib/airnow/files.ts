import type { AirNowFileDescriptor } from "./types";

export const AIRNOW_FILES_BASE_URL = "https://files.airnowtech.org";

const HOUR_MS = 60 * 60 * 1_000;

function assertValidDate(date: Date): void {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("AirNow file time must be a valid date");
  }
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

export function floorToUtcHour(value: Date | string | number): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  assertValidDate(date);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

export function getAirNowHourlyFile(
  hour: Date | string | number,
  baseUrl = AIRNOW_FILES_BASE_URL,
): AirNowFileDescriptor {
  const date = floorToUtcHour(hour);
  const year = date.getUTCFullYear().toString();
  const dateKey = `${year}${twoDigits(date.getUTCMonth() + 1)}${twoDigits(
    date.getUTCDate(),
  )}`;
  const hourKey = `${dateKey}${twoDigits(date.getUTCHours())}`;
  const filename = `HourlyAQObs_${hourKey}.dat`;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    observedHour: date.toISOString(),
    dateKey,
    hourKey,
    filename,
    url: `${normalizedBaseUrl}/airnow/${year}/${dateKey}/${filename}`,
  };
}

export function getLatestAirNowFileCandidates(
  now: Date | string | number = new Date(),
  count = 3,
  baseUrl = AIRNOW_FILES_BASE_URL,
): AirNowFileDescriptor[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError("AirNow candidate count must be a positive integer");
  }

  const currentHour = floorToUtcHour(now).getTime();
  return Array.from({ length: count }, (_, offset) =>
    getAirNowHourlyFile(currentHour - offset * HOUR_MS, baseUrl),
  );
}

/**
 * Selects a bounded rotating shard from the remainder of AirNow's 72-hour
 * correction window. Across 23 UTC hours, offsets 3 through 71 are covered.
 */
export function getAirNowReconciliationCandidates(
  now: Date | string | number = new Date(),
  options: {
    currentFileCount?: number;
    correctionWindowHours?: number;
    batchSize?: number;
    baseUrl?: string;
  } = {},
): AirNowFileDescriptor[] {
  const currentFileCount = options.currentFileCount ?? 3;
  const correctionWindowHours = options.correctionWindowHours ?? 72;
  const batchSize = options.batchSize ?? 3;

  if (
    !Number.isInteger(currentFileCount) ||
    currentFileCount < 0 ||
    !Number.isInteger(correctionWindowHours) ||
    correctionWindowHours <= currentFileCount ||
    !Number.isInteger(batchSize) ||
    batchSize <= 0
  ) {
    throw new RangeError("Invalid AirNow reconciliation window options");
  }

  const currentHour = floorToUtcHour(now);
  const olderHours = correctionWindowHours - currentFileCount;
  const shardCount = Math.ceil(olderHours / batchSize);
  const shardIndex = currentHour.getUTCHours() % shardCount;
  const firstOffset = currentFileCount + shardIndex * batchSize;

  return Array.from({ length: batchSize }, (_, index) => firstOffset + index)
    .filter((offset) => offset < correctionWindowHours)
    .map((offset) =>
      getAirNowHourlyFile(
        currentHour.getTime() - offset * HOUR_MS,
        options.baseUrl,
      ),
    );
}

export function getAirNowIngestionCandidates(
  now: Date | string | number = new Date(),
  baseUrl = AIRNOW_FILES_BASE_URL,
): AirNowFileDescriptor[] {
  const candidates = [
    ...getLatestAirNowFileCandidates(now, 3, baseUrl),
    ...getAirNowReconciliationCandidates(now, { baseUrl }),
  ];

  return Array.from(
    new Map(candidates.map((candidate) => [candidate.filename, candidate])).values(),
  );
}
