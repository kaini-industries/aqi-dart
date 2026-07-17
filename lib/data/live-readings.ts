import {
  loadLatestAirNowReadings,
  type LatestAirNowReadingsResult,
} from "@/lib/airnow/live";
import { getServerEnvironment } from "@/lib/env";

const LIVE_CACHE_TTL_MS = 5 * 60 * 1_000;

interface CacheEntry {
  expiresAt: number;
  value: LatestAirNowReadingsResult;
}

let cache: CacheEntry | undefined;
let pending: Promise<LatestAirNowReadingsResult> | undefined;

/**
 * Keeps Hobby/no-database deployments from downloading the same large AirNow
 * file for every viewport request. This warm-instance cache complements the
 * public CDN cache set by the route.
 */
export async function getCachedLiveReadings(
  now: Date = new Date(),
): Promise<LatestAirNowReadingsResult> {
  const timestamp = now.getTime();
  if (cache && cache.expiresAt > timestamp) {
    return cache.value;
  }
  if (pending) {
    return pending;
  }

  const { AIRNOW_BASE_URL } = getServerEnvironment();
  pending = loadLatestAirNowReadings({
    now,
    baseUrl: AIRNOW_BASE_URL,
    lookbackFileCount: 3,
  })
    .then((value) => {
      cache = {
        expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      pending = undefined;
    });

  return pending;
}

export function clearLiveReadingsCache(): void {
  cache = undefined;
  pending = undefined;
}
