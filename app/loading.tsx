import styles from "./system-state.module.css";

export default function Loading() {
  return (
    <main
      className={styles.page}
      id="main-content"
      aria-label="Opening the air quality explorer"
    >
      <section className={styles.note}>
        <p className={styles.eyebrow}>Reading the latest field report</p>
        <div className={styles.skeletonTitle} aria-hidden="true" />
        <div className={styles.skeletonLine} aria-hidden="true" />
        <div className={styles.skeletonMap} aria-hidden="true" />
        <span className="sr-only">Opening the air quality explorer…</span>
      </section>
    </main>
  );
}
