export const AIRNOW_HOURLY_FIELD_COUNT = 34;

export interface AirNowHourlyRecord {
  stationId: string;
  siteName: string;
  status: string;
  epaRegion: string | null;
  latitude: number;
  longitude: number;
  elevationMeters: number | null;
  gmtOffsetHours: number | null;
  countryCode: string | null;
  stateCode: string | null;
  observedAt: string;
  dataSource: string | null;
  reportingAreas: readonly string[];
  ozoneAqi: number | null;
  pm10Aqi: number | null;
  pm25Aqi: number | null;
  no2Aqi: number | null;
  ozoneMeasured: boolean | null;
  pm10Measured: boolean | null;
  pm25Measured: boolean | null;
  no2Measured: boolean | null;
  pm25: number | null;
  pm25Unit: string | null;
  pm25UgM3: number | null;
  ozone: number | null;
  ozoneUnit: string | null;
  no2: number | null;
  no2Unit: string | null;
  co: number | null;
  coUnit: string | null;
  so2: number | null;
  so2Unit: string | null;
  pm10: number | null;
  pm10Unit: string | null;
}

export type AirNowParseIssueSeverity = "error" | "warning";

export interface AirNowParseIssue {
  rowNumber: number;
  severity: AirNowParseIssueSeverity;
  code:
    | "csv-syntax"
    | "field-count"
    | "missing-station-id"
    | "invalid-coordinate"
    | "invalid-timestamp"
    | "invalid-number"
    | "invalid-measured-flag"
    | "unsupported-pm25-unit";
  message: string;
  field?: string;
}

export interface AirNowParseResult {
  records: AirNowHourlyRecord[];
  issues: AirNowParseIssue[];
  rowsSeen: number;
  rowsAccepted: number;
  rowsRejected: number;
}

export interface AirNowFileDescriptor {
  observedHour: string;
  dateKey: string;
  hourKey: string;
  filename: string;
  url: string;
}

export interface AirNowFetchedFile {
  descriptor: AirNowFileDescriptor;
  body: string;
  fetchedAt: string;
  etag: string | null;
  lastModified: string | null;
}
