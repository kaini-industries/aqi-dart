import { describe, expect, it } from "vitest";

import { classifyFreshness, getFreshness } from "@/lib/domain/freshness";

const NOW = new Date("2026-07-16T18:00:00.000Z");

describe("observation freshness", () => {
  it.each([
    ["2026-07-16T18:00:00.000Z", "fresh"],
    ["2026-07-16T16:00:00.000Z", "fresh"],
    ["2026-07-16T15:59:59.999Z", "stale"],
    ["2026-07-16T12:00:00.000Z", "stale"],
    ["2026-07-16T11:59:59.999Z", "expired"],
  ])("classifies %s as %s", (observedAt, expected) => {
    expect(classifyFreshness(observedAt, NOW)).toBe(expected);
  });

  it("clamps a future observation age to zero", () => {
    expect(getFreshness("2026-07-16T18:05:00.000Z", NOW)).toMatchObject({
      state: "fresh",
      ageMilliseconds: 0,
      ageMinutes: 0,
      ageHours: 0,
    });
  });

  it("fails closed for invalid dates", () => {
    expect(getFreshness("not-a-date", NOW)).toEqual({
      state: "expired",
      ageMilliseconds: null,
      ageMinutes: null,
      ageHours: null,
    });
    expect(classifyFreshness(NOW, "bad-now")).toBe("expired");
  });
});
