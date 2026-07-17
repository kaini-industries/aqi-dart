import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";

import styles from "./methodology.module.css";

export const metadata = {
  title: "Methodology — Air Equivalent",
  description:
    "How Air Equivalent uses raw PM2.5 concentration, handles missing hours, and frames the cigarette-equivalent analogy.",
};

export default function MethodologyPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href="/">
          <ArrowLeft aria-hidden="true" size={17} strokeWidth={1.8} />
          Return to the map
        </Link>
        <span className={styles.edition}>Methodology · berkeley-earth-22-v1</span>
      </header>

      <main className={styles.layout} id="main-content">
        <aside className={styles.margin} aria-label="On this page">
          <p className={styles.kicker}>Field guide 01</p>
          <nav>
            <a href="#two-measures">Two measures</a>
            <a href="#calculation">The calculation</a>
            <a href="#history">Measured history</a>
            <a href="#limits">What it cannot tell you</a>
            <a href="#sources">Sources</a>
          </nav>
        </aside>

        <article className={styles.article}>
          <header className={styles.titleBlock}>
            <p className={styles.overline}>Air pollution, translated carefully</p>
            <h1>A memorable comparison, with its rough edges left visible.</h1>
            <p className={styles.lede}>
              Air Equivalent preserves AirNow’s PM2.5 AQI and separately turns
              the latest raw PM2.5 concentration into a rough health-impact
              analogy. It does not turn AQI into cigarettes, and it does not
              estimate what any individual person inhaled.
            </p>
          </header>

          <section className={styles.section} id="two-measures">
            <p className={styles.sectionNumber}>01</p>
            <div>
              <h2>Two measures, two time windows</h2>
              <div className={styles.comparison}>
                <div>
                  <h3>PM2.5 NowCast AQI</h3>
                  <p>
                    A U.S. EPA scale supplied by AirNow. It combines multiple
                    recent hours and is displayed unchanged, with its category
                    and preliminary-data status.
                  </p>
                </div>
                <div>
                  <h3>Projected equivalent</h3>
                  <p>
                    A rate based only on the latest raw hourly concentration.
                    It asks what the rough analogy would be if that outdoor
                    level persisted for a full 24 hours.
                  </p>
                </div>
              </div>
              <p className={styles.annotation}>
                These figures can move differently because their inputs and
                time windows are different.
              </p>
            </div>
          </section>

          <section className={styles.section} id="calculation">
            <p className={styles.sectionNumber}>02</p>
            <div>
              <h2>The current projected rate</h2>
              <div
                className={styles.formula}
                role="img"
                aria-label="PM2.5 concentration in micrograms per cubic meter divided by 22 equals cigarette-equivalents per day."
              >
                <span>PM2.5 concentration in µg/m³</span>
                <span aria-hidden="true">÷</span>
                <span>22</span>
                <span aria-hidden="true">=</span>
                <strong>cigarette-equivalents / day</strong>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <caption>Example projected rates</caption>
                  <thead>
                    <tr>
                      <th scope="col">PM2.5</th>
                      <th scope="col">If unchanged for 24 hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>11 µg/m³</td>
                      <td>0.5 cigarette-equivalents/day</td>
                    </tr>
                    <tr>
                      <td>22 µg/m³</td>
                      <td>1 cigarette-equivalent/day</td>
                    </tr>
                    <tr>
                      <td>44 µg/m³</td>
                      <td>2 cigarette-equivalents/day</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                When raw PM2.5 is missing or its unit is unsupported, the
                result is “not available.” The app never substitutes AQI or
                silently treats missing data as zero.
              </p>
            </div>
          </section>

          <section className={styles.section} id="history">
            <p className={styles.sectionNumber}>03</p>
            <div>
              <h2>Measured history keeps its gaps</h2>
              <p>
                With database-backed collection, each measured hour contributes
                only its own fraction of a day. Missing hours are not filled,
                interpolated, or extrapolated.
              </p>
              <div className={styles.inlineFormula}>
                Σ(hourly PM2.5 × 1 measured hour) ÷ (22 × 24)
              </div>
              <p>
                Every history summary reports captured hours, completeness,
                and the longest missing gap. A sparse total is therefore never
                presented as a complete day.
              </p>
            </div>
          </section>

          <section className={styles.section} id="limits">
            <p className={styles.sectionNumber}>04</p>
            <div>
              <h2>What the comparison cannot tell you</h2>
              <p className={styles.warning}>
                This does not mean someone smoked cigarettes. It is not inhaled
                particle-mass equivalence, a personal exposure estimate, or
                medical advice.
              </p>
              <p>
                Indoor filtration, time outside, breathing rate, activity,
                masks, monitor distance, local sources, particle composition,
                and missing readings can all make personal exposure
                substantially different. Follow official local health guidance
                during smoke and pollution events.
              </p>
            </div>
          </section>

          <section className={styles.section} id="sources">
            <p className={styles.sectionNumber}>05</p>
            <div>
              <h2>Sources and stewardship</h2>
              <ul className={styles.sources}>
                <li>
                  <a href="https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/">
                    Berkeley Earth — Air Pollution and Cigarette Equivalence
                    <ExternalLink aria-hidden="true" size={15} />
                  </a>
                </li>
                <li>
                  <a href="https://files.airnowtech.org/">
                    AirNow real-time data files
                    <ExternalLink aria-hidden="true" size={15} />
                  </a>
                </li>
                <li>
                  <a href="https://www.airnow.gov/aqi/">
                    U.S. EPA Air Quality Index resources
                    <ExternalLink aria-hidden="true" size={15} />
                  </a>
                </li>
              </ul>
              <p className={styles.footerNote}>
                AirNow observations are preliminary and may be revised. Air
                Equivalent retains true observation times and labels derived
                values separately from source data.
              </p>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
