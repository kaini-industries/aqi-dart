import { NextResponse } from "next/server";

import { getAirNowHourlyFile } from "@/lib/airnow";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { cronError, summarizeImports } from "@/lib/cron/response";
import { hasDatabase } from "@/lib/db/client";
import { importAirNowFiles, pruneAirNowData } from "@/lib/db/ingest";
import { getServerEnvironment } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOUR_MS = 60 * 60 * 1_000;
const FIRST_CORRECTION_OFFSET = 3;
const CORRECTION_WINDOW_HOURS = 72;
const DEFAULT_BATCH_SIZE = 6;
const MAX_BATCH_SIZE = 6;

function positiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError("Reconciliation parameters must be positive integers");
  }
  return Math.min(parsed, maximum);
}

function reconciliationOffsets(url: URL, now: Date): number[] {
  const count = positiveInteger(
    url.searchParams.get("count"),
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
  );
  const possibleOffsets =
    CORRECTION_WINDOW_HOURS - FIRST_CORRECTION_OFFSET;
  const shardCount = Math.ceil(possibleOffsets / count);
  // Reconciliation is normally called once daily, so rotate by UTC day.
  // The separate hourly ingest route rotates its own correction shard hourly.
  const automaticStart =
    FIRST_CORRECTION_OFFSET +
    (Math.floor(now.getTime() / (24 * HOUR_MS)) % shardCount) * count;
  const start = positiveInteger(
    url.searchParams.get("start_offset"),
    automaticStart,
    CORRECTION_WINDOW_HOURS - 1,
  );

  if (start < FIRST_CORRECTION_OFFSET) {
    throw new RangeError("start_offset must be at least 3");
  }
  return Array.from({ length: count }, (_, index) => start + index).filter(
    (offset) => offset < CORRECTION_WINDOW_HOURS,
  );
}

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
      "DATABASE_URL is required for reconciliation.",
    );
  }

  const startedAt = new Date();
  try {
    const offsets = reconciliationOffsets(new URL(request.url), startedAt);
    const { AIRNOW_BASE_URL } = getServerEnvironment();
    const candidates = offsets.map((offset) =>
      getAirNowHourlyFile(
        startedAt.getTime() - offset * HOUR_MS,
        AIRNOW_BASE_URL,
      ),
    );
    const results = await importAirNowFiles(candidates, 2);
    const summary = summarizeImports(results);
    const retention = await pruneAirNowData();
    const usable = summary.success + summary.duplicate;
    if (usable === 0) {
      return cronError(
        502,
        "airnow_reconciliation_failed",
        "No correction-window file was imported successfully.",
      );
    }

    return NextResponse.json(
      {
        ok: true,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        offsets,
        summary,
        retention,
        imports: results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RangeError) {
      return cronError(400, "invalid_query", error.message);
    }
    console.error("AirNow reconciliation failed", error);
    return cronError(
      500,
      "reconcile_failed",
      error instanceof Error ? error.message : "Unknown reconciliation error",
    );
  }
}
