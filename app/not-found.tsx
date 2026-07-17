import Link from "next/link";

import styles from "./system-state.module.css";

export default function NotFound() {
  return (
    <main className={styles.page} id="main-content">
      <section className={styles.note} aria-labelledby="not-found-title">
        <p className={styles.eyebrow}>Field note · 404</p>
        <h1 className={styles.title} id="not-found-title">
          No monitor at this address.
        </h1>
        <p className={styles.body}>
          This page does not exist. Return to the current PM2.5 map to continue
          exploring nearby readings.
        </p>
        <Link className={styles.action} href="/">
          Return to the map
        </Link>
      </section>
    </main>
  );
}
