import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  getCurrentReadings,
  parseReadingsQuery,
  READINGS_METHODOLOGY_VERSION,
  ReadingsQueryError,
} from "@/lib/data/readings";
import type { CurrentAirQualityReading } from "@/lib/domain/readings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=900";
const RESPONSE_TIME_BUCKET_MS = 5 * 60 * 1_000;

function toFeature(reading: CurrentAirQualityReading) {
  return {
    type: "Feature" as const,
    id: reading.stationId,
    geometry: {
      type: "Point" as const,
      coordinates: [reading.longitude, reading.latitude],
    },
    properties: {
      stationId: reading.stationId,
      stationName: reading.stationName,
      countryCode: reading.countryCode,
      stateCode: reading.stateCode,
      reportingAreas: reading.reportingAreas,
      observedAt: reading.observedAt,
      freshness: reading.freshness,
      pm25Aqi: reading.pm25Aqi,
      aqiCategory: reading.aqiCategory,
      pm25UgM3: reading.pm25UgM3,
      projectedCigaretteEquivalentsPerDay:
        reading.projectedCigaretteEquivalentsPerDay,
      methodologyVersion: READINGS_METHODOLOGY_VERSION,
      sourceAgency: reading.sourceAgency,
      isPreliminary: reading.isPreliminary,
      dataMode: reading.dataMode,
    },
  };
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = parseReadingsQuery(url.searchParams);
    const now = new Date();
    const result = await getCurrentReadings(query, now);
    const features = result.readings.map(toFeature);
    const freshnessCounts = result.readings.reduce(
      (counts, reading) => {
        counts[reading.freshness] += 1;
        return counts;
      },
      { fresh: 0, stale: 0, expired: 0 },
    );
    const newestObservedAt = result.readings.reduce<string | null>(
      (latest, reading) =>
        latest == null || reading.observedAt > latest
          ? reading.observedAt
          : latest,
      null,
    );
    const generatedAt = new Date(
      Math.floor(now.getTime() / RESPONSE_TIME_BUCKET_MS) *
        RESPONSE_TIME_BUCKET_MS,
    ).toISOString();
    const payload = {
      type: "FeatureCollection" as const,
      bbox: [
        query.bounds.west,
        query.bounds.south,
        query.bounds.east,
        query.bounds.north,
      ],
      features,
      meta: {
        generatedAt,
        newestObservedAt,
        dataMode: result.dataMode,
        featureCount: features.length,
        truncated: result.truncated,
        freshWithinHours: query.freshWithinHours,
        limit: query.limit,
        freshnessCounts,
        sourceFile: result.sourceFile,
        fallbackReason: result.fallbackReason,
        methodologyVersion: READINGS_METHODOLOGY_VERSION,
      },
    };
    const body = JSON.stringify(payload);
    const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
    const responseHeaders = {
      "Cache-Control": CACHE_CONTROL,
      ETag: etag,
      Vary: "Accept-Encoding",
      "X-Data-Mode": result.dataMode,
    };

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: responseHeaders });
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...responseHeaders,
        "Content-Type": "application/geo+json; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof ReadingsQueryError) {
      return errorResponse(400, "invalid_query", error.message);
    }

    console.error("Unable to load current AQI readings", error);
    return errorResponse(
      503,
      "readings_unavailable",
      "Current air-quality readings are temporarily unavailable.",
    );
  }
}
