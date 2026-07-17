-- Air Equivalent database bootstrap.
--
-- This schema intentionally uses standard PostgreSQL types and indexes so it
-- works on Neon without enabling PostGIS. Coordinates remain independently
-- queryable with ordinary latitude/longitude range predicates.

BEGIN;

CREATE TABLE IF NOT EXISTS stations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL DEFAULT 'airnow',
  source_station_id text NOT NULL,
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  country_code text,
  state_code text,
  epa_region text,
  reporting_area_name text,
  reporting_area_state text,
  source_agency text,
  status text NOT NULL DEFAULT 'active',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stations_source_identity_unique
    UNIQUE (source, source_station_id),
  CONSTRAINT stations_latitude_valid
    CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT stations_longitude_valid
    CHECK (longitude >= -180 AND longitude <= 180)
);

CREATE TABLE IF NOT EXISTS raw_imports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL DEFAULT 'airnow',
  source_filename text NOT NULL,
  source_url text NOT NULL,
  expected_observed_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  http_status integer,
  result_status text NOT NULL DEFAULT 'started',
  checksum_sha256 text,
  parser_version text NOT NULL DEFAULT 'airnow-hourly-v1',
  content_type text,
  raw_payload bytea,
  raw_object_url text,
  rows_seen integer NOT NULL DEFAULT 0,
  rows_accepted integer NOT NULL DEFAULT 0,
  rows_rejected integer NOT NULL DEFAULT 0,
  rows_changed integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_imports_http_status_valid
    CHECK (http_status IS NULL OR (http_status >= 100 AND http_status <= 599)),
  CONSTRAINT raw_imports_row_counts_nonnegative
    CHECK (
      rows_seen >= 0
      AND rows_accepted >= 0
      AND rows_rejected >= 0
      AND rows_changed >= 0
    )
);

-- A short database-backed lease prevents overlapping serverless invocations
-- from importing the same source file concurrently. Expiry makes the lock
-- self-healing if a function is terminated before cleanup.
CREATE TABLE IF NOT EXISTS ingestion_locks (
  lock_key text PRIMARY KEY,
  token text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT ingestion_locks_expiry_valid
    CHECK (expires_at > acquired_at)
);

CREATE INDEX IF NOT EXISTS ingestion_locks_expiry_idx
  ON ingestion_locks (expires_at);

CREATE TABLE IF NOT EXISTS observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  station_id bigint NOT NULL
    REFERENCES stations (id) ON DELETE CASCADE,
  raw_import_id bigint
    REFERENCES raw_imports (id) ON DELETE SET NULL,
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  pm25_original_value double precision,
  pm25_original_unit text,
  pm25_ug_m3 double precision,
  pm25_nowcast_ug_m3 double precision,
  pm25_aqi integer,
  pm10_aqi integer,
  ozone_aqi integer,
  no2_aqi integer,
  source_agency text,
  is_preliminary boolean NOT NULL DEFAULT true,
  source_record_hash text NOT NULL,
  data_quality_flags text[] NOT NULL DEFAULT '{}'::text[],
  source_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT observations_station_hour_unique
    UNIQUE (station_id, observed_at)
);

CREATE INDEX IF NOT EXISTS stations_coordinates_idx
  ON stations (latitude, longitude);

CREATE INDEX IF NOT EXISTS stations_country_state_idx
  ON stations (country_code, state_code);

CREATE INDEX IF NOT EXISTS stations_last_seen_idx
  ON stations (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS raw_imports_expected_observed_idx
  ON raw_imports (expected_observed_at DESC);

CREATE INDEX IF NOT EXISTS raw_imports_status_idx
  ON raw_imports (result_status, fetched_at DESC);

CREATE INDEX IF NOT EXISTS raw_imports_content_idx
  ON raw_imports (source, source_filename, checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS observations_observed_at_idx
  ON observations (observed_at DESC);

CREATE INDEX IF NOT EXISTS observations_station_history_idx
  ON observations (station_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS observations_current_pm25_idx
  ON observations (observed_at DESC, station_id)
  WHERE pm25_ug_m3 IS NOT NULL OR pm25_aqi IS NOT NULL;

CREATE OR REPLACE VIEW latest_station_observations AS
SELECT DISTINCT ON (o.station_id)
  o.id AS observation_id,
  o.station_id,
  o.raw_import_id,
  o.observed_at,
  o.ingested_at,
  o.updated_at,
  o.pm25_original_value,
  o.pm25_original_unit,
  o.pm25_ug_m3,
  o.pm25_nowcast_ug_m3,
  o.pm25_aqi,
  o.pm10_aqi,
  o.ozone_aqi,
  o.no2_aqi,
  o.source_agency,
  o.is_preliminary,
  o.source_record_hash,
  o.data_quality_flags
FROM observations AS o
ORDER BY o.station_id, o.observed_at DESC, o.updated_at DESC;

COMMIT;
