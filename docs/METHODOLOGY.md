# Methodology and interpretation

## What the app shows

Each monitor can expose two related but different measurements:

- **PM2.5 NowCast AQI** is the U.S. EPA scale supplied by AirNow. It combines multiple recent hours and is displayed unchanged.
- **Projected cigarette-equivalent rate** uses only the latest raw hourly PM2.5 concentration. It asks what the rough health-impact analogy would be if that outdoor concentration persisted for a full 24 hours.

The values can move differently because they use different inputs and time windows. The app never converts an AQI number into cigarettes.

## Current projected rate

Methodology version: `berkeley-earth-22-v1`

```text
projected cigarette-equivalents per day = PM2.5 concentration (µg/m³) / 22
```

Examples:

| PM2.5 concentration | Projected rate if unchanged for 24 hours |
| --- | --- |
| 0 µg/m³ | 0 cigarette-equivalents/day |
| 11 µg/m³ | 0.5 cigarette-equivalents/day |
| 22 µg/m³ | 1 cigarette-equivalent/day |
| 44 µg/m³ | 2 cigarette-equivalents/day |

If the raw PM2.5 concentration is missing or uses an unsupported unit, the estimate is **not available**. It is never inferred from AQI and never replaced with zero.

## Accumulated measured exposure

When persistent hourly history is available, the app can sum the measured intervals:

```text
interval equivalent = PM2.5 (µg/m³) × measured hours / (22 × 24)
```

Missing hours are not filled, interpolated, or extrapolated. A trailing summary reports the number of captured hours, completeness percentage, and longest missing gap alongside the accumulated analogy.

## What the comparison does not mean

This is a rough population-level health-impact analogy based on Berkeley Earth's 22 µg/m³ rule. It does **not** mean that someone smoked cigarettes, inhaled the same particle mass, or received a personal medical-risk score.

Personal exposure can differ substantially because of:

- time spent indoors and outdoors;
- indoor filtration and ventilation;
- physical activity and breathing rate;
- masks or respirators;
- distance from the monitor;
- local pollution sources and PM2.5 composition; and
- the coverage and completeness of hourly measurements.

The map is informational and is not medical advice. People should follow official local health guidance during smoke or pollution events.

## Freshness and preliminary data

- At most 2 hours old: **fresh**
- More than 2 and at most 6 hours old: **stale**
- More than 6 hours old: **expired** and hidden from the current map by default

AirNow's real-time observations are preliminary and may be revised. The collector reprocesses recent source files when scheduled collection is enabled. Observation time and fetch time remain separate; only the observation time is shown as the reading time.

## Sources

- [Berkeley Earth — Air Pollution and Cigarette Equivalence](https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/)
- [AirNow real-time data files](https://files.airnowtech.org/)
- [U.S. EPA Air Quality Index resources](https://www.airnow.gov/aqi/)

The detailed product decisions and acceptance criteria are recorded in [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md).
