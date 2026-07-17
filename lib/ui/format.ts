import {
  getAqiCategoryById,
  type AqiCategoryId,
} from "@/lib/domain/aqi";
import { formatCigaretteEquivalent } from "@/lib/domain/exposure";
import type { ReadingFeatureProperties } from "@/lib/ui/types";

export function categoryLabel(category: AqiCategoryId | null): string {
  return category ? getAqiCategoryById(category).label : "AQI unavailable";
}

export function shortCategoryLabel(category: AqiCategoryId | null): string {
  return category ? getAqiCategoryById(category).shortLabel : "Unavailable";
}

export function formatAqi(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : Math.round(value).toString();
}

export function formatConcentration(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "Not available";
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} µg/m³`;
}

export function formatEquivalent(value: number | null): string {
  return formatCigaretteEquivalent(value);
}

export function formatLocation(
  reading: Pick<
    ReadingFeatureProperties,
    "reportingAreas" | "stateCode" | "countryCode"
  >,
): string {
  if (reading.reportingAreas.length > 0) {
    return reading.reportingAreas[0];
  }
  return [reading.stateCode, reading.countryCode].filter(Boolean).join(", ") || "Monitor location";
}

export function formatObservationTime(
  iso: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "Time unavailable";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
  }).format(date);
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "time unavailable";
  }

  const differenceSeconds = (date.getTime() - now.getTime()) / 1_000;
  const absoluteSeconds = Math.abs(differenceSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absoluteSeconds < 60) {
    return formatter.format(Math.round(differenceSeconds), "second");
  }
  if (absoluteSeconds < 3_600) {
    return formatter.format(Math.round(differenceSeconds / 60), "minute");
  }
  if (absoluteSeconds < 86_400) {
    return formatter.format(Math.round(differenceSeconds / 3_600), "hour");
  }
  return formatter.format(Math.round(differenceSeconds / 86_400), "day");
}
