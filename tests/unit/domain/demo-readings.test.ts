import { describe, expect, it } from "vitest";

import {
  DEMO_READINGS,
  DEMO_READING_SEEDS,
  DEMO_SNAPSHOT_GENERATED_AT,
  createDemoReadings,
} from "@/data/demo-readings";

describe("demo readings", () => {
  it("covers North America with transparently labeled synthetic data", () => {
    const readings = createDemoReadings(
      new Date("2026-07-16T18:45:00.000Z"),
    );

    expect(readings).toHaveLength(DEMO_READING_SEEDS.length);
    expect(new Set(readings.map(({ countryCode }) => countryCode))).toEqual(
      new Set(["US", "CA", "MX"]),
    );
    expect(readings.every(({ dataMode }) => dataMode === "demo")).toBe(true);
    expect(readings.every(({ isPreliminary }) => !isPreliminary)).toBe(true);
    expect(
      readings.every(({ sourceAgency }) => sourceAgency?.includes("not live")),
    ).toBe(true);
    expect(readings.every(({ freshness }) => freshness === "fresh")).toBe(true);
  });

  it("exports a fixed deterministic snapshot for tests and screenshots", () => {
    expect(DEMO_READINGS[0].observedAt).toBe("2026-07-16T17:00:00.000Z");
    expect(DEMO_SNAPSHOT_GENERATED_AT).toBe("2026-07-16T18:00:00.000Z");
  });

  it("rejects an invalid materialization time", () => {
    expect(() => createDemoReadings(new Date("invalid"))).toThrow(RangeError);
  });
});
