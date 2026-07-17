import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

import {
  AirNowHttpError,
  fetchAirNowHourlyFile,
  parseAirNowHourlyData,
  type AirNowFileDescriptor,
  type AirNowHourlyRecord,
} from "@/lib/airnow";

import { getDatabase } from "./client";

const UPSERT_BATCH_SIZE = 300;

export type AirNowImportStatus =
  | "success"
  | "duplicate"
  | "locked"
  | "not-found"
  | "failed";

export interface AirNowImportResult {
  filename: string;
  observedHour: string;
  status: AirNowImportStatus;
  rowsSeen: number;
  rowsAccepted: number;
  rowsRejected: number;
  rowsChanged: number;
  warnings: number;
  message: string | null;
}

interface RawImportRow {
  id: string | number;
  rows_seen?: number | string;
  rows_accepted?: number | string;
  rows_rejected?: number | string;
  rows_changed?: number | string;
}

interface ChangedCountRow {
  changed: number | string;
}

interface SerializedRecord {
  ordinal: number;
  station_id: string;
  site_name: string;
  status: string;
  epa_region: string | null;
  latitude: number;
  longitude: number;
  country_code: string | null;
  state_code: string | null;
  reporting_area_name: string | null;
  observed_at: string;
  data_source: string | null;
  pm25_original_value: number | null;
  pm25_original_unit: string | null;
  pm25_ug_m3: number | null;
  pm25_aqi: number | null;
  pm10_aqi: number | null;
  ozone_aqi: number | null;
  no2_aqi: number | null;
  source_record_hash: string;
  data_quality_flags: string[];
  source_values: Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function serializeRecord(
  record: AirNowHourlyRecord,
  ordinal: number,
): SerializedRecord {
  const sourceValues = {
    elevationMeters: record.elevationMeters,
    gmtOffsetHours: record.gmtOffsetHours,
    ozone: record.ozone,
    ozoneUnit: record.ozoneUnit,
    no2: record.no2,
    no2Unit: record.no2Unit,
    co: record.co,
    coUnit: record.coUnit,
    so2: record.so2,
    so2Unit: record.so2Unit,
    pm10: record.pm10,
    pm10Unit: record.pm10Unit,
    ozoneMeasured: record.ozoneMeasured,
    pm10Measured: record.pm10Measured,
    pm25Measured: record.pm25Measured,
    no2Measured: record.no2Measured,
  };
  const hashPayload = JSON.stringify({
    stationId: record.stationId,
    observedAt: record.observedAt,
    pm25: record.pm25,
    pm25Unit: record.pm25Unit,
    pm25UgM3: record.pm25UgM3,
    pm25Aqi: record.pm25Aqi,
    pm10Aqi: record.pm10Aqi,
    ozoneAqi: record.ozoneAqi,
    no2Aqi: record.no2Aqi,
    dataSource: record.dataSource,
    sourceValues,
  });

  return {
    ordinal,
    station_id: record.stationId,
    site_name: record.siteName,
    status: record.status || "active",
    epa_region: record.epaRegion,
    latitude: record.latitude,
    longitude: record.longitude,
    country_code: record.countryCode,
    state_code: record.stateCode,
    reporting_area_name:
      record.reportingAreas.length > 0
        ? record.reportingAreas.join(" | ")
        : null,
    observed_at: record.observedAt,
    data_source: record.dataSource,
    pm25_original_value: record.pm25,
    pm25_original_unit: record.pm25Unit,
    pm25_ug_m3: record.pm25UgM3,
    pm25_aqi: record.pm25Aqi,
    pm10_aqi: record.pm10Aqi,
    ozone_aqi: record.ozoneAqi,
    no2_aqi: record.no2Aqi,
    source_record_hash: sha256(hashPayload),
    data_quality_flags:
      record.pm25 != null && record.pm25UgM3 == null
        ? ["unsupported-pm25-unit"]
        : [],
    source_values: sourceValues,
  };
}

async function beginRawImport(
  descriptor: AirNowFileDescriptor,
): Promise<string> {
  const sql = getDatabase();
  const result = await sql`
    INSERT INTO raw_imports (
      source,
      source_filename,
      source_url,
      expected_observed_at,
      result_status
    )
    VALUES (
      'airnow',
      ${descriptor.filename},
      ${descriptor.url},
      ${descriptor.observedHour},
      'started'
    )
    RETURNING id
  `;
  const row = (result as unknown as RawImportRow[])[0];
  if (!row) {
    throw new Error("Unable to create AirNow import record");
  }
  return String(row.id);
}

async function claimImportLease(
  descriptor: AirNowFileDescriptor,
  token: string,
): Promise<boolean> {
  const sql = getDatabase();
  const result = await sql`
    INSERT INTO ingestion_locks (lock_key, token, acquired_at, expires_at)
    VALUES (${`airnow:${descriptor.filename}`}, ${token}, now(), now() + interval '10 minutes')
    ON CONFLICT (lock_key) DO UPDATE
    SET
      token = EXCLUDED.token,
      acquired_at = EXCLUDED.acquired_at,
      expires_at = EXCLUDED.expires_at
    WHERE ingestion_locks.expires_at < now()
    RETURNING lock_key
  `;
  return (result as unknown as { lock_key: string }[]).length === 1;
}

async function releaseImportLease(
  descriptor: AirNowFileDescriptor,
  token: string,
): Promise<void> {
  const sql = getDatabase();
  await sql`
    DELETE FROM ingestion_locks
    WHERE lock_key = ${`airnow:${descriptor.filename}`}
      AND token = ${token}
  `;
}

async function findDuplicateImport(
  rawImportId: string,
  descriptor: AirNowFileDescriptor,
  checksum: string,
): Promise<RawImportRow | null> {
  const sql = getDatabase();
  const result = await sql`
    SELECT id, rows_seen, rows_accepted, rows_rejected, rows_changed
    FROM raw_imports
    WHERE source = 'airnow'
      AND source_filename = ${descriptor.filename}
      AND checksum_sha256 = ${checksum}
      AND result_status IN ('success', 'duplicate')
      AND id <> ${rawImportId}::bigint
    ORDER BY completed_at DESC
    LIMIT 1
  `;
  return (result as unknown as RawImportRow[])[0] ?? null;
}

async function markDuplicateImport(
  rawImportId: string,
  checksum: string,
  duplicate: RawImportRow,
): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE raw_imports
    SET
      completed_at = now(),
      http_status = 200,
      result_status = 'duplicate',
      checksum_sha256 = ${checksum},
      rows_seen = ${Number(duplicate.rows_seen ?? 0)},
      rows_accepted = ${Number(duplicate.rows_accepted ?? 0)},
      rows_rejected = ${Number(duplicate.rows_rejected ?? 0)},
      rows_changed = 0,
      error_summary = ${`Identical to raw import ${String(duplicate.id)}`}
    WHERE id = ${rawImportId}::bigint
  `;
}

async function upsertRecordBatch(
  rawImportId: string,
  records: readonly SerializedRecord[],
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  const sql = getDatabase();
  const serialized = JSON.stringify(records);
  const result = await sql`
    WITH input_rows AS (
      SELECT *
      FROM jsonb_to_recordset(${serialized}::jsonb) AS row_data (
        ordinal integer,
        station_id text,
        site_name text,
        status text,
        epa_region text,
        latitude double precision,
        longitude double precision,
        country_code text,
        state_code text,
        reporting_area_name text,
        observed_at timestamptz,
        data_source text,
        pm25_original_value double precision,
        pm25_original_unit text,
        pm25_ug_m3 double precision,
        pm25_aqi integer,
        pm10_aqi integer,
        ozone_aqi integer,
        no2_aqi integer,
        source_record_hash text,
        data_quality_flags jsonb,
        source_values jsonb
      )
    ),
    station_input AS (
      SELECT DISTINCT ON (station_id)
        station_id,
        site_name,
        status,
        epa_region,
        latitude,
        longitude,
        country_code,
        state_code,
        reporting_area_name,
        data_source,
        observed_at
      FROM input_rows
      ORDER BY station_id, observed_at DESC, ordinal DESC
    ),
    upserted_stations AS (
      INSERT INTO stations (
        source,
        source_station_id,
        name,
        latitude,
        longitude,
        country_code,
        state_code,
        epa_region,
        reporting_area_name,
        source_agency,
        status,
        last_seen_at
      )
      SELECT
        'airnow',
        station_id,
        site_name,
        latitude,
        longitude,
        country_code,
        state_code,
        epa_region,
        reporting_area_name,
        data_source,
        status,
        observed_at
      FROM station_input
      ON CONFLICT (source, source_station_id) DO UPDATE
      SET
        name = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.name ELSE stations.name END,
        latitude = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.latitude ELSE stations.latitude END,
        longitude = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.longitude ELSE stations.longitude END,
        country_code = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.country_code ELSE stations.country_code END,
        state_code = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.state_code ELSE stations.state_code END,
        epa_region = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.epa_region ELSE stations.epa_region END,
        reporting_area_name = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.reporting_area_name ELSE stations.reporting_area_name END,
        source_agency = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.source_agency ELSE stations.source_agency END,
        status = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN EXCLUDED.status ELSE stations.status END,
        last_seen_at = GREATEST(stations.last_seen_at, EXCLUDED.last_seen_at),
        updated_at = CASE WHEN EXCLUDED.last_seen_at >= stations.last_seen_at
          THEN now() ELSE stations.updated_at END
      RETURNING id, source_station_id
    ),
    observation_input AS (
      SELECT DISTINCT ON (station_id, observed_at) *
      FROM input_rows
      ORDER BY station_id, observed_at, ordinal DESC
    ),
    changed_observations AS (
      INSERT INTO observations (
        station_id,
        raw_import_id,
        observed_at,
        pm25_original_value,
        pm25_original_unit,
        pm25_ug_m3,
        pm25_aqi,
        pm10_aqi,
        ozone_aqi,
        no2_aqi,
        source_agency,
        is_preliminary,
        source_record_hash,
        data_quality_flags,
        source_values
      )
      SELECT
        station.id,
        ${rawImportId}::bigint,
        observation.observed_at,
        observation.pm25_original_value,
        observation.pm25_original_unit,
        observation.pm25_ug_m3,
        observation.pm25_aqi,
        observation.pm10_aqi,
        observation.ozone_aqi,
        observation.no2_aqi,
        observation.data_source,
        true,
        observation.source_record_hash,
        ARRAY(
          SELECT jsonb_array_elements_text(
            COALESCE(observation.data_quality_flags, '[]'::jsonb)
          )
        ),
        COALESCE(observation.source_values, '{}'::jsonb)
      FROM observation_input AS observation
      JOIN upserted_stations AS station
        ON station.source_station_id = observation.station_id
      ON CONFLICT (station_id, observed_at) DO UPDATE
      SET
        raw_import_id = EXCLUDED.raw_import_id,
        updated_at = now(),
        pm25_original_value = EXCLUDED.pm25_original_value,
        pm25_original_unit = EXCLUDED.pm25_original_unit,
        pm25_ug_m3 = EXCLUDED.pm25_ug_m3,
        pm25_aqi = EXCLUDED.pm25_aqi,
        pm10_aqi = EXCLUDED.pm10_aqi,
        ozone_aqi = EXCLUDED.ozone_aqi,
        no2_aqi = EXCLUDED.no2_aqi,
        source_agency = EXCLUDED.source_agency,
        is_preliminary = EXCLUDED.is_preliminary,
        source_record_hash = EXCLUDED.source_record_hash,
        data_quality_flags = EXCLUDED.data_quality_flags,
        source_values = EXCLUDED.source_values
      WHERE
        observations.source_record_hash IS DISTINCT FROM EXCLUDED.source_record_hash
        OR EXISTS (
          SELECT 1
          FROM raw_imports AS prior_import
          WHERE prior_import.id = observations.raw_import_id
            AND prior_import.result_status = 'failed'
        )
      RETURNING 1
    )
    SELECT count(*)::integer AS changed
    FROM changed_observations
  `;
  const row = (result as unknown as ChangedCountRow[])[0];
  return Number(row?.changed ?? 0);
}

async function completeRawImport(
  rawImportId: string,
  options: {
    checksum: string;
    compressedPayloadBase64: string;
    rowsSeen: number;
    rowsAccepted: number;
    rowsRejected: number;
    rowsChanged: number;
  },
): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE raw_imports
    SET
      completed_at = now(),
      http_status = 200,
      result_status = 'success',
      checksum_sha256 = ${options.checksum},
      content_type = 'application/gzip',
      raw_payload = decode(${options.compressedPayloadBase64}, 'base64'),
      rows_seen = ${options.rowsSeen},
      rows_accepted = ${options.rowsAccepted},
      rows_rejected = ${options.rowsRejected},
      rows_changed = ${options.rowsChanged},
      error_summary = NULL
    WHERE id = ${rawImportId}::bigint
  `;
}

async function failRawImport(
  rawImportId: string,
  httpStatus: number | null,
  message: string,
): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE raw_imports
    SET
      completed_at = now(),
      http_status = ${httpStatus},
      result_status = 'failed',
      error_summary = ${message.slice(0, 2_000)}
    WHERE id = ${rawImportId}::bigint
  `;
}

async function importClaimedAirNowFile(
  descriptor: AirNowFileDescriptor,
): Promise<AirNowImportResult> {
  const rawImportId = await beginRawImport(descriptor);

  try {
    const fetched = await fetchAirNowHourlyFile(descriptor);
    const checksum = sha256(fetched.body);
    const duplicate = await findDuplicateImport(
      rawImportId,
      descriptor,
      checksum,
    );
    if (duplicate) {
      await markDuplicateImport(rawImportId, checksum, duplicate);
      return {
        filename: descriptor.filename,
        observedHour: descriptor.observedHour,
        status: "duplicate",
        rowsSeen: Number(duplicate.rows_seen ?? 0),
        rowsAccepted: Number(duplicate.rows_accepted ?? 0),
        rowsRejected: Number(duplicate.rows_rejected ?? 0),
        rowsChanged: 0,
        warnings: 0,
        message: `Identical to raw import ${String(duplicate.id)}`,
      };
    }

    const parsed = parseAirNowHourlyData(fetched.body);
    if (parsed.rowsAccepted === 0) {
      throw new Error(
        `AirNow file ${descriptor.filename} contained zero valid records`,
      );
    }
    const serialized = parsed.records.map(serializeRecord);
    let rowsChanged = 0;
    for (let offset = 0; offset < serialized.length; offset += UPSERT_BATCH_SIZE) {
      rowsChanged += await upsertRecordBatch(
        rawImportId,
        serialized.slice(offset, offset + UPSERT_BATCH_SIZE),
      );
    }

    await completeRawImport(rawImportId, {
      checksum,
      compressedPayloadBase64: gzipSync(fetched.body).toString("base64"),
      rowsSeen: parsed.rowsSeen,
      rowsAccepted: parsed.rowsAccepted,
      rowsRejected: parsed.rowsRejected,
      rowsChanged,
    });

    return {
      filename: descriptor.filename,
      observedHour: descriptor.observedHour,
      status: "success",
      rowsSeen: parsed.rowsSeen,
      rowsAccepted: parsed.rowsAccepted,
      rowsRejected: parsed.rowsRejected,
      rowsChanged,
      warnings: parsed.issues.filter((issue) => issue.severity === "warning")
        .length,
      message: null,
    };
  } catch (error) {
    const httpStatus = error instanceof AirNowHttpError ? error.status : null;
    const message = error instanceof Error ? error.message : "Unknown import error";
    try {
      await failRawImport(rawImportId, httpStatus, message);
    } catch (recordError) {
      console.error("Unable to record failed AirNow import", recordError);
    }

    return {
      filename: descriptor.filename,
      observedHour: descriptor.observedHour,
      status: httpStatus === 404 ? "not-found" : "failed",
      rowsSeen: 0,
      rowsAccepted: 0,
      rowsRejected: 0,
      rowsChanged: 0,
      warnings: 0,
      message,
    };
  }
}

export async function importAirNowFile(
  descriptor: AirNowFileDescriptor,
): Promise<AirNowImportResult> {
  const token = randomUUID();
  const claimed = await claimImportLease(descriptor, token);
  if (!claimed) {
    return {
      filename: descriptor.filename,
      observedHour: descriptor.observedHour,
      status: "locked",
      rowsSeen: 0,
      rowsAccepted: 0,
      rowsRejected: 0,
      rowsChanged: 0,
      warnings: 0,
      message: "Another invocation is already importing this file",
    };
  }

  try {
    return await importClaimedAirNowFile(descriptor);
  } finally {
    try {
      await releaseImportLease(descriptor, token);
    } catch (error) {
      // The lease expires automatically, so a release failure must not turn a
      // completed idempotent import into a reported failure.
      console.error("Unable to release AirNow import lease", error);
    }
  }
}

export async function importAirNowFiles(
  descriptors: readonly AirNowFileDescriptor[],
  concurrency = 3,
): Promise<AirNowImportResult[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new RangeError("Import concurrency must be between 1 and 8");
  }

  const results = new Array<AirNowImportResult>(descriptors.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, descriptors.length) },
    async () => {
      while (nextIndex < descriptors.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await importAirNowFile(descriptors[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function pruneAirNowData(options: {
  rawPayloadRetentionDays?: number;
  observationRetentionDays?: number;
} = {}): Promise<{ rawPayloadsPruned: number; observationsPruned: number }> {
  // Defaults are deliberately sized for Neon's 0.5 GB Free allowance while
  // retaining the full seven-day history exposed by the public API.
  const rawPayloadRetentionDays = options.rawPayloadRetentionDays ?? 3;
  const observationRetentionDays = options.observationRetentionDays ?? 7;
  const sql = getDatabase();
  const rawResult = await sql`
    WITH pruned AS (
      UPDATE raw_imports
      SET raw_payload = NULL
      WHERE raw_payload IS NOT NULL
        AND fetched_at < now() - make_interval(days => ${rawPayloadRetentionDays})
      RETURNING 1
    )
    SELECT count(*)::integer AS changed FROM pruned
  `;
  const observationResult = await sql`
    WITH pruned AS (
      DELETE FROM observations
      WHERE observed_at < now() - make_interval(days => ${observationRetentionDays})
      RETURNING 1
    )
    SELECT count(*)::integer AS changed FROM pruned
  `;

  return {
    rawPayloadsPruned: Number(
      (rawResult as unknown as ChangedCountRow[])[0]?.changed ?? 0,
    ),
    observationsPruned: Number(
      (observationResult as unknown as ChangedCountRow[])[0]?.changed ?? 0,
    ),
  };
}
