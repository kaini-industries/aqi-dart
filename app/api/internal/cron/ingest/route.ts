import { NextResponse } from "next/server";

import { getAirNowIngestionCandidates } from "@/lib/airnow";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { cronError, summarizeImports } from "@/lib/cron/response";
import { hasDatabase } from "@/lib/db/client";
import { importAirNowFiles } from "@/lib/db/ingest";
import { getServerEnvironment } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) {
    return cronError(
      authorization.status,
      authorization.code,
      authorization.message,
    );
  }
  if (!hasDatabase()) {
    return cronError(
      503,
      "database_not_configured",
      "DATABASE_URL is required for persistent collection.",
    );
  }

  const startedAt = new Date();
  try {
    const { AIRNOW_BASE_URL } = getServerEnvironment();
    // Three current candidates plus a three-file rotating correction shard.
    // This stays bounded for Hobby while covering the 72-hour window when an
    // external scheduler invokes the endpoint hourly.
    const candidates = getAirNowIngestionCandidates(
      startedAt,
      AIRNOW_BASE_URL,
    ).slice(0, 6);
    const results = await importAirNowFiles(candidates, 2);
    const summary = summarizeImports(results);
    const currentResults = results.slice(0, 3);
    const currentUsable = currentResults.some(
      (result) =>
        ((result.status === "success" || result.status === "duplicate") &&
          result.rowsAccepted > 0),
    );
    if (!currentUsable) {
      return cronError(
        502,
        "airnow_import_failed",
        "None of the three current AirNow candidate files was imported successfully.",
      );
    }

    return NextResponse.json(
      {
        ok: true,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        summary,
        imports: results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("AirNow cron ingestion failed", error);
    return cronError(
      500,
      "ingest_failed",
      error instanceof Error ? error.message : "Unknown ingestion error",
    );
  }
}
