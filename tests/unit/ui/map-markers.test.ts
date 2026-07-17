import { describe, expect, it } from "vitest";

import { formatEquivalentMarker } from "../../../lib/ui/map-markers";

describe("formatEquivalentMarker", () => {
  it("keeps the approximation and daily-rate framing visible", () => {
    expect(formatEquivalentMarker(0)).toEqual({
      available: true,
      label: "≈0",
      unitLabel: "cig/day",
    });
    expect(formatEquivalentMarker(0.7818)).toEqual({
      available: true,
      label: "≈0.8",
      unitLabel: "cig/day",
    });
    expect(formatEquivalentMarker(12.4)).toEqual({
      available: true,
      label: "≈12",
      unitLabel: "cig/day",
    });
  });

  it("uses an explicit lower bound for small positive values", () => {
    expect(formatEquivalentMarker(0.04)).toEqual({
      available: true,
      label: "<0.1",
      unitLabel: "cig/day",
    });
  });

  it("never presents missing data as zero", () => {
    expect(formatEquivalentMarker(null)).toEqual({
      available: false,
      label: "—",
      unitLabel: "not available",
    });
    expect(formatEquivalentMarker(Number.NaN)).toEqual({
      available: false,
      label: "—",
      unitLabel: "not available",
    });
  });
});
