import type { AqiCategoryId } from "./aqi";
import type { FreshnessState } from "./freshness";

export type ReadingDataMode = "live" | "database" | "demo";

export interface CurrentAirQualityReading {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  stateCode: string | null;
  reportingAreas: readonly string[];
  observedAt: string;
  sourceAgency: string | null;
  pm25Aqi: number | null;
  pm25UgM3: number | null;
  aqiCategory: AqiCategoryId | null;
  projectedCigaretteEquivalentsPerDay: number | null;
  freshness: FreshnessState;
  isPreliminary: boolean;
  dataMode: ReadingDataMode;
}
