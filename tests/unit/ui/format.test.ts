import { describe, expect, it } from "vitest";

import {
  categoryLabel,
  formatAqi,
  formatConcentration,
  formatEquivalent,
  formatLocation,
  formatRelativeTime,
} from "@/lib/ui/format";

describe("UI air-quality formatting", () => {
  it("never presents missing measurements as zero", () => {
    expect(formatAqi(null)).toBe("—");
    expect(formatConcentration(null)).toBe("Not available");
    expect(formatEquivalent(null)).toBe("Not available");
  });

  it("uses the compact cigarette-equivalent precision rules", () => {
    expect(formatEquivalent(0.04)).toBe("<0.1");
    expect(formatEquivalent(0.75)).toBe("0.8");
    expect(formatEquivalent(12.6)).toBe("13");
  });

  it("pairs category identifiers with readable language", () => {
    expect(categoryLabel("unhealthy-for-sensitive-groups")).toBe(
      "Unhealthy for Sensitive Groups",
    );
    expect(categoryLabel(null)).toBe("AQI unavailable");
  });

  it("prefers a reporting area and falls back to state and country", () => {
    expect(
      formatLocation({
        reportingAreas: ["Chicago"],
        stateCode: "IL",
        countryCode: "US",
      }),
    ).toBe("Chicago");
    expect(
      formatLocation({
        reportingAreas: [],
        stateCode: "IL",
        countryCode: "US",
      }),
    ).toBe("IL, US");
  });

  it("formats relative observation age deterministically", () => {
    expect(
      formatRelativeTime(
        "2026-07-16T20:00:00.000Z",
        new Date("2026-07-16T22:00:00.000Z"),
      ),
    ).toBe("2 hours ago");
  });
});
