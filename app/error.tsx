"use client";

import { useEffect } from "react";

import styles from "./system-state.module.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page} id="main-content">
      <section className={styles.note} aria-labelledby="error-title">
        <p className={styles.eyebrow}>Field note · interrupted</p>
        <h1 className={styles.title} id="error-title">
          The map could not open.
        </h1>
        <p className={styles.body}>
          Something went wrong in the interface. Your device and location were
          not changed. Try opening the explorer again.
        </p>
        <button className={styles.action} onClick={reset} type="button">
          Reopen the explorer
        </button>
      </section>
    </main>
  );
}
