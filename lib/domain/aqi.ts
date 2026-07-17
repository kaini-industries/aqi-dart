export const AQI_CATEGORIES = [
  {
    id: "good",
    label: "Good",
    shortLabel: "Good",
    min: 0,
    max: 50,
    color: "#00E400",
  },
  {
    id: "moderate",
    label: "Moderate",
    shortLabel: "Moderate",
    min: 51,
    max: 100,
    color: "#FFFF00",
  },
  {
    id: "unhealthy-for-sensitive-groups",
    label: "Unhealthy for Sensitive Groups",
    shortLabel: "Sensitive groups",
    min: 101,
    max: 150,
    color: "#FF7E00",
  },
  {
    id: "unhealthy",
    label: "Unhealthy",
    shortLabel: "Unhealthy",
    min: 151,
    max: 200,
    color: "#FF0000",
  },
  {
    id: "very-unhealthy",
    label: "Very Unhealthy",
    shortLabel: "Very unhealthy",
    min: 201,
    max: 300,
    color: "#8F3F97",
  },
  {
    id: "hazardous",
    label: "Hazardous",
    shortLabel: "Hazardous",
    min: 301,
    max: Number.POSITIVE_INFINITY,
    color: "#7E0023",
  },
] as const;

export type AqiCategoryDefinition = (typeof AQI_CATEGORIES)[number];
export type AqiCategoryId = AqiCategoryDefinition["id"];

/**
 * Classifies a source-supplied U.S. EPA AQI value without rounding or
 * recalculating it. Invalid and negative values intentionally have no category.
 */
export function getAqiCategory(
  aqi: number | null | undefined,
): AqiCategoryDefinition | null {
  if (aqi == null || !Number.isFinite(aqi) || aqi < 0) {
    return null;
  }

  return AQI_CATEGORIES.find((category) => aqi <= category.max) ?? null;
}

export function getAqiCategoryById(
  id: AqiCategoryId,
): AqiCategoryDefinition {
  const category = AQI_CATEGORIES.find((candidate) => candidate.id === id);

  // The union type guarantees that this is unreachable unless this module's
  // definitions get out of sync.
  if (!category) {
    throw new RangeError(`Unknown AQI category: ${id}`);
  }

  return category;
}
