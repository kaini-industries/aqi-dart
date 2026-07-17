import { getAqiCategory } from "../lib/domain/aqi";
import { projectCigaretteEquivalentsPerDay } from "../lib/domain/exposure";
import { classifyFreshness } from "../lib/domain/freshness";
import type { CurrentAirQualityReading } from "../lib/domain/readings";

export const DEMO_SNAPSHOT_GENERATED_AT = "2026-07-16T18:00:00.000Z";

interface DemoReadingSeed {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  stateCode: string;
  pm25Aqi: number;
  pm25UgM3: number;
}

export const DEMO_READING_SEEDS = [
  {
    stationId: "demo-vancouver",
    stationName: "Vancouver — Downtown",
    latitude: 49.2827,
    longitude: -123.1207,
    countryCode: "CA",
    stateCode: "BC",
    pm25Aqi: 32,
    pm25UgM3: 6.8,
  },
  {
    stationId: "demo-seattle",
    stationName: "Seattle — Beacon Hill",
    latitude: 47.5682,
    longitude: -122.3086,
    countryCode: "US",
    stateCode: "WA",
    pm25Aqi: 18,
    pm25UgM3: 4.4,
  },
  {
    stationId: "demo-portland",
    stationName: "Portland — Central Eastside",
    latitude: 45.5231,
    longitude: -122.6765,
    countryCode: "US",
    stateCode: "OR",
    pm25Aqi: 39,
    pm25UgM3: 9.2,
  },
  {
    stationId: "demo-san-francisco",
    stationName: "San Francisco — Bayview",
    latitude: 37.7659,
    longitude: -122.3997,
    countryCode: "US",
    stateCode: "CA",
    pm25Aqi: 55,
    pm25UgM3: 13,
  },
  {
    stationId: "demo-los-angeles",
    stationName: "Los Angeles — North Main",
    latitude: 34.0664,
    longitude: -118.2267,
    countryCode: "US",
    stateCode: "CA",
    pm25Aqi: 82,
    pm25UgM3: 25.4,
  },
  {
    stationId: "demo-phoenix",
    stationName: "Phoenix — Central",
    latitude: 33.4484,
    longitude: -112.074,
    countryCode: "US",
    stateCode: "AZ",
    pm25Aqi: 103,
    pm25UgM3: 37,
  },
  {
    stationId: "demo-denver",
    stationName: "Denver — CAMP",
    latitude: 39.7392,
    longitude: -104.9903,
    countryCode: "US",
    stateCode: "CO",
    pm25Aqi: 47,
    pm25UgM3: 10.1,
  },
  {
    stationId: "demo-minneapolis",
    stationName: "Minneapolis — Near Road",
    latitude: 44.9778,
    longitude: -93.265,
    countryCode: "US",
    stateCode: "MN",
    pm25Aqi: 42,
    pm25UgM3: 8.3,
  },
  {
    stationId: "demo-chicago",
    stationName: "Chicago — Com Ed",
    latitude: 41.8781,
    longitude: -87.6298,
    countryCode: "US",
    stateCode: "IL",
    pm25Aqi: 64,
    pm25UgM3: 17.2,
  },
  {
    stationId: "demo-dallas",
    stationName: "Dallas — Hinton",
    latitude: 32.7767,
    longitude: -96.797,
    countryCode: "US",
    stateCode: "TX",
    pm25Aqi: 71,
    pm25UgM3: 20.1,
  },
  {
    stationId: "demo-houston",
    stationName: "Houston — Clinton",
    latitude: 29.7604,
    longitude: -95.3698,
    countryCode: "US",
    stateCode: "TX",
    pm25Aqi: 89,
    pm25UgM3: 30.4,
  },
  {
    stationId: "demo-atlanta",
    stationName: "Atlanta — South DeKalb",
    latitude: 33.749,
    longitude: -84.388,
    countryCode: "US",
    stateCode: "GA",
    pm25Aqi: 58,
    pm25UgM3: 14.1,
  },
  {
    stationId: "demo-toronto",
    stationName: "Toronto — Downtown",
    latitude: 43.6532,
    longitude: -79.3832,
    countryCode: "CA",
    stateCode: "ON",
    pm25Aqi: 51,
    pm25UgM3: 12.2,
  },
  {
    stationId: "demo-new-york",
    stationName: "New York — Queens College",
    latitude: 40.7282,
    longitude: -73.7949,
    countryCode: "US",
    stateCode: "NY",
    pm25Aqi: 76,
    pm25UgM3: 22,
  },
  {
    stationId: "demo-mexico-city",
    stationName: "Mexico City — Centro",
    latitude: 19.4326,
    longitude: -99.1332,
    countryCode: "MX",
    stateCode: "CMX",
    pm25Aqi: 110,
    pm25UgM3: 40.2,
  },
] as const satisfies readonly DemoReadingSeed[];

/**
 * Creates clearly labeled synthetic readings for interface demonstration only.
 * Their relative timestamp prevents a demo deployment from rendering an empty
 * map under normal stale-data filtering; they must never be called live data.
 */
export function createDemoReadings(
  now: Date = new Date(),
): CurrentAirQualityReading[] {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("Demo reading time must be a valid date");
  }

  const observedAt = new Date(now);
  observedAt.setUTCMinutes(0, 0, 0);
  observedAt.setUTCHours(observedAt.getUTCHours() - 1);
  const observedAtIso = observedAt.toISOString();

  return DEMO_READING_SEEDS.map((seed) => ({
    stationId: seed.stationId,
    stationName: seed.stationName,
    latitude: seed.latitude,
    longitude: seed.longitude,
    countryCode: seed.countryCode,
    stateCode: seed.stateCode,
    reportingAreas: [],
    observedAt: observedAtIso,
    sourceAgency: "Illustrative demo fixture — not live AirNow data",
    pm25Aqi: seed.pm25Aqi,
    pm25UgM3: seed.pm25UgM3,
    aqiCategory: getAqiCategory(seed.pm25Aqi)?.id ?? null,
    projectedCigaretteEquivalentsPerDay:
      projectCigaretteEquivalentsPerDay(seed.pm25UgM3),
    freshness: classifyFreshness(observedAt, now),
    isPreliminary: false,
    dataMode: "demo",
  }));
}

/** Fixed fixture for deterministic tests and screenshots. */
export const DEMO_READINGS = createDemoReadings(
  new Date(DEMO_SNAPSHOT_GENERATED_AT),
);
