import { describe, expect, it } from "vitest";

import { fetchAirNowHourlyFile } from "@/lib/airnow/fetch";
import { getAirNowHourlyFile } from "@/lib/airnow/files";

const descriptor = getAirNowHourlyFile("2026-07-16T18:00:00Z");

describe("fetchAirNowHourlyFile", () => {
  it("returns source metadata alongside the body", async () => {
    const fetched = await fetchAirNowHourlyFile(descriptor, {
      now: () => new Date("2026-07-16T18:45:00Z"),
      fetchImpl: async (input, init) => {
        expect(input).toBe(descriptor.url);
        expect(init?.method).toBe("GET");
        return new Response("sample-body", {
          headers: {
            etag: '"abc123"',
            "last-modified": "Thu, 16 Jul 2026 18:40:00 GMT",
          },
        });
      },
    });

    expect(fetched).toMatchObject({
      descriptor,
      body: "sample-body",
      fetchedAt: "2026-07-16T18:45:00.000Z",
      etag: '"abc123"',
      lastModified: "Thu, 16 Jul 2026 18:40:00 GMT",
    });
  });

  it("throws a typed error for non-success responses", async () => {
    await expect(
      fetchAirNowHourlyFile(descriptor, {
        fetchImpl: async () => new Response("missing", { status: 404 }),
      }),
    ).rejects.toMatchObject({
      name: "AirNowHttpError",
      status: 404,
      descriptor,
    });
  });

  it("validates timeout configuration before fetching", async () => {
    await expect(
      fetchAirNowHourlyFile(descriptor, { timeoutMs: 0 }),
    ).rejects.toThrow(RangeError);
  });
});
