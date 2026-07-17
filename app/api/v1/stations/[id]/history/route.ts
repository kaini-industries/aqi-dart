import { NextResponse } from "next/server";

import { getStationHistory } from "@/lib/data/readings";
import type { StationHistoryObservation } from "@/lib/db/readings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_HISTORY_HOURS = 24;
const MAX_HISTORY_HOURS = 168;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function parseHours(searchParams: URLSearchParams): number {
  const raw = searchParams.get("hours");
  if (!raw) {
    return DEFAULT_HISTORY_HOURS;
  }

  const hours = Number(raw);
  if (!Number.isInteger(hours) || hours <= 0) {
    throw new RangeError("hours must be a positive whole number");
  }
  return Math.min(hours, MAX_HISTORY_HOURS);
}

function buildHourlySeries(
  observations: readonly StationHistoryObservation[],
  windowStart: string,
  expectedHours: number,
) {
  const hourMs = 60 * 60 * 1_000;
  const start = new Date(windowStart).getTime();
  const byHour = new Map(
    observations.map((observation) => [
      Math.floor(new Date(observation.observedAt).getTime() / hourMs) * hourMs,
      observation,
    ]),
  );

  return Array.from({ length: expectedHours }, (_, index) => {
    const observedAt = new Date(start + index * hourMs).toISOString();
    const observation = byHour.get(start + index * hourMs);
    return observation
      ? { ...observation, isGap: false }
      : {
          observedAt,
          pm25UgM3: null,
          pm25Aqi: null,
          aqiCategory: null,
          projectedCigaretteEquivalentsPerDay: null,
          sourceAgency: null,
          isPreliminary: false,
          isGap: true,
        };
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const stationId = id.trim();
    if (!stationId || stationId.length > 128) {
      return errorResponse(400, "invalid_station", "Invalid station ID.");
    }

    const hours = parseHours(new URL(request.url).searchParams);
    const result = await getStationHistory(stationId, hours);
    if (!result) {
      return errorResponse(404, "station_not_found", "Station was not found.");
    }

    return NextResponse.json(
      {
        station: result.station,
        observations: result.observations,
        series: buildHourlySeries(
          result.observations,
          result.summary.windowStart,
          result.summary.expectedHours,
        ),
        summary: result.summary,
        meta: {
          dataMode: result.dataMode,
          persistentHistoryAvailable: result.dataMode === "database",
          requestedHours: hours,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
          Vary: "Accept-Encoding",
          "X-Data-Mode": result.dataMode,
        },
      },
    );
  } catch (error) {
    if (error instanceof RangeError) {
      return errorResponse(400, "invalid_query", error.message);
    }

    console.error("Unable to load station history", error);
    return errorResponse(
      503,
      "history_unavailable",
      "Station history is temporarily unavailable.",
    );
  }
}
