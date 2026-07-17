import { describe, expect, it } from "vitest";

import {
  AQI_CATEGORIES,
  getAqiCategory,
  getAqiCategoryById,
} from "@/lib/domain/aqi";

describe("getAqiCategory", () => {
  it.each([
    [0, "good"],
    [50, "good"],
    [50.1, "moderate"],
    [51, "moderate"],
    [100, "moderate"],
    [101, "unhealthy-for-sensitive-groups"],
    [150, "unhealthy-for-sensitive-groups"],
    [151, "unhealthy"],
    [200, "unhealthy"],
    [201, "very-unhealthy"],
    [300, "very-unhealthy"],
    [301, "hazardous"],
    [501, "hazardous"],
  ])("classifies %s as %s", (aqi, expected) => {
    expect(getAqiCategory(aqi)?.id).toBe(expected);
  });

  it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not classify invalid value %s",
    (aqi) => {
      expect(getAqiCategory(aqi)).toBeNull();
    },
  );

  it("keeps the official category colors and ordered ranges together", () => {
    expect(AQI_CATEGORIES.map(({ id }) => id)).toEqual([
      "good",
      "moderate",
      "unhealthy-for-sensitive-groups",
      "unhealthy",
      "very-unhealthy",
      "hazardous",
    ]);
    expect(getAqiCategoryById("hazardous").color).toBe("#7E0023");
  });
});
