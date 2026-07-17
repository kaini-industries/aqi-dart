"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";

import { getAqiCategoryById } from "@/lib/domain/aqi";
import {
  categoryLabel,
  formatAqi,
  formatConcentration,
  formatEquivalent,
  formatLocation,
  formatObservationTime,
  formatRelativeTime,
} from "@/lib/ui/format";
import type {
  DisplayMode,
  ReadingFeature,
} from "@/lib/ui/types";

import styles from "./readings-list.module.css";

export interface ReadingsListProps {
  readings: readonly ReadingFeature[];
  selectedStationId?: string | null;
  onSelect: (reading: ReadingFeature) => void;
  displayMode: DisplayMode;
  isLoading?: boolean;
  errorMessage?: string | null;
}

const FRESHNESS_LABEL = {
  fresh: "Fresh",
  stale: "Stale",
  expired: "Older",
} as const;

const INITIAL_MONITOR_COUNT = 80;
const MONITOR_BATCH_SIZE = 80;

function rowStyle(reading: ReadingFeature): CSSProperties {
  const category = reading.properties.aqiCategory;
  return {
    "--row-category": category
      ? getAqiCategoryById(category).color
      : "#7e8178",
  } as CSSProperties;
}

function equivalentText(reading: ReadingFeature): string {
  const value = reading.properties.projectedCigaretteEquivalentsPerDay;
  return value != null && Number.isFinite(value)
    ? `≈${formatEquivalent(value)}`
    : "Not available";
}

function readingAriaLabel(reading: ReadingFeature): string {
  const { properties } = reading;
  const aqi =
    properties.pm25Aqi != null && Number.isFinite(properties.pm25Aqi)
      ? properties.pm25Aqi
      : "unavailable";
  const equivalent =
    properties.projectedCigaretteEquivalentsPerDay != null &&
    Number.isFinite(properties.projectedCigaretteEquivalentsPerDay)
      ? `${formatEquivalent(properties.projectedCigaretteEquivalentsPerDay)} cigarette-equivalents per day if this outdoor level persisted for 24 hours`
      : "cigarette-equivalent not available";

  return [
    `${properties.stationName}, ${formatLocation(properties)}`,
    `PM2.5 NowCast AQI ${aqi}, ${categoryLabel(properties.aqiCategory)}`,
    `Raw PM2.5 ${formatConcentration(properties.pm25UgM3)}`,
    equivalent,
    `Observed ${formatObservationTime(properties.observedAt)}`,
    FRESHNESS_LABEL[properties.freshness],
    properties.dataMode === "demo" ? "Illustrative demo data" : null,
  ]
    .filter(Boolean)
    .join(". ");
}

function LoadingRows() {
  return (
    <div className={styles.loadingRows} role="status" aria-live="polite">
      <span className={styles.srOnly}>Loading monitor readings</span>
      {[0, 1, 2, 3].map((index) => (
        <div className={styles.loadingRow} key={index} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function ReadingsList({
  readings,
  selectedStationId = null,
  onSelect,
  displayMode,
  isLoading = false,
  errorMessage = null,
}: ReadingsListProps) {
  const rawListId = useId();
  const rowsId = `monitor-readings-${rawListId.replaceAll(":", "")}`;
  const [visibleCount, setVisibleCount] = useState(INITIAL_MONITOR_COUNT);

  useEffect(() => {
    setVisibleCount(INITIAL_MONITOR_COUNT);
  }, [readings]);

  useEffect(() => {
    if (!selectedStationId) {
      return;
    }

    const selectedIndex = readings.findIndex(
      (reading) => reading.properties.stationId === selectedStationId,
    );
    if (selectedIndex < 0) {
      return;
    }

    const requiredBatch =
      Math.ceil((selectedIndex + 1) / MONITOR_BATCH_SIZE) * MONITOR_BATCH_SIZE;
    setVisibleCount((current) => Math.max(current, requiredBatch));
  }, [readings, selectedStationId]);

  const shownCount = Math.min(visibleCount, readings.length);
  const visibleReadings = readings.slice(0, shownCount);
  const remainingCount = Math.max(0, readings.length - shownCount);
  const nextBatchCount = Math.min(MONITOR_BATCH_SIZE, remainingCount);

  return (
    <section
      className={styles.list}
      aria-labelledby="readings-list-title"
      aria-busy={isLoading}
    >
      <header className={styles.listHeader}>
        <div>
          <p className={styles.eyebrow}>Non-map view</p>
          <h2 id="readings-list-title" className={styles.title}>
            Current monitors
          </h2>
        </div>
        <p className={styles.count} aria-live="polite">
          {shownCount === readings.length
            ? `${readings.length} ${readings.length === 1 ? "monitor" : "monitors"}`
            : `Showing ${shownCount} of ${readings.length}`}
        </p>
      </header>

      <p className={styles.listDescription}>
        Select any row for its source, observation time, and measured history.
        Color marks the official PM2.5 AQI category; the category is also written
        out.
      </p>

      {errorMessage ? (
        <div className={styles.errorState} role="alert">
          <strong>Readings could not be refreshed.</strong>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className={styles.columnHeadings} aria-hidden="true">
        <span>Monitor</span>
        <span>Observed</span>
        <span>PM2.5 AQI</span>
        <span>Raw PM2.5</span>
        <span>Eq. / day</span>
      </div>

      {isLoading ? <LoadingRows /> : null}

      {!isLoading && readings.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <span className={styles.emptyIndex} aria-hidden="true">
            00
          </span>
          <div>
            <h3>No PM2.5 monitors are available</h3>
            <p>
              An empty view does not imply clean air. Try the current readings
              again from the page notice, or consult your local air agency.
            </p>
          </div>
        </div>
      ) : null}

      {!isLoading && readings.length > 0 ? (
        <ol
          id={rowsId}
          className={styles.rows}
          aria-label={`Air-quality monitors, ${shownCount} of ${readings.length} shown`}
        >
          {visibleReadings.map((reading) => {
            const { properties } = reading;
            const isSelected = properties.stationId === selectedStationId;
            const equivalent = equivalentText(reading);

            return (
              <li key={properties.stationId} className={styles.rowItem}>
                <button
                  type="button"
                  className={styles.row}
                  style={rowStyle(reading)}
                  data-display-mode={displayMode}
                  data-freshness={properties.freshness}
                  aria-current={isSelected ? "true" : undefined}
                  aria-label={readingAriaLabel(reading)}
                  onClick={() => onSelect(reading)}
                >
                  <span className={styles.stationCell}>
                    <strong>{properties.stationName}</strong>
                    <span className={styles.stationMeta}>
                      {formatLocation(properties)}
                      <span aria-hidden="true"> · </span>
                      {FRESHNESS_LABEL[properties.freshness]}
                      {properties.dataMode === "demo" ? (
                        <>
                          <span aria-hidden="true"> · </span>
                          Demo data
                        </>
                      ) : null}
                    </span>
                  </span>

                  <span className={styles.observedCell}>
                    <span className={styles.mobileLabel}>Observed</span>
                    <time
                      dateTime={properties.observedAt}
                      title={formatObservationTime(properties.observedAt)}
                      suppressHydrationWarning
                    >
                      {formatRelativeTime(properties.observedAt)}
                    </time>
                  </span>

                  <span className={styles.aqiCell}>
                    <span className={styles.mobileLabel}>PM2.5 AQI</span>
                    <strong>{formatAqi(properties.pm25Aqi)}</strong>
                    <span className={styles.categoryText}>
                      <span className={styles.categorySwatch} aria-hidden="true" />
                      {categoryLabel(properties.aqiCategory)}
                    </span>
                  </span>

                  <span className={styles.concentrationCell}>
                    <span className={styles.mobileLabel}>Raw PM2.5</span>
                    <span>{formatConcentration(properties.pm25UgM3)}</span>
                  </span>

                  <span className={styles.equivalentCell}>
                    <span className={styles.mobileLabel}>Rough eq. / day</span>
                    <strong>{equivalent}</strong>
                    {equivalent !== "Not available" ? (
                      <span className={styles.dayAssumption}>
                        if held for 24h
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {!isLoading && remainingCount > 0 ? (
        <div className={styles.showMore}>
          <p>
            {shownCount} of {readings.length} monitors shown
          </p>
          <button
            type="button"
            className={styles.showMoreButton}
            aria-controls={rowsId}
            aria-label={`Show ${nextBatchCount} more monitors; ${shownCount} of ${readings.length} currently shown`}
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + MONITOR_BATCH_SIZE, readings.length),
              )
            }
          >
            Show {nextBatchCount} more monitors
          </button>
        </div>
      ) : null}
    </section>
  );
}
