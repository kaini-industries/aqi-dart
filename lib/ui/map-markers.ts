export interface EquivalentMarkerText {
  available: boolean;
  label: string;
  unitLabel: string;
}

export function formatEquivalentMarker(
  cigaretteEquivalent: number | null | undefined,
): EquivalentMarkerText {
  if (
    cigaretteEquivalent == null ||
    !Number.isFinite(cigaretteEquivalent)
  ) {
    return {
      available: false,
      label: "—",
      unitLabel: "not available",
    };
  }

  if (cigaretteEquivalent > 0 && cigaretteEquivalent < 0.1) {
    return {
      available: true,
      label: "<0.1",
      unitLabel: "cig/day",
    };
  }

  const rounded =
    cigaretteEquivalent < 10
      ? cigaretteEquivalent.toFixed(1).replace(/\.0$/, "")
      : String(Math.round(cigaretteEquivalent));

  return {
    available: true,
    label: `≈${rounded}`,
    unitLabel: "cig/day",
  };
}
