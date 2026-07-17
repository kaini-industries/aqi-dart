import type { AqiCategoryId } from "@/lib/domain/aqi";
import type { FreshnessState } from "@/lib/domain/freshness";
import type { ReadingDataMode } from "@/lib/domain/readings";

export type DisplayMode = "aqi" | "cigarettes";
export type ExplorerView = "map" | "list";

export interface ReadingFeatureProperties {
  stationId: string;
  stationName: string;
  countryCode: string | null;
  stateCode: string | null;
  reportingAreas: readonly string[];
  observedAt: string;
  freshness: FreshnessState;
  pm25Aqi: number | null;
  aqiCategory: AqiCategoryId | null;
  pm25UgM3: number | null;
  projectedCigaretteEquivalentsPerDay: number | null;
  methodologyVersion: string;
  sourceAgency: string | null;
  isPreliminary: boolean;
  dataMode: ReadingDataMode;
}

export interface ReadingFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: ReadingFeatureProperties;
}

export interface ReadingsFeatureCollection {
  type: "FeatureCollection";
  bbox: [number, number, number, number];
  features: ReadingFeature[];
  meta: {
    generatedAt: string;
    newestObservedAt: string | null;
    dataMode: ReadingDataMode;
    featureCount: number;
    truncated: boolean;
    freshWithinHours: number;
    limit: number;
    freshnessCounts: Record<FreshnessState, number>;
    sourceFile: string | null;
    fallbackReason: string | null;
    methodologyVersion: string;
  };
}

export interface HistoryObservation {
  observedAt: string;
  pm25UgM3: number | null;
  pm25Aqi: number | null;
  aqiCategory: AqiCategoryId | null;
  projectedCigaretteEquivalentsPerDay: number | null;
  sourceAgency: string | null;
  isPreliminary: boolean;
}

export interface HistorySeriesPoint extends HistoryObservation {
  isGap: boolean;
}

export interface StationHistoryResponse {
  station: {
    stationId: string;
    stationName: string;
    latitude: number;
    longitude: number;
    countryCode: string | null;
    stateCode: string | null;
    reportingAreas: string[];
    sourceAgency: string | null;
  };
  observations: HistoryObservation[];
  series: HistorySeriesPoint[];
  summary: {
    cigaretteEquivalents: number | null;
    capturedHours: number;
    expectedHours: number;
    completenessPercent: number;
    distinctHourlyReadings: number;
    longestMissingGapHours: number;
    isComplete: boolean;
    windowStart: string;
    windowEnd: string;
    methodologyVersion: string;
  };
  meta: {
    dataMode: ReadingDataMode;
    persistentHistoryAvailable: boolean;
    requestedHours: number;
  };
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}
