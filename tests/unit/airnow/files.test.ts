import { describe, expect, it } from "vitest";

import {
  floorToUtcHour,
  getAirNowHourlyFile,
  getAirNowIngestionCandidates,
  getAirNowReconciliationCandidates,
  getLatestAirNowFileCandidates,
} from "@/lib/airnow/files";

describe("AirNow file selection", () => {
  it("builds the exact canonical public bulk-file URL", () => {
    expect(getAirNowHourlyFile("2026-07-16T18:42:17.000Z")).toEqual({
      observedHour: "2026-07-16T18:00:00.000Z",
      dateKey: "20260716",
      hourKey: "2026071618",
      filename: "HourlyAQObs_2026071618.dat",
      url: "https://files.airnowtech.org/airnow/2026/20260716/HourlyAQObs_2026071618.dat",
    });
  });

  it("accepts a host override with or without a trailing slash", () => {
    expect(
      getAirNowHourlyFile("2026-07-16T18:00:00Z", "https://example.test/")
        .url,
    ).toBe(
      "https://example.test/airnow/2026/20260716/HourlyAQObs_2026071618.dat",
    );
  });

  it("orders latest candidates newest first across UTC midnight", () => {
    expect(
      getLatestAirNowFileCandidates("2026-01-01T00:12:00Z").map(
        ({ filename }) => filename,
      ),
    ).toEqual([
      "HourlyAQObs_2026010100.dat",
      "HourlyAQObs_2025123123.dat",
      "HourlyAQObs_2025123122.dat",
    ]);
  });

  it("floors timestamps to an exact UTC hour", () => {
    expect(floorToUtcHour("2026-07-16T18:59:59.999-05:00").toISOString()).toBe(
      "2026-07-16T23:00:00.000Z",
    );
  });

  it("rotates through the older 72-hour reconciliation window", () => {
    const first = getAirNowReconciliationCandidates(
      "2026-07-16T00:00:00Z",
    ).map(({ observedHour }) => observedHour);
    expect(first).toEqual([
      "2026-07-15T21:00:00.000Z",
      "2026-07-15T20:00:00.000Z",
      "2026-07-15T19:00:00.000Z",
    ]);

    const last = getAirNowReconciliationCandidates(
      "2026-07-16T22:00:00Z",
    ).map(({ observedHour }) => observedHour);
    expect(last).toEqual([
      "2026-07-14T01:00:00.000Z",
      "2026-07-14T00:00:00.000Z",
      "2026-07-13T23:00:00.000Z",
    ]);
  });

  it("returns three current and three reconciliation candidates", () => {
    const candidates = getAirNowIngestionCandidates("2026-07-16T18:00:00Z");
    expect(candidates).toHaveLength(6);
    expect(new Set(candidates.map(({ filename }) => filename)).size).toBe(6);
  });

  it("rejects invalid dates and candidate counts", () => {
    expect(() => floorToUtcHour("not-a-date")).toThrow(RangeError);
    expect(() => getLatestAirNowFileCandidates(new Date(), 0)).toThrow(
      RangeError,
    );
    expect(() =>
      getAirNowReconciliationCandidates(new Date(), {
        currentFileCount: 72,
      }),
    ).toThrow(RangeError);
  });
});
