"use client";

import type { CSSProperties } from "react";

import {
  getAqiCategoryById,
  type AqiCategoryId,
} from "@/lib/domain/aqi";
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
  ReadingFeature,
  StationHistoryResponse,
} from "@/lib/ui/types";

import { HistorySparkline } from "./history-sparkline";
import styles from "./station-panel.module.css";

export type HistoryStatus = "idle" | "loading" | "success" | "error";

export interface StationPanelProps {
  reading: ReadingFeature | null;
  history?: StationHistoryResponse | null;
  historyStatus?: HistoryStatus;
  historyError?: string | null;
  onRetryHistory?: () => void;
  onClose?: () => void;
}

const FRESHNESS_LABEL = {
  fresh: "Fresh reading",
  stale: "Stale reading",
  expired: "Older reading",
} as const;

const AQI_GUIDANCE: Record<AqiCategoryId, string> = {
  good: "Air quality is generally satisfactory.",
  moderate:
    "Air quality is acceptable; unusually sensitive people may notice effects.",
  "unhealthy-for-sensitive-groups":
    "Sensitive groups have a greater chance of experiencing health effects.",
  unhealthy:
    "Health effects are possible for everyone and may be more serious for sensitive groups.",
  "very-unhealthy":
    "Health effects are more likely for everyone at this category.",
  hazardous:
    "This category carries a higher risk of serious health effects for everyone.",
};

function categoryGuidance(category: AqiCategoryId | null): string {
  return category
    ? AQI_GUIDANCE[category]
    : "Health guidance is unavailable without a source-supplied PM2.5 AQI category.";
}

function categoryStyle(reading: ReadingFeature): CSSProperties {
  const category = reading.properties.aqiCategory;
  const color = category ? getAqiCategoryById(category).color : "#7e8178";
  return { "--category-color": color } as CSSProperties;
}

function dataModeLabel(reading: ReadingFeature): string {
  switch (reading.properties.dataMode) {
    case "demo":
      return "Illustrative demo data";
    case "database":
      return "Stored AirNow observation";
    case "live":
      return "Current AirNow feed";
  }
}

function HistoryLoading() {
  return (
    <div className={styles.historyState} role="status" aria-live="polite">
      <span className={styles.stateKicker}>Past 24 hours</span>
      <p className={styles.stateTitle}>Loading measured history…</p>
      <div className={styles.historySkeleton} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function HistoryContent({ history }: { history: StationHistoryResponse }) {
  if (!history.meta.persistentHistoryAvailable) {
    return (
      <div className={styles.historyState} role="note">
        <span className={styles.stateKicker}>Past 24 hours</span>
        <p className={styles.stateTitle}>Measured history is not stored here</p>
        <p>
          This {history.meta.dataMode} source provides a current observation but
          no persistent hourly archive. An accumulated equivalent is not
          estimated from a single reading.
        </p>
      </div>
    );
  }

  const { summary } = history;
  const measuredPoints = history.series.filter(
    (point) =>
      !point.isGap &&
      point.pm25UgM3 != null &&
      Number.isFinite(point.pm25UgM3),
  );
  const hasAccumulatedEquivalent =
    summary.cigaretteEquivalents != null &&
    Number.isFinite(summary.cigaretteEquivalents);
  const equivalent = hasAccumulatedEquivalent
    ? `≈${formatEquivalent(summary.cigaretteEquivalents)}`
    : "Not available";
  const completeness = Math.max(
    0,
    Math.min(100, Math.round(summary.completenessPercent)),
  );

  return (
    <div className={styles.historyContent}>
      <div className={styles.sectionHeadingRow}>
        <div>
          <span className={styles.stateKicker}>Past 24 hours</span>
          <h3 className={styles.sectionTitle}>Measured PM2.5 history</h3>
        </div>
        <span className={styles.completenessText}>{completeness}% captured</span>
      </div>

      {measuredPoints.length > 0 ? (
        <HistorySparkline points={history.series} />
      ) : (
        <p className={styles.noChart}>
          No measured hourly PM2.5 values are available for this window.
        </p>
      )}

      <div className={styles.accumulatedReading}>
        <span className={styles.metricLabel}>
          Captured measured equivalent in this {summary.expectedHours}-hour
          window
        </span>
        <div className={styles.accumulatedValueRow}>
          <strong className={styles.accumulatedValue}>{equivalent}</strong>
          {hasAccumulatedEquivalent ? (
            <span className={styles.accumulatedUnit}>
              cigarette-equivalents
            </span>
          ) : null}
        </div>
        <p className={styles.historyQualifier}>
          {summary.capturedHours} of {summary.expectedHours} hours captured;{" "}
          {summary.isComplete
            ? "meets the display-completeness threshold"
            : "does not meet the display-completeness threshold"}
          ; missing hours were not filled or scaled.
        </p>
      </div>

      <div className={styles.completenessBlock}>
        <div className={styles.completenessLabels}>
          <span>Hourly coverage</span>
          <span>
            {summary.distinctHourlyReadings}/{summary.expectedHours}
          </span>
        </div>
        <progress
          className={styles.completenessProgress}
          max={summary.expectedHours}
          value={summary.distinctHourlyReadings}
          aria-label={`${summary.distinctHourlyReadings} of ${summary.expectedHours} hourly readings captured`}
        />
        <p className={styles.gapNote}>
          {summary.longestMissingGapHours > 0
            ? `Longest missing gap: ${summary.longestMissingGapHours} ${summary.longestMissingGapHours === 1 ? "hour" : "hours"}.`
            : "No hourly gaps in this window."}{" "}
          The display-completeness threshold needs at least 20 readings and no
          gap longer than three hours.
        </p>
      </div>
    </div>
  );
}

function HistorySection({
  history,
  status,
  error,
  onRetry,
}: {
  history: StationHistoryResponse | null | undefined;
  status: HistoryStatus;
  error: string | null | undefined;
  onRetry: (() => void) | undefined;
}) {
  if (status === "loading") {
    return <HistoryLoading />;
  }

  if (status === "error") {
    return (
      <div className={styles.historyState} role="status">
        <span className={styles.stateKicker}>Past 24 hours</span>
        <p className={styles.stateTitle}>History is temporarily unavailable</p>
        <p>
          The current observation above is still usable. No accumulated value
          is being inferred while history is unavailable.
        </p>
        {error ? <p className={styles.errorDetail}>{error}</p> : null}
        {onRetry ? (
          <button
            className={styles.historyRetry}
            type="button"
            onClick={onRetry}
          >
            Try history again
          </button>
        ) : null}
      </div>
    );
  }

  if (status === "success" && history) {
    return <HistoryContent history={history} />;
  }

  if (status === "success") {
    return (
      <div className={styles.historyState} role="status">
        <span className={styles.stateKicker}>Past 24 hours</span>
        <p className={styles.stateTitle}>No history was returned</p>
        <p>No accumulated equivalent is available for this monitor.</p>
      </div>
    );
  }

  return (
    <div className={styles.historyState} role="status">
      <span className={styles.stateKicker}>Past 24 hours</span>
      <p className={styles.stateTitle}>History has not been requested</p>
      <p>The current reading does not stand in for a full day.</p>
    </div>
  );
}

export function StationPanel({
  reading,
  history,
  historyStatus = "idle",
  historyError,
  onRetryHistory,
  onClose,
}: StationPanelProps) {
  if (!reading) {
    return (
      <aside className={styles.panel} aria-labelledby="station-panel-empty-title">
        <div className={styles.emptyState}>
          <span className={styles.emptyIndex} aria-hidden="true">
            01
          </span>
          <div>
            <p className={styles.eyebrow}>Field note</p>
            <h2 id="station-panel-empty-title" className={styles.emptyTitle}>
              Choose a monitor
            </h2>
            <p className={styles.emptyCopy}>
              Select a point on the map or a row in the readings list to inspect
              its measured PM2.5, observation time, and rough air-pollution
              equivalent.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const { properties } = reading;
  const hasProjectedEquivalent =
    properties.projectedCigaretteEquivalentsPerDay != null &&
    Number.isFinite(properties.projectedCigaretteEquivalentsPerDay);
  const projectedEquivalent = hasProjectedEquivalent
    ? `≈${formatEquivalent(properties.projectedCigaretteEquivalentsPerDay)}`
    : "Not available";
  const localObservationTime = formatObservationTime(properties.observedAt);
  const utcObservationTime = formatObservationTime(properties.observedAt, {
    timeZone: "UTC",
    timeZoneName: "short",
  });

  return (
    <aside
      className={styles.panel}
      aria-labelledby="station-panel-title"
      style={categoryStyle(reading)}
    >
      <header className={styles.header}>
        <div className={styles.headerTopline}>
          <div className={styles.statusLine}>
            <span className={styles.eyebrow}>Selected monitor</span>
            <span
              className={styles.freshness}
              data-freshness={properties.freshness}
            >
              {FRESHNESS_LABEL[properties.freshness]}
            </span>
          </div>
          {onClose ? (
            <button
              className={styles.closeButton}
              type="button"
              onClick={onClose}
              aria-label={`Close details for ${properties.stationName}`}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
        <h2 id="station-panel-title" className={styles.stationName}>
          {properties.stationName}
        </h2>
        <p className={styles.location}>{formatLocation(properties)}</p>
        {properties.dataMode === "demo" ? (
          <p className={styles.demoNotice}>
            Illustrative fixture — not a live air-quality reading
          </p>
        ) : null}
      </header>

      <section className={styles.readingStrip} aria-label="Current monitor reading">
        <div className={styles.aqiReading}>
          <span className={styles.metricLabel}>PM2.5 NowCast AQI</span>
          <div className={styles.aqiValueRow}>
            <strong className={styles.aqiValue}>{formatAqi(properties.pm25Aqi)}</strong>
            <span className={styles.categoryLabel}>
              <span className={styles.categorySwatch} aria-hidden="true" />
              {categoryLabel(properties.aqiCategory)}
            </span>
          </div>
          <p className={styles.categoryGuidance}>
            {categoryGuidance(properties.aqiCategory)}
          </p>
          <span className={styles.metricFootnote}>U.S. EPA scale</span>
        </div>

        <div className={styles.rawReading}>
          <span className={styles.metricLabel}>Latest raw hourly PM2.5</span>
          <strong className={styles.rawValue}>
            {formatConcentration(properties.pm25UgM3)}
          </strong>
          <span className={styles.metricFootnote}>Source measurement</span>
        </div>

        <div className={styles.equivalentReading}>
          <span className={styles.metricLabel}>Rough air-pollution equivalent</span>
          <div className={styles.equivalentValueRow}>
            <strong className={styles.equivalentValue}>{projectedEquivalent}</strong>
            {hasProjectedEquivalent ? (
              <span className={styles.equivalentUnit}>
                cigarette-equivalents/day
              </span>
            ) : null}
          </div>
          <p className={styles.persistenceNote}>
            If this outdoor PM2.5 level persisted for 24 hours.
          </p>
        </div>
      </section>

      <p className={styles.measurementNote}>
        AQI is AirNow’s multi-hour NowCast. The projected equivalent uses the
        latest raw hourly PM2.5 value, so the two can move differently.
      </p>

      {properties.pm25UgM3 != null && properties.pm25UgM3 < 0 ? (
        <p className={styles.instrumentNote} role="note">
          The provider reported a negative instrument reading. It is preserved
          above and treated as zero only in the derived analogy.
        </p>
      ) : null}

      <section className={styles.historySection} aria-label="Measured history">
        <HistorySection
          history={history}
          status={historyStatus}
          error={historyError}
          onRetry={onRetryHistory}
        />
      </section>

      <section className={styles.provenance} aria-labelledby="provenance-title">
        <div className={styles.sectionHeadingRow}>
          <div>
            <span className={styles.stateKicker}>Evidence</span>
            <h3 id="provenance-title" className={styles.sectionTitle}>
              Time and source
            </h3>
          </div>
        </div>
        <dl className={styles.metadata}>
          <div>
            <dt>Observed locally</dt>
            <dd>
              <time dateTime={properties.observedAt}>{localObservationTime}</time>
              <span className={styles.relativeTime} suppressHydrationWarning>
                {formatRelativeTime(properties.observedAt)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Observed in UTC</dt>
            <dd>
              <time dateTime={properties.observedAt}>{utcObservationTime}</time>
            </dd>
          </div>
          <div>
            <dt>Reporting agency</dt>
            <dd>{properties.sourceAgency || "Agency not supplied"}</dd>
          </div>
          <div>
            <dt>Data status</dt>
            <dd>
              {properties.isPreliminary
                ? "Preliminary source data"
                : properties.dataMode === "demo"
                  ? "Illustrative demo fixture"
                  : "Not marked preliminary"}
            </dd>
          </div>
          <div>
            <dt>Source path</dt>
            <dd>{dataModeLabel(reading)}</dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{properties.methodologyVersion}</dd>
          </div>
        </dl>
        {properties.isPreliminary ? (
          <p className={styles.preliminaryNotice}>
            AirNow observations are preliminary and may be revised after quality
            review.
          </p>
        ) : null}
      </section>
    </aside>
  );
}
