import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentReadingsMock } = vi.hoisted(() => ({
  getCurrentReadingsMock: vi.fn(),
}));

vi.mock("@/lib/data/readings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/readings")>()),
  getCurrentReadings: getCurrentReadingsMock,
}));

import { GET } from "@/app/api/v1/readings/route";

beforeEach(() => {
  getCurrentReadingsMock.mockResolvedValue({
    dataMode: "demo",
    sourceFile: null,
    fallbackReason: "AirNow was unavailable",
    truncated: false,
    readings: [
      {
        stationId: "demo-station",
        stationName: "Demonstration station",
        latitude: 40,
        longitude: -90,
        countryCode: "US",
        stateCode: "IL",
        reportingAreas: [],
        observedAt: "2026-07-16T18:00:00.000Z",
        sourceAgency: "Illustrative demo fixture",
        pm25Aqi: 51,
        pm25UgM3: 12,
        aqiCategory: "moderate",
        projectedCigaretteEquivalentsPerDay: 12 / 22,
        freshness: "fresh",
        isPreliminary: false,
        dataMode: "demo",
      },
    ],
  });
});

describe("GET /api/v1/readings", () => {
  it("returns slim GeoJSON and preserves the demo fallback label", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/readings"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/geo+json",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(response.headers.get("x-data-mode")).toBe("demo");
    expect(body.type).toBe("FeatureCollection");
    expect(body.meta.dataMode).toBe("demo");
    expect(body.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [-90, 40] },
      properties: { stationId: "demo-station", dataMode: "demo" },
    });
  });

  it("honors a matching conditional ETag", async () => {
    const first = await GET(
      new Request("https://example.test/api/v1/readings"),
    );
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await GET(
      new Request("https://example.test/api/v1/readings", {
        headers: { "if-none-match": etag! },
      }),
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });
});
