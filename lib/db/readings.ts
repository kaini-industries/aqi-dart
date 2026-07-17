import {
  getAqiCategory,
  type AqiCategoryId,
} from "@/lib/domain/aqi";
import {
  projectCigaretteEquivalentsPerDay,
  summarizeTrailingExposure,
  type TrailingExposureSummary,
} from "@/lib/domain/exposure";
import { classifyFreshness } from "@/lib/domain/freshness";
import type { CurrentAirQualityReading } from "@/lib/domain/readings";

import { getDatabase } from "./client";

export interface GeographicBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CurrentReadingsQuery {
  bounds: GeographicBounds;
  observedAfter: Date;
  limit: number;
  now?: Date;
}

export interface CurrentReadingsQueryResult {
  readings: CurrentAirQualityReading[];
  truncated: boolean;
}

interface CurrentReadingRow {
  source_station_id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  country_code: string | null;
  state_code: string | null;
  reporting_area_name: string | null;
  station_source_agency: string | null;
  observed_at: Date | string;
  observation_source_agency: string | null;
  pm25_aqi: number | string | null;
  pm25_ug_m3: number | string | null;
  is_preliminary: boolean;
}

interface StationRow {
  source_station_id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  country_code: string | null;
  state_code: string | null;
  reporting_area_name: string | null;
  source_agency: string | null;
}

interface HistoryRow {
  observed_at: Date | string;
  pm25_ug_m3: number | string | null;
  pm25_aqi: number | string | null;
  source_agency: string | null;
  is_preliminary: boolean;
}

export interface StationHistoryObservation {
  observedAt: string;
  pm25UgM3: number | null;
  pm25Aqi: number | null;
  aqiCategory: AqiCategoryId | null;
  projectedCigaretteEquivalentsPerDay: number | null;
  sourceAgency: string | null;
  isPreliminary: boolean;
}

export interface StationHistoryResult {
  station: {
    stationId: string;
    stationName: string;
    latitude: number;
    longitude: number;
    countryCode: string | null;
    stateCode: string | null;
    reportingAreas: string[];
    sourceAgency: string | null;
  };
  observations: StationHistoryObservation[];
  summary: TrailingExposureSummary;
}

function numberOrNull(value: number | string | null): number | null {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Database returned an invalid observation timestamp");
  }
  return date.toISOString();
}

function reportingAreas(value: string | null): string[] {
  return value
    ? value
        .split("|")
        .map((area) => area.trim())
        .filter(Boolean)
    : [];
}

export async function queryCurrentReadings(
  query: CurrentReadingsQuery,
): Promise<CurrentReadingsQueryResult> {
  const sql = getDatabase();
  const { bounds } = query;
  const crossesAntimeridian = bounds.west > bounds.east;
  const requestedRows = query.limit + 1;
  const now = query.now ?? new Date();

  const result = await sql`
    SELECT
      s.source_station_id,
      s.name,
      s.latitude,
      s.longitude,
      s.country_code,
      s.state_code,
      s.reporting_area_name,
      s.source_agency AS station_source_agency,
      latest.observed_at,
      latest.source_agency AS observation_source_agency,
      latest.pm25_aqi,
      latest.pm25_ug_m3,
      latest.is_preliminary
    FROM latest_station_observations AS latest
    JOIN stations AS s ON s.id = latest.station_id
    WHERE s.latitude BETWEEN ${bounds.south} AND ${bounds.north}
      AND (
        (${!crossesAntimeridian} AND s.longitude BETWEEN ${bounds.west} AND ${bounds.east})
        OR
        (${crossesAntimeridian} AND (s.longitude >= ${bounds.west} OR s.longitude <= ${bounds.east}))
      )
      AND latest.observed_at >= ${query.observedAfter.toISOString()}
      AND (latest.pm25_ug_m3 IS NOT NULL OR latest.pm25_aqi IS NOT NULL)
    ORDER BY latest.observed_at DESC, s.source_station_id
    LIMIT ${requestedRows}
  `;
  const rows = result as unknown as CurrentReadingRow[];
  const truncated = rows.length > query.limit;

  return {
    truncated,
    readings: rows.slice(0, query.limit).map((row) => {
      const observedAt = toIsoString(row.observed_at);
      const pm25Aqi = numberOrNull(row.pm25_aqi);
      const pm25UgM3 = numberOrNull(row.pm25_ug_m3);

      return {
        stationId: row.source_station_id,
        stationName: row.name,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        countryCode: row.country_code,
        stateCode: row.state_code,
        reportingAreas: reportingAreas(row.reporting_area_name),
        observedAt,
        sourceAgency:
          row.observation_source_agency ?? row.station_source_agency,
        pm25Aqi,
        pm25UgM3,
        aqiCategory: getAqiCategory(pm25Aqi)?.id ?? null,
        projectedCigaretteEquivalentsPerDay:
          projectCigaretteEquivalentsPerDay(pm25UgM3),
        freshness: classifyFreshness(observedAt, now),
        isPreliminary: row.is_preliminary,
        dataMode: "database" as const,
      };
    }),
  };
}

export async function queryStationHistory(
  stationId: string,
  hours: number,
  now: Date = new Date(),
): Promise<StationHistoryResult | null> {
  const sql = getDatabase();
  const hourMs = 60 * 60 * 1_000;
  // Include the current UTC hour in the trailing window. The exposure helper
  // uses a half-open interval, so its end must be the next hour boundary.
  const windowEnd = new Date(
    Math.floor(now.getTime() / hourMs) * hourMs + hourMs,
  );
  const cutoff = new Date(windowEnd.getTime() - hours * hourMs);

  const stationResult = await sql`
    SELECT
      source_station_id,
      name,
      latitude,
      longitude,
      country_code,
      state_code,
      reporting_area_name,
      source_agency
    FROM stations
    WHERE source = 'airnow'
      AND (source_station_id = ${stationId} OR id::text = ${stationId})
    LIMIT 1
  `;
  const station = (stationResult as unknown as StationRow[])[0];
  if (!station) {
    return null;
  }

  const historyResult = await sql`
    SELECT
      o.observed_at,
      o.pm25_ug_m3,
      o.pm25_aqi,
      COALESCE(o.source_agency, s.source_agency) AS source_agency,
      o.is_preliminary
    FROM observations AS o
    JOIN stations AS s ON s.id = o.station_id
    WHERE s.source = 'airnow'
      AND s.source_station_id = ${station.source_station_id}
      AND o.observed_at >= ${cutoff.toISOString()}
      AND o.observed_at < ${windowEnd.toISOString()}
    ORDER BY o.observed_at ASC
  `;
  const observations = (historyResult as unknown as HistoryRow[]).map(
    (row): StationHistoryObservation => {
      const observedAt = toIsoString(row.observed_at);
      const pm25UgM3 = numberOrNull(row.pm25_ug_m3);
      const pm25Aqi = numberOrNull(row.pm25_aqi);

      return {
        observedAt,
        pm25UgM3,
        pm25Aqi,
        aqiCategory: getAqiCategory(pm25Aqi)?.id ?? null,
        projectedCigaretteEquivalentsPerDay:
          projectCigaretteEquivalentsPerDay(pm25UgM3),
        sourceAgency: row.source_agency,
        isPreliminary: row.is_preliminary,
      };
    },
  );

  return {
    station: {
      stationId: station.source_station_id,
      stationName: station.name,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
      countryCode: station.country_code,
      stateCode: station.state_code,
      reportingAreas: reportingAreas(station.reporting_area_name),
      sourceAgency: station.source_agency,
    },
    observations,
    summary: summarizeTrailingExposure(observations, {
      endAt: windowEnd,
      expectedHours: hours,
      minimumCompleteReadings: Math.min(20, hours),
      maximumMissingGapHours: 3,
    }),
  };
}
