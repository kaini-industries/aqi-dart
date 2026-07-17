import { describe, expect, it } from "vitest";

import {
  isPm25MicrogramsPerCubicMeter,
  parseAirNowHourlyData,
} from "@/lib/airnow/parser";

import { makeAirNowRow, VALID_AIRNOW_FIELDS } from "./fixture";

describe("parseAirNowHourlyData", () => {
  it("parses the documented row shape and UTC timestamp", () => {
    const result = parseAirNowHourlyData(makeAirNowRow());

    expect(result).toMatchObject({
      rowsSeen: 1,
      rowsAccepted: 1,
      rowsRejected: 0,
      issues: [],
    });
    expect(result.records[0]).toMatchObject({
      stationId: "320030540",
      siteName: "Jerome Mack",
      latitude: 36.141875,
      longitude: -115.078742,
      observedAt: "2019-05-31T10:00:00.000Z",
      reportingAreas: ["Las Vegas", "Clark County"],
      pm25Aqi: 15,
      pm25: 3.7,
      pm25Unit: "UG/M3",
      pm25UgM3: 3.7,
      pm25Measured: true,
      dataSource: "Clark County Department of Air Quality",
    });
  });

  it("handles quoted commas in text fields", () => {
    const result = parseAirNowHourlyData(
      makeAirNowRow({
        1: "Station, North",
        12: "City, County & Tribal Air",
      }),
    );

    expect(result.records[0].siteName).toBe("Station, North");
    expect(result.records[0].dataSource).toBe("City, County & Tribal Air");
  });

  it("accepts an optional field-name header", () => {
    const header = ["AQSID", ...VALID_AIRNOW_FIELDS.slice(1)].join(",");
    const result = parseAirNowHourlyData(`${header}\n${makeAirNowRow()}`);
    expect(result.rowsSeen).toBe(1);
    expect(result.records).toHaveLength(1);
  });

  it("preserves negative raw PM2.5 and normalizes it without clamping", () => {
    const result = parseAirNowHourlyData(makeAirNowRow({ 22: "-3.4" }));
    expect(result.records[0]).toMatchObject({
      pm25: -3.4,
      pm25UgM3: -3.4,
    });
  });

  it("preserves an unsupported PM2.5 unit but does not normalize it", () => {
    const result = parseAirNowHourlyData(
      makeAirNowRow({ 22: "0.005", 23: "MG/M3" }),
    );

    expect(result.records[0]).toMatchObject({
      pm25: 0.005,
      pm25Unit: "MG/M3",
      pm25UgM3: null,
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "unsupported-pm25-unit",
      }),
    );
  });

  it.each(["UG/M3", "ug / m^3", "µg/m³", "μg/m3"])(
    "recognizes %s as micrograms per cubic metre",
    (unit) => {
      expect(isPm25MicrogramsPerCubicMeter(unit)).toBe(true);
    },
  );

  it("quarantines a malformed row without discarding a valid row", () => {
    const result = parseAirNowHourlyData(
      `${makeAirNowRow()}\n"too","few","fields"`,
    );

    expect(result).toMatchObject({
      rowsSeen: 2,
      rowsAccepted: 1,
      rowsRejected: 1,
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "field-count", rowNumber: 2 }),
    );
  });

  it.each([
    [{ 4: "91" }, "invalid-coordinate"],
    [{ 5: "-181" }, "invalid-coordinate"],
    [{ 10: "02/30/26" }, "invalid-timestamp"],
    [{ 11: "24:00" }, "invalid-timestamp"],
    [{ 16: "not-a-number" }, "invalid-number"],
    [{ 20: "yes" }, "invalid-measured-flag"],
  ] as const)("rejects invalid source fields with %s", (overrides, code) => {
    const result = parseAirNowHourlyData(makeAirNowRow(overrides));
    expect(result.records).toHaveLength(0);
    expect(result.rowsRejected).toBe(1);
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  });

  it("allows genuinely missing pollutant fields", () => {
    const result = parseAirNowHourlyData(
      makeAirNowRow({
        14: "",
        15: "",
        16: "",
        17: "",
        18: "0",
        19: "0",
        20: "0",
        21: "0",
        22: "",
        23: "",
      }),
    );

    expect(result.records[0]).toMatchObject({
      pm25Aqi: null,
      pm25: null,
      pm25UgM3: null,
      pm25Measured: false,
    });
    expect(result.issues).toHaveLength(0);
  });

  it("returns a structured issue for unrecoverable CSV syntax", () => {
    const result = parseAirNowHourlyData('"unterminated');
    expect(result.records).toEqual([]);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "csv-syntax",
      rowNumber: 0,
    });
  });
});
