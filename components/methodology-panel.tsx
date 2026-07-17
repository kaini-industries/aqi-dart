"use client";

import styles from "./methodology-panel.module.css";

export interface MethodologyPanelProps {
  onClose?: () => void;
  compact?: boolean;
  id?: string;
}

export function MethodologyPanel({
  onClose,
  compact = false,
  id = "methodology-panel",
}: MethodologyPanelProps) {
  const titleId = `${id}-title`;

  return (
    <aside
      id={id}
      className={styles.panel}
      data-compact={compact || undefined}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Method note · v1</p>
          <h2 id={titleId} className={styles.title}>
            How the estimate works
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close methodology"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </header>

      <p className={styles.lede}>
        This is a rough health-impact analogy based on Berkeley Earth’s 22
        µg/m³ rule. It does not mean you smoked cigarettes, and it is not a
        personal exposure or medical-risk estimate.
      </p>

      <section className={styles.section} aria-labelledby={`${id}-current`}>
        <p className={styles.sectionIndex}>01 · Current projection</p>
        <h3 id={`${id}-current`} className={styles.sectionTitle}>
          One measured hour, stated as a condition
        </h3>
        <p className={styles.sectionCopy}>
          The current number starts with the monitor’s latest raw hourly PM2.5
          concentration. It is not calculated from AQI.
        </p>
        <div
          className={styles.formula}
          role="img"
          aria-label="Projected cigarette-equivalents per day equals the latest hourly PM2.5 concentration in micrograms per cubic meter divided by 22"
        >
          <span>
            <small>Latest hourly PM2.5</small>
            <strong>µg/m³</strong>
          </span>
          <b aria-hidden="true">÷</b>
          <span>
            <small>Comparison factor</small>
            <strong>22</strong>
          </span>
          <b aria-hidden="true">=</b>
          <span>
            <small>Projected rate</small>
            <strong>eq. / day</strong>
          </span>
        </div>
        <p className={styles.condition}>
          Every current result means: “if this outdoor level persisted for 24
          hours.” It is a projected rate, not a record of what someone consumed.
        </p>
      </section>

      <div className={styles.explainerGrid}>
        <section className={styles.section} aria-labelledby={`${id}-aqi`}>
          <p className={styles.sectionIndex}>02 · Why the numbers differ</p>
          <h3 id={`${id}-aqi`} className={styles.sectionTitle}>
            AQI and the analogy use different inputs
          </h3>
          <p className={styles.sectionCopy}>
            PM2.5 AQI is AirNow’s source-supplied multi-hour NowCast on the U.S.
            EPA scale. The analogy uses only the latest raw hourly PM2.5
            concentration. They can rise or fall at different speeds.
          </p>
        </section>

        <section className={styles.section} aria-labelledby={`${id}-history`}>
          <p className={styles.sectionIndex}>03 · Measured history</p>
          <h3 id={`${id}-history`} className={styles.sectionTitle}>
            Gaps remain gaps
          </h3>
          <p className={styles.sectionCopy}>
            Historical equivalents add each measured hourly concentration in
            proportion to its duration. Missing hours are never filled or scaled
            into a full day. An accumulated value meets the display-completeness
            threshold only with at least 20 readings and no gap longer than
            three hours; missing hours still remain missing.
          </p>
        </section>
      </div>

      <section className={styles.boundary} aria-labelledby={`${id}-limits`}>
        <p className={styles.sectionIndex}>04 · What it cannot tell you</p>
        <h3 id={`${id}-limits`} className={styles.sectionTitle}>
          Outdoor monitoring is not personal exposure
        </h3>
        <p>
          Indoor filtration, time outdoors, activity, masks, distance from the
          monitor, PM2.5 composition, and other pollutants can all make a
          person’s actual exposure substantially different. Cigarette smoke and
          ambient air pollution are not chemically identical.
        </p>
      </section>

      <section className={styles.sources} aria-labelledby={`${id}-sources`}>
        <p className={styles.sectionIndex}>References</p>
        <h3 id={`${id}-sources`} className={styles.sectionTitle}>
          Sources and provenance
        </h3>
        <a className={styles.fullMethodLink} href="/methodology">
          Read the full methodology
          <span aria-hidden="true">→</span>
        </a>
        <ul>
          <li>
            <a
              href="https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/"
              target="_blank"
              rel="noreferrer"
            >
              Berkeley Earth cigarette-equivalence methodology
              <span className={styles.externalMark} aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
          <li>
            <a
              href="https://docs.airnowapi.org/docs/HourlyAQObsFactSheet.pdf"
              target="_blank"
              rel="noreferrer"
            >
              AirNow Hourly AQ Observations specification
              <span className={styles.externalMark} aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        </ul>
        <p className={styles.sourceNote}>
          AirNow observations are preliminary and may be revised. Original
          measurements remain separate from every derived value. Methodology
          version: <code>berkeley-earth-22-v1</code>.
        </p>
      </section>
    </aside>
  );
}
