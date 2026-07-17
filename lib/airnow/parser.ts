import { parse } from "csv-parse/sync";

import {
  AIRNOW_HOURLY_FIELD_COUNT,
  type AirNowHourlyRecord,
  type AirNowParseIssue,
  type AirNowParseResult,
} from "./types";

type RowIssue = Omit<AirNowParseIssue, "rowNumber">;

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNullableNumber(
  value: string,
  field: string,
  issues: RowIssue[],
): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    issues.push({
      severity: "error",
      code: "invalid-number",
      field,
      message: `${field} is not a finite number`,
    });
    return null;
  }

  return parsed;
}

function parseMeasuredFlag(
  value: string,
  field: string,
  issues: RowIssue[],
): boolean | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  if (trimmed === "1") {
    return true;
  }
  if (trimmed === "0") {
    return false;
  }

  issues.push({
    severity: "error",
    code: "invalid-measured-flag",
    field,
    message: `${field} must be 0, 1, or empty`,
  });
  return null;
}

function parseObservedAt(dateValue: string, timeValue: string): string | null {
  const dateMatch = dateValue
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const timeMatch = timeValue.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const rawYear = Number(dateMatch[3]);
  const year = dateMatch[3].length === 2 ? 2_000 + rawYear : rawYear;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return date.toISOString();
}

export function isPm25MicrogramsPerCubicMeter(unit: string | null): boolean {
  if (!unit) {
    return false;
  }

  const normalized = unit
    .trim()
    .replace(/[µμ]/g, "U")
    .toUpperCase()
    .replace(/³/g, "3")
    .replace(/\^/g, "")
    .replace(/\s+/g, "");

  return normalized === "UG/M3";
}

function parseRow(row: string[], rowNumber: number): {
  record: AirNowHourlyRecord | null;
  issues: AirNowParseIssue[];
} {
  const rowIssues: RowIssue[] = [];
  if (row.length !== AIRNOW_HOURLY_FIELD_COUNT) {
    return {
      record: null,
      issues: [
        {
          rowNumber,
          severity: "error",
          code: "field-count",
          message: `Expected ${AIRNOW_HOURLY_FIELD_COUNT} fields but received ${row.length}`,
        },
      ],
    };
  }

  const stationId = row[0].trim();
  if (!stationId) {
    rowIssues.push({
      severity: "error",
      code: "missing-station-id",
      field: "AQSID",
      message: "AQSID is required",
    });
  }

  const latitude = parseNullableNumber(row[4], "Latitude", rowIssues);
  const longitude = parseNullableNumber(row[5], "Longitude", rowIssues);
  if (
    latitude == null ||
    longitude == null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    rowIssues.push({
      severity: "error",
      code: "invalid-coordinate",
      message: "Latitude or longitude is missing or outside its valid range",
    });
  }

  const observedAt = parseObservedAt(row[10], row[11]);
  if (!observedAt) {
    rowIssues.push({
      severity: "error",
      code: "invalid-timestamp",
      message: "ValidDate and ValidTime must form a valid UTC timestamp",
    });
  }

  const elevationMeters = parseNullableNumber(row[6], "Elevation", rowIssues);
  const gmtOffsetHours = parseNullableNumber(row[7], "GMTOffset", rowIssues);
  const ozoneAqi = parseNullableNumber(row[14], "OZONE_AQI", rowIssues);
  const pm10Aqi = parseNullableNumber(row[15], "PM10_AQI", rowIssues);
  const pm25Aqi = parseNullableNumber(row[16], "PM25_AQI", rowIssues);
  const no2Aqi = parseNullableNumber(row[17], "NO2_AQI", rowIssues);
  const ozoneMeasured = parseMeasuredFlag(row[18], "Ozone_Measured", rowIssues);
  const pm10Measured = parseMeasuredFlag(row[19], "PM10_Measured", rowIssues);
  const pm25Measured = parseMeasuredFlag(row[20], "PM25_Measured", rowIssues);
  const no2Measured = parseMeasuredFlag(row[21], "NO2_Measured", rowIssues);
  const pm25 = parseNullableNumber(row[22], "PM25", rowIssues);
  const pm25Unit = nullableText(row[23]);
  const ozone = parseNullableNumber(row[24], "OZONE", rowIssues);
  const no2 = parseNullableNumber(row[26], "NO2", rowIssues);
  const co = parseNullableNumber(row[28], "CO", rowIssues);
  const so2 = parseNullableNumber(row[30], "SO2", rowIssues);
  const pm10 = parseNullableNumber(row[32], "PM10", rowIssues);

  const pm25UgM3 = isPm25MicrogramsPerCubicMeter(pm25Unit) ? pm25 : null;
  if (pm25 != null && pm25UgM3 == null) {
    rowIssues.push({
      severity: "warning",
      code: "unsupported-pm25-unit",
      field: "PM25_Unit",
      message: `PM2.5 unit ${pm25Unit ?? "(missing)"} was preserved but not normalized`,
    });
  }

  const issues = rowIssues.map((issue) => ({ ...issue, rowNumber }));
  if (
    issues.some((issue) => issue.severity === "error") ||
    latitude == null ||
    longitude == null ||
    observedAt == null
  ) {
    return { record: null, issues };
  }

  return {
    record: {
      stationId,
      siteName: row[1].trim() || stationId,
      status: row[2].trim(),
      epaRegion: nullableText(row[3]),
      latitude,
      longitude,
      elevationMeters,
      gmtOffsetHours,
      countryCode: nullableText(row[8]),
      stateCode: nullableText(row[9]),
      observedAt,
      dataSource: nullableText(row[12]),
      reportingAreas: row[13]
        .split("|")
        .map((area) => area.trim())
        .filter(Boolean),
      ozoneAqi,
      pm10Aqi,
      pm25Aqi,
      no2Aqi,
      ozoneMeasured,
      pm10Measured,
      pm25Measured,
      no2Measured,
      pm25,
      pm25Unit,
      pm25UgM3,
      ozone,
      ozoneUnit: nullableText(row[25]),
      no2,
      no2Unit: nullableText(row[27]),
      co,
      coUnit: nullableText(row[29]),
      so2,
      so2Unit: nullableText(row[31]),
      pm10,
      pm10Unit: nullableText(row[33]),
    },
    issues,
  };
}

export function parseAirNowHourlyData(input: string): AirNowParseResult {
  let rows: string[][];

  try {
    rows = parse(input, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
  } catch (error) {
    return {
      records: [],
      issues: [
        {
          rowNumber: 0,
          severity: "error",
          code: "csv-syntax",
          message:
            error instanceof Error ? error.message : "Unable to parse AirNow CSV",
        },
      ],
      rowsSeen: 0,
      rowsAccepted: 0,
      rowsRejected: 0,
    };
  }

  const records: AirNowHourlyRecord[] = [];
  const issues: AirNowParseIssue[] = [];
  let rowsSeen = 0;
  let rowsRejected = 0;

  rows.forEach((row, index) => {
    // Some mirrors include the documented field-name row while the canonical
    // bulk files generally do not.
    if (index === 0 && row[0]?.trim().toUpperCase() === "AQSID") {
      return;
    }

    rowsSeen += 1;
    const parsed = parseRow(row, index + 1);
    issues.push(...parsed.issues);
    if (parsed.record) {
      records.push(parsed.record);
    } else {
      rowsRejected += 1;
    }
  });

  return {
    records,
    issues,
    rowsSeen,
    rowsAccepted: records.length,
    rowsRejected,
  };
}
