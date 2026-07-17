"use client";

import { useId } from "react";

import type { HistorySeriesPoint } from "@/lib/ui/types";

import styles from "./station-panel.module.css";

interface HistorySparklineProps {
  points: readonly HistorySeriesPoint[];
}

const WIDTH = 320;
const HEIGHT = 112;
const PLOT_LEFT = 8;
const PLOT_RIGHT = 312;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 82;

function isMeasuredPoint(
  point: HistorySeriesPoint,
): point is HistorySeriesPoint & { pm25UgM3: number } {
  return (
    !point.isGap &&
    point.pm25UgM3 != null &&
    Number.isFinite(point.pm25UgM3)
  );
}

function timeLabel(iso: string | undefined): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function concentrationLabel(value: number): string {
  if (value > 0 && value < 0.1) {
    return "<0.1";
  }
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

function concentrationDescription(value: number): string {
  return value > 0 && value < 0.1
    ? "less than 0.1"
    : concentrationLabel(value);
}

/**
 * A deliberately small, non-interpolating history plot. Missing observations
 * break the line instead of being visually filled in.
 */
export function HistorySparkline({ points }: HistorySparklineProps) {
  const rawId = useId();
  const id = rawId.replaceAll(":", "");
  const titleId = `history-title-${id}`;
  const descriptionId = `history-description-${id}`;
  const measured = points.filter(isMeasuredPoint);
  const dataMaximum = Math.max(
    0,
    ...measured.map((point) => Math.max(0, point.pm25UgM3)),
  );
  const plotMaximum = Math.max(1, dataMaximum);
  const gapCount = points.filter((point) => point.isGap).length;

  const xAt = (index: number) => {
    if (points.length <= 1) {
      return (PLOT_LEFT + PLOT_RIGHT) / 2;
    }
    return PLOT_LEFT + (index / (points.length - 1)) * (PLOT_RIGHT - PLOT_LEFT);
  };
  const yAt = (value: number) =>
    PLOT_BOTTOM -
    (Math.max(0, value) / plotMaximum) * (PLOT_BOTTOM - PLOT_TOP);

  const segments: string[] = [];
  let activeSegment: string[] = [];

  points.forEach((point, index) => {
    if (!isMeasuredPoint(point)) {
      if (activeSegment.length > 0) {
        segments.push(activeSegment.join(" "));
        activeSegment = [];
      }
      return;
    }

    const command = activeSegment.length === 0 ? "M" : "L";
    activeSegment.push(
      `${command} ${xAt(index).toFixed(2)} ${yAt(point.pm25UgM3).toFixed(2)}`,
    );
  });

  if (activeSegment.length > 0) {
    segments.push(activeSegment.join(" "));
  }

  const first = points[0]?.observedAt;
  const last = points.at(-1)?.observedAt;
  const description = `${measured.length} measured hourly PM2.5 readings. Data maximum ${concentrationDescription(dataMaximum)} micrograms per cubic meter. ${gapCount === 0 ? "No missing hourly slots." : `${gapCount} missing hourly ${gapCount === 1 ? "slot" : "slots"}; the line breaks at gaps.`}`;

  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>Hourly PM2.5 over the requested window</title>
      <desc id={descriptionId}>{description}</desc>

      <line
        className={styles.sparklineGuide}
        x1={PLOT_LEFT}
        x2={PLOT_RIGHT}
        y1={PLOT_TOP}
        y2={PLOT_TOP}
      />
      <line
        className={styles.sparklineBaseline}
        x1={PLOT_LEFT}
        x2={PLOT_RIGHT}
        y1={PLOT_BOTTOM}
        y2={PLOT_BOTTOM}
      />

      {points.map((point, index) =>
        point.isGap ? (
          <line
            // Timestamps are unique hourly slots in the API series.
            key={point.observedAt}
            className={styles.sparklineGap}
            x1={xAt(index)}
            x2={xAt(index)}
            y1={PLOT_BOTTOM - 5}
            y2={PLOT_BOTTOM + 4}
          />
        ) : null,
      )}

      {segments.map((path, index) => (
        <path
          // Segments are derived in stable series order.
          key={`${index}-${path.slice(0, 12)}`}
          className={styles.sparklinePath}
          d={path}
        />
      ))}

      {points.map((point, index) =>
        isMeasuredPoint(point) ? (
          <circle
            key={point.observedAt}
            className={styles.sparklinePoint}
            cx={xAt(index)}
            cy={yAt(point.pm25UgM3)}
            r="1.8"
          />
        ) : null,
      )}

      <text className={styles.sparklineMaximum} x={PLOT_LEFT} y={PLOT_TOP + 10}>
        Data max {concentrationLabel(dataMaximum)} µg/m³
      </text>
      <text className={styles.sparklineTime} x={PLOT_LEFT} y="105">
        {timeLabel(first)}
      </text>
      <text
        className={styles.sparklineTime}
        x={PLOT_RIGHT}
        y="105"
        textAnchor="end"
      >
        {timeLabel(last)}
      </text>
    </svg>
  );
}
