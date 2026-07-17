import { describe, expect, it } from "vitest";

import {
  DEFAULT_READINGS_BOUNDS,
  isInsideBounds,
  parseBounds,
  parseReadingsQuery,
  ReadingsQueryError,
} from "@/lib/data/readings";

describe("readings query bounds", () => {
  it("uses the bounded North America default", () => {
    expect(parseBounds(null)).toEqual(DEFAULT_READINGS_BOUNDS);
  });

  it("accepts and filters an antimeridian-crossing viewport", () => {
    const bounds = parseBounds("170,-20,-170,20");

    expect(isInsideBounds({ latitude: 0, longitude: 175 }, bounds)).toBe(true);
    expect(isInsideBounds({ latitude: 0, longitude: -175 }, bounds)).toBe(true);
    expect(isInsideBounds({ latitude: 0, longitude: 0 }, bounds)).toBe(false);
  });

  it("rejects unbounded and malformed viewports", () => {
    expect(() => parseBounds("-170,-45,170,45")).toThrow(ReadingsQueryError);
    expect(() => parseBounds("-100,10,-90")).toThrow(ReadingsQueryError);
    expect(() => parseBounds("-100,20,-90,10")).toThrow(ReadingsQueryError);
  });

  it("caps freshness and result limits while requiring an integer limit", () => {
    const capped = parseReadingsQuery(
      new URLSearchParams({
        fresh_within_hours: "500",
        limit: "9000",
      }),
    );
    expect(capped.freshWithinHours).toBe(24);
    expect(capped.limit).toBe(5000);

    expect(() =>
      parseReadingsQuery(new URLSearchParams({ limit: "0.5" })),
    ).toThrow("limit must be a positive whole number");
  });
});
