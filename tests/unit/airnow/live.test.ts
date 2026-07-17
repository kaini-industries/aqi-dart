import { describe, expect, it, vi } from "vitest";

import { createDemoReadings } from "@/data/demo-readings";
import {
  loadLatestAirNowReadings,
  selectCurrentPm25Records,
  toCurrentAirQualityReading,
} from "@/lib/airnow/live";
import { parseAirNowHourlyData } from "@/lib/airnow/parser";

import { makeAirNowRow } from "./fixture";

const NOW = new Date("2026-07-16T18:45:00.000Z");
const CURRENT_ROW = makeAirNowRow({
  10: "07/16/26",
  11: "17:00",
  16: "82",
  22: "44",
});

function parsedRecord(row = CURRENT_ROW) {
  const parsed = parseAirNowHourlyData(row);
  if (!parsed.records[0]) {
    throw new Error("Test fixture failed to parse");
  }
  return parsed.records[0];
}

describe("current AirNow reading selection", () => {
  it("excludes inactive and empty-PM2.5 records", () => {
    const active = parsedRecord();
    const inactive = parsedRecord(
      makeAirNowRow({
        0: "inactive",
        2: "Inactive",
        10: "07/16/26",
        11: "17:00",
      }),
    );
    const empty = parsedRecord(
      makeAirNowRow({
        0: "empty",
        10: "07/16/26",
        11: "17:00",
        16: "",
        22: "",
        23: "",
      }),
    );

    expect(selectCurrentPm25Records([active, inactive, empty])).toEqual([
      active,
    ]);
  });

  it("deduplicates a station in favor of the most complete correction", () => {
    const aqiOnly = parsedRecord(
      makeAirNowRow({
        10: "07/16/26",
        11: "17:00",
        22: "",
        23: "",
      }),
    );
    const complete = parsedRecord();

    expect(selectCurrentPm25Records([aqiOnly, complete])).toEqual([complete]);
  });

  it("maps source fields and derives only from raw PM2.5", () => {
    const reading = toCurrentAirQualityReading(parsedRecord(), NOW);

    expect(reading).toMatchObject({
      stationId: "320030540",
      observedAt: "2026-07-16T17:00:00.000Z",
      pm25Aqi: 82,
      pm25UgM3: 44,
      aqiCategory: "moderate",
      projectedCigaretteEquivalentsPerDay: 2,
      freshness: "fresh",
      isPreliminary: true,
      dataMode: "live",
    });
  });
});

describe("loadLatestAirNowReadings", () => {
  it("tries newest files in order and uses the first usable response", async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requested.push(String(input));
      if (requested.length === 1) {
        return new Response("missing", { status: 404 });
      }
      return new Response(CURRENT_ROW);
    });

    const result = await loadLatestAirNowReadings({ now: NOW, fetchImpl });

    expect(requested).toEqual([
      "https://files.airnowtech.org/airnow/2026/20260716/HourlyAQObs_2026071618.dat",
      "https://files.airnowtech.org/airnow/2026/20260716/HourlyAQObs_2026071617.dat",
    ]);
    expect(result.mode).toBe("live");
    expect(result.sourceFile?.filename).toBe("HourlyAQObs_2026071617.dat");
    expect(result.attempts.map(({ status }) => status)).toEqual([
      "not-found",
      "success",
    ]);
    expect(result.readings).toHaveLength(1);
  });

  it("keeps row-level parser issues while serving valid rows", async () => {
    const result = await loadLatestAirNowReadings({
      now: NOW,
      fetchImpl: async () =>
        new Response(`"too","few"\n${CURRENT_ROW}`),
    });

    expect(result.mode).toBe("live");
    expect(result.readings).toHaveLength(1);
    expect(result.parseIssues).toContainEqual(
      expect.objectContaining({ code: "field-count" }),
    );
  });

  it("falls back to clearly labeled demo readings after all candidates fail", async () => {
    const result = await loadLatestAirNowReadings({
      now: NOW,
      fetchImpl: async () => new Response("missing", { status: 404 }),
    });

    expect(result.mode).toBe("snapshot");
    expect(result.sourceFile).toBeNull();
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.every(({ status }) => status === "not-found")).toBe(
      true,
    );
    expect(result.readings.length).toBeGreaterThan(10);
    expect(result.readings.every(({ dataMode }) => dataMode === "demo")).toBe(
      true,
    );
    expect(result.fallbackReason).toContain("HourlyAQObs_2026071618.dat");
  });

  it("supports a caller-provided deterministic snapshot", async () => {
    const customFallback = createDemoReadings(NOW).slice(0, 1);
    const result = await loadLatestAirNowReadings({
      now: NOW,
      fetchImpl: async () => {
        throw new Error("provider offline");
      },
      fallbackReadings: customFallback,
    });

    expect(result.mode).toBe("snapshot");
    expect(result.readings).toEqual(customFallback);
    expect(result.readings).not.toBe(customFallback);
    expect(result.attempts.every(({ status }) => status === "network-error")).toBe(
      true,
    );
  });

  it("distinguishes non-404 provider errors and unusable files", async () => {
    let attempt = 0;
    const result = await loadLatestAirNowReadings({
      now: NOW,
      fetchImpl: async () => {
        attempt += 1;
        if (attempt === 1) {
          return new Response("provider error", { status: 503 });
        }
        return new Response(makeAirNowRow({ 16: "", 22: "", 23: "" }));
      },
    });

    expect(result.mode).toBe("snapshot");
    expect(result.attempts.map(({ status }) => status)).toEqual([
      "http-error",
      "empty",
      "empty",
    ]);
  });
});
