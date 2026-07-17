import { NextResponse } from "next/server";

import {
  DEFAULT_READINGS_BOUNDS,
  getCurrentReadings,
} from "@/lib/data/readings";
import { getDataMode } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();

  try {
    const result = await getCurrentReadings(
      {
        bounds: DEFAULT_READINGS_BOUNDS,
        freshWithinHours: 24,
        limit: 5_000,
      },
      now,
    );
    const newest = result.readings.reduce<
      (typeof result.readings)[number] | null
    >(
      (latest, reading) =>
        !latest || reading.observedAt > latest.observedAt ? reading : latest,
      null,
    );
    const isDemo = result.dataMode === "demo";

    return NextResponse.json(
      {
        application: { status: "ok" },
        data: {
          status: isDemo
            ? "degraded"
            : newest
              ? newest.freshness === "expired"
                ? "stale"
                : "ok"
              : "unavailable",
          configuredMode: getDataMode(),
          activeMode: result.dataMode,
          newestObservedAt: newest?.observedAt ?? null,
          freshness: newest?.freshness ?? null,
          readingCount: result.readings.length,
          message: isDemo
            ? "The application is healthy, but the current map is using labeled demonstration data."
            : newest
              ? null
              : "The application is healthy, but no recent observations are available.",
        },
        checkedAt: now.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check could not inspect data freshness", error);
    return NextResponse.json(
      {
        application: { status: "ok" },
        data: {
          status: "unavailable",
          configuredMode: getDataMode(),
          activeMode: null,
          newestObservedAt: null,
          freshness: null,
          readingCount: 0,
          message:
            "The application is healthy, but data freshness could not be checked.",
        },
        checkedAt: now.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
