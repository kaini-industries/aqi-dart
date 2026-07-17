import { createDemoReadings } from "../../data/demo-readings";
import { getAqiCategory } from "../domain/aqi";
import { projectCigaretteEquivalentsPerDay } from "../domain/exposure";
import { classifyFreshness } from "../domain/freshness";
import type { CurrentAirQualityReading } from "../domain/readings";
import { AirNowHttpError, fetchAirNowHourlyFile, type FetchLike } from "./fetch";
import {
  AIRNOW_FILES_BASE_URL,
  getLatestAirNowFileCandidates,
} from "./files";
import { parseAirNowHourlyData } from "./parser";
import type {
  AirNowFileDescriptor,
  AirNowHourlyRecord,
  AirNowParseIssue,
} from "./types";

export type AirNowAttemptStatus =
  | "success"
  | "not-found"
  | "http-error"
  | "network-error"
  | "empty";

export interface AirNowLoadAttempt {
  descriptor: AirNowFileDescriptor;
  status: AirNowAttemptStatus;
  message?: string;
}

export interface LatestAirNowReadingsResult {
  mode: "live" | "snapshot";
  readings: CurrentAirQualityReading[];
  sourceFile: AirNowFileDescriptor | null;
  attempts: AirNowLoadAttempt[];
  parseIssues: AirNowParseIssue[];
  fallbackReason: string | null;
}

export interface LoadLatestAirNowOptions {
  now?: Date;
  lookbackFileCount?: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  fallbackReadings?:
    | readonly CurrentAirQualityReading[]
    | ((now: Date) => readonly CurrentAirQualityReading[]);
}

function pm25CompletenessScore(record: AirNowHourlyRecord): number {
  return Number(record.pm25Aqi != null) + Number(record.pm25UgM3 != null);
}

export function selectCurrentPm25Records(
  records: readonly AirNowHourlyRecord[],
): AirNowHourlyRecord[] {
  const byStation = new Map<string, AirNowHourlyRecord>();

  for (const record of records) {
    if (
      record.status.trim().toLowerCase() === "inactive" ||
      (record.pm25Aqi == null && record.pm25UgM3 == null)
    ) {
      continue;
    }

    const existing = byStation.get(record.stationId);
    if (
      !existing ||
      new Date(record.observedAt).getTime() >
        new Date(existing.observedAt).getTime() ||
      (record.observedAt === existing.observedAt &&
        pm25CompletenessScore(record) >= pm25CompletenessScore(existing))
    ) {
      byStation.set(record.stationId, record);
    }
  }

  return Array.from(byStation.values());
}

export function toCurrentAirQualityReading(
  record: AirNowHourlyRecord,
  now: Date = new Date(),
): CurrentAirQualityReading {
  const category = getAqiCategory(record.pm25Aqi);

  return {
    stationId: record.stationId,
    stationName: record.siteName,
    latitude: record.latitude,
    longitude: record.longitude,
    countryCode: record.countryCode,
    stateCode: record.stateCode,
    reportingAreas: record.reportingAreas,
    observedAt: record.observedAt,
    sourceAgency: record.dataSource,
    pm25Aqi: record.pm25Aqi,
    pm25UgM3: record.pm25UgM3,
    aqiCategory: category?.id ?? null,
    projectedCigaretteEquivalentsPerDay:
      projectCigaretteEquivalentsPerDay(record.pm25UgM3),
    freshness: classifyFreshness(record.observedAt, now),
    isPreliminary: true,
    dataMode: "live",
  };
}

function resolveFallback(
  fallback:
    | LoadLatestAirNowOptions["fallbackReadings"]
    | undefined,
  now: Date,
): CurrentAirQualityReading[] {
  const readings =
    typeof fallback === "function"
      ? fallback(now)
      : fallback ?? createDemoReadings(now);
  return readings.map((reading) => ({ ...reading }));
}

/**
 * Loads the newest usable hourly AirNow file. Candidate failures are isolated;
 * if no file yields map-ready PM2.5 records, clearly labeled demo data are
 * returned instead of presenting an empty or falsely current map.
 */
export async function loadLatestAirNowReadings(
  options: LoadLatestAirNowOptions = {},
): Promise<LatestAirNowReadingsResult> {
  const now = options.now ?? new Date();
  const candidates = getLatestAirNowFileCandidates(
    now,
    options.lookbackFileCount ?? 3,
    options.baseUrl ?? AIRNOW_FILES_BASE_URL,
  );
  const attempts: AirNowLoadAttempt[] = [];
  const parseIssues: AirNowParseIssue[] = [];

  for (const descriptor of candidates) {
    try {
      const fetched = await fetchAirNowHourlyFile(descriptor, {
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        now: () => now,
      });
      const parsed = parseAirNowHourlyData(fetched.body);
      parseIssues.push(...parsed.issues);
      const records = selectCurrentPm25Records(parsed.records);

      if (records.length === 0) {
        attempts.push({
          descriptor,
          status: "empty",
          message: "File contained no usable current PM2.5 records",
        });
        continue;
      }

      attempts.push({ descriptor, status: "success" });
      return {
        mode: "live",
        readings: records.map((record) =>
          toCurrentAirQualityReading(record, now),
        ),
        sourceFile: descriptor,
        attempts,
        parseIssues,
        fallbackReason: null,
      };
    } catch (error) {
      if (error instanceof AirNowHttpError) {
        attempts.push({
          descriptor,
          status: error.status === 404 ? "not-found" : "http-error",
          message: error.message,
        });
      } else {
        attempts.push({
          descriptor,
          status: "network-error",
          message: error instanceof Error ? error.message : "Unknown fetch error",
        });
      }
    }
  }

  const fallbackReason = attempts
    .map((attempt) => `${attempt.descriptor.filename}: ${attempt.status}`)
    .join("; ");

  return {
    mode: "snapshot",
    readings: resolveFallback(options.fallbackReadings, now),
    sourceFile: null,
    attempts,
    parseIssues,
    fallbackReason: fallbackReason || "No AirNow candidates were available",
  };
}
