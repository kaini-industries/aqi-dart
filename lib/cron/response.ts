import { NextResponse } from "next/server";

import type { AirNowImportResult } from "@/lib/db/ingest";

export function cronError(
  status: number,
  code: string,
  message: string,
) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function summarizeImports(results: readonly AirNowImportResult[]) {
  return results.reduce(
    (summary, result) => {
      summary[result.status] += 1;
      summary.rowsSeen += result.rowsSeen;
      summary.rowsAccepted += result.rowsAccepted;
      summary.rowsRejected += result.rowsRejected;
      summary.rowsChanged += result.rowsChanged;
      summary.warnings += result.warnings;
      return summary;
    },
    {
      success: 0,
      duplicate: 0,
      locked: 0,
      "not-found": 0,
      failed: 0,
      rowsSeen: 0,
      rowsAccepted: 0,
      rowsRejected: 0,
      rowsChanged: 0,
      warnings: 0,
    },
  );
}
