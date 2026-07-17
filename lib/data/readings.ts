import { getCachedLiveReadings } from "@/lib/data/live-readings";
import {
  CIGARETTE_EQUIVALENT_METHODOLOGY_VERSION,
  summarizeTrailingExposure,
} from "@/lib/domain/exposure";
import type { CurrentAirQualityReading } from "@/lib/domain/readings";
import { hasDatabase } from "@/lib/db/client";
import {
  queryCurrentReadings,
  queryStationHistory,
  type GeographicBounds,
  type StationHistoryResult,
} from "@/lib/db/readings";

export const DEFAULT_READINGS_BOUNDS: GeographicBounds = {
  west: -168,
  south: 6,
  east: -52,
  north: 72,
};
export const DEFAULT_READINGS_LIMIT = 2_500;
export const MAX_READINGS_LIMIT = 5_000;
export const DEFAULT_FRESH_WITHIN_HOURS = 6;
export const MAX_FRESH_WITHIN_HOURS = 24;

export class ReadingsQueryError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ReadingsQueryError";
    this.field = field;
  }
}

export interface ParsedReadingsQuery {
  bounds: GeographicBounds;
  freshWithinHours: number;
  limit: number;
}

export interface ReadingsDataResult {
  readings: CurrentAirQualityReading[];
  truncated: boolean;
  dataMode: "database" | "live" | "demo";
  sourceFile: string | null;
  fallbackReason: string | null;
}

export interface PortableStationHistory extends StationHistoryResult {
  dataMode: "database" | "live" | "demo";
}

function finiteNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ReadingsQueryError(field, `${field} must contain finite numbers`);
  }
  return parsed;
}

export function parseBounds(value: string | null): GeographicBounds {
  if (!value) {
    return { ...DEFAULT_READINGS_BOUNDS };
  }

  const parts = value.split(",");
  if (parts.length !== 4) {
    throw new ReadingsQueryError(
      "bbox",
      "bbox must be west,south,east,north",
    );
  }
  const [west, south, east, north] = parts.map((part) =>
    finiteNumber(part.trim(), "bbox"),
  );

  if (west < -180 || west > 180 || east < -180 || east > 180) {
    throw new ReadingsQueryError(
      "bbox",
      "bbox longitudes must be between -180 and 180",
    );
  }
  if (south < -90 || south > 90 || north < -90 || north > 90) {
    throw new ReadingsQueryError(
      "bbox",
      "bbox latitudes must be between -90 and 90",
    );
  }
  if (south >= north) {
    throw new ReadingsQueryError(
      "bbox",
      "bbox south must be less than north",
    );
  }

  const longitudeSpan =
    west <= east ? east - west : 180 - west + (east + 180);
  const latitudeSpan = north - south;
  if (longitudeSpan <= 0 || longitudeSpan > 180 || latitudeSpan > 90) {
    throw new ReadingsQueryError(
      "bbox",
      "bbox is too large; request at most 180° longitude by 90° latitude",
    );
  }

  return { west, south, east, north };
}

function parsePositiveNumber(
  value: string | null,
  field: string,
  fallback: number,
): number {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  const parsed = finiteNumber(value, field);
  if (parsed <= 0) {
    throw new ReadingsQueryError(field, `${field} must be greater than zero`);
  }
  return parsed;
}

export function parseReadingsQuery(
  searchParams: URLSearchParams,
): ParsedReadingsQuery {
  const freshWithin = parsePositiveNumber(
    searchParams.get("fresh_within_hours"),
    "fresh_within_hours",
    DEFAULT_FRESH_WITHIN_HOURS,
  );
  const requestedLimit = parsePositiveNumber(
    searchParams.get("limit"),
    "limit",
    DEFAULT_READINGS_LIMIT,
  );
  if (!Number.isInteger(requestedLimit)) {
    throw new ReadingsQueryError("limit", "limit must be a positive whole number");
  }

  return {
    bounds: parseBounds(searchParams.get("bbox")),
    freshWithinHours: Math.min(freshWithin, MAX_FRESH_WITHIN_HOURS),
    limit: Math.min(requestedLimit, MAX_READINGS_LIMIT),
  };
}

export function isInsideBounds(
  reading: Pick<CurrentAirQualityReading, "latitude" | "longitude">,
  bounds: GeographicBounds,
): boolean {
  if (reading.latitude < bounds.south || reading.latitude > bounds.north) {
    return false;
  }

  return bounds.west <= bounds.east
    ? reading.longitude >= bounds.west && reading.longitude <= bounds.east
    : reading.longitude >= bounds.west || reading.longitude <= bounds.east;
}

export async function getCurrentReadings(
  query: ParsedReadingsQuery,
  now: Date = new Date(),
): Promise<ReadingsDataResult> {
  const observedAfter = new Date(
    now.getTime() - query.freshWithinHours * 60 * 60 * 1_000,
  );

  if (hasDatabase()) {
    const databaseResult = await queryCurrentReadings({
      bounds: query.bounds,
      observedAfter,
      limit: query.limit,
      now,
    });

    return {
      ...databaseResult,
      dataMode: "database",
      sourceFile: null,
      fallbackReason: null,
    };
  }

  const result = await getCachedLiveReadings(now);
  const filtered = result.readings.filter(
    (reading) =>
      new Date(reading.observedAt).getTime() >= observedAfter.getTime() &&
      isInsideBounds(reading, query.bounds),
  );
  const truncated = filtered.length > query.limit;
  const readings = filtered.slice(0, query.limit);
  // The upstream result decides the mode even when viewport filtering leaves
  // no features. A successful live fetch outside the bbox is still live mode;
  // only the explicitly labeled snapshot fallback is demo mode.
  const dataMode = result.mode === "live" ? "live" : "demo";

  return {
    readings,
    truncated,
    dataMode,
    sourceFile: result.sourceFile?.filename ?? null,
    fallbackReason: result.mode === "snapshot" ? result.fallbackReason : null,
  };
}

export async function getStationHistory(
  stationId: string,
  hours: number,
  now: Date = new Date(),
): Promise<PortableStationHistory | null> {
  if (hasDatabase()) {
    const result = await queryStationHistory(stationId, hours, now);
    return result ? { ...result, dataMode: "database" } : null;
  }

  const live = await getCachedLiveReadings(now);
  const reading = live.readings.find(
    (candidate) => candidate.stationId === stationId,
  );
  if (!reading) {
    return null;
  }

  const observations = [
    {
      observedAt: reading.observedAt,
      pm25UgM3: reading.pm25UgM3,
      pm25Aqi: reading.pm25Aqi,
      aqiCategory: reading.aqiCategory,
      projectedCigaretteEquivalentsPerDay:
        reading.projectedCigaretteEquivalentsPerDay,
      sourceAgency: reading.sourceAgency,
      isPreliminary: reading.isPreliminary,
    },
  ];
  const hourMs = 60 * 60 * 1_000;
  const historyWindowEnd = new Date(
    Math.floor(now.getTime() / hourMs) * hourMs + hourMs,
  );

  return {
    dataMode: reading.dataMode === "live" ? "live" : "demo",
    station: {
      stationId: reading.stationId,
      stationName: reading.stationName,
      latitude: reading.latitude,
      longitude: reading.longitude,
      countryCode: reading.countryCode,
      stateCode: reading.stateCode,
      reportingAreas: [...reading.reportingAreas],
      sourceAgency: reading.sourceAgency,
    },
    observations,
    summary: summarizeTrailingExposure(observations, {
      endAt: historyWindowEnd,
      expectedHours: hours,
      minimumCompleteReadings: Math.min(20, hours),
      maximumMissingGapHours: 3,
    }),
  };
}

export const READINGS_METHODOLOGY_VERSION =
  CIGARETTE_EQUIVALENT_METHODOLOGY_VERSION;
