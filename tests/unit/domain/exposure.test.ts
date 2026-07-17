import { describe, expect, it } from "vitest";

import {
  CIGARETTE_EQUIVALENT_METHODOLOGY_VERSION,
  accumulateCigaretteEquivalents,
  formatCigaretteEquivalent,
  projectCigaretteEquivalentsPerDay,
  summarizeTrailingExposure,
  type HourlyPm25Reading,
} from "@/lib/domain/exposure";

const HOUR_MS = 60 * 60 * 1_000;
const WINDOW_START = Date.parse("2026-07-15T00:00:00.000Z");
const WINDOW_END = new Date(WINDOW_START + 24 * HOUR_MS);

function hourlyReadings(
  hours: readonly number[],
  pm25UgM3 = 22,
): HourlyPm25Reading[] {
  return hours.map((hour) => ({
    observedAt: new Date(WINDOW_START + hour * HOUR_MS),
    pm25UgM3,
  }));
}

describe("cigarette-equivalent calculations", () => {
  it("projects 22 µg/m³ to one equivalent per day", () => {
    expect(projectCigaretteEquivalentsPerDay(22)).toBe(1);
  });

  it("integrates 44 µg/m³ over six hours to 0.5 equivalents", () => {
    expect(
      accumulateCigaretteEquivalents([
        { pm25UgM3: 44, durationHours: 6 },
      ]),
    ).toBe(0.5);
  });

  it("clamps negative source concentrations only for the derived value", () => {
    expect(projectCigaretteEquivalentsPerDay(-4.2)).toBe(0);
    expect(
      accumulateCigaretteEquivalents([
        { pm25UgM3: -4.2, durationHours: 1 },
      ]),
    ).toBe(0);
  });

  it("returns null instead of zero when no measured duration exists", () => {
    expect(projectCigaretteEquivalentsPerDay(null)).toBeNull();
    expect(
      accumulateCigaretteEquivalents([
        { pm25UgM3: null },
        { pm25UgM3: Number.NaN },
        { pm25UgM3: 22, durationHours: 0 },
      ]),
    ).toBeNull();
  });

  it("does not scale a partial set of hours to a full day", () => {
    const summary = summarizeTrailingExposure(hourlyReadings([0, 1, 2, 3], 44), {
      endAt: WINDOW_END,
    });

    expect(summary.cigaretteEquivalents).toBeCloseTo(1 / 3);
    expect(summary.capturedHours).toBe(4);
    expect(summary.completenessPercent).toBeCloseTo(100 / 6);
    expect(summary.isComplete).toBe(false);
  });

  it("marks 20 readings complete when no missing run exceeds three hours", () => {
    const presentHours = Array.from({ length: 24 }, (_, hour) => hour).filter(
      (hour) => ![3, 8, 13, 18].includes(hour),
    );
    const summary = summarizeTrailingExposure(hourlyReadings(presentHours), {
      endAt: WINDOW_END,
    });

    expect(summary.distinctHourlyReadings).toBe(20);
    expect(summary.longestMissingGapHours).toBe(1);
    expect(summary.isComplete).toBe(true);
    expect(summary.methodologyVersion).toBe(
      CIGARETTE_EQUIVALENT_METHODOLOGY_VERSION,
    );
  });

  it("marks a four-hour contiguous gap incomplete even with 20 readings", () => {
    const presentHours = Array.from({ length: 24 }, (_, hour) => hour).filter(
      (hour) => hour < 10 || hour > 13,
    );
    const summary = summarizeTrailingExposure(hourlyReadings(presentHours), {
      endAt: WINDOW_END,
    });

    expect(summary.distinctHourlyReadings).toBe(20);
    expect(summary.longestMissingGapHours).toBe(4);
    expect(summary.isComplete).toBe(false);
  });

  it("deduplicates readings by UTC hour with the final correction winning", () => {
    const summary = summarizeTrailingExposure(
      [
        ...hourlyReadings([0], 22),
        { observedAt: new Date(WINDOW_START + 20 * 60 * 1_000), pm25UgM3: 44 },
      ],
      { endAt: WINDOW_END },
    );

    expect(summary.distinctHourlyReadings).toBe(1);
    expect(summary.cigaretteEquivalents).toBeCloseTo(2 / 24);
  });

  it("includes missing runs at the beginning and end of the window", () => {
    const summary = summarizeTrailingExposure(hourlyReadings([4, 5, 6, 7]), {
      endAt: WINDOW_END,
    });
    expect(summary.longestMissingGapHours).toBe(16);
  });

  it("defaults the window to the hour following the latest reading", () => {
    const summary = summarizeTrailingExposure(hourlyReadings([22, 23]));
    expect(summary.windowEnd).toBe(WINDOW_END.toISOString());
  });

  it("validates completeness options", () => {
    expect(() =>
      summarizeTrailingExposure([], { expectedHours: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      summarizeTrailingExposure([], {
        expectedHours: 4,
        minimumCompleteReadings: 5,
      }),
    ).toThrow(RangeError);
    expect(() =>
      summarizeTrailingExposure([], { maximumMissingGapHours: -1 }),
    ).toThrow(RangeError);
  });

  it.each([
    [null, "Not available"],
    [-1, "Not available"],
    [0, "0.0"],
    [0.01, "<0.1"],
    [1.26, "1.3"],
    [9.94, "9.9"],
    [10.4, "10"],
    [10.6, "11"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatCigaretteEquivalent(value)).toBe(expected);
  });
});
