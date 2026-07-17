"use client";

import {
  BookOpen,
  Database,
  FlaskConical,
  List,
  Map as MapIcon,
  RefreshCw,
  RadioTower,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { AirQualityMap } from "@/components/air-quality-map";
import { MethodologyPanel } from "@/components/methodology-panel";
import { ReadingsList } from "@/components/readings-list";
import { StationPanel } from "@/components/station-panel";
import { classifyFreshness } from "@/lib/domain/freshness";
import { formatObservationTime } from "@/lib/ui/format";
import type {
  ApiErrorPayload,
  DisplayMode,
  ExplorerView,
  ReadingFeature,
  ReadingsFeatureCollection,
  StationHistoryResponse,
} from "@/lib/ui/types";

import styles from "./air-quality-explorer.module.css";

type ReadingsStatus = "loading" | "success" | "error";
type HistoryStatus = "idle" | "loading" | "success" | "error";

const VIEW_ORDER: readonly ExplorerView[] = ["map", "list"];
const REFRESH_INTERVAL_MS = 5 * 60 * 1_000;
const CLOCK_INTERVAL_MS = 60 * 1_000;
const ADAPTIVE_SHEET_MEDIA = "(max-width: 59.999rem)";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const DATA_MODE_DETAILS = {
  live: {
    label: "Live AirNow",
    note: "Latest preliminary file",
    Icon: RadioTower,
  },
  database: {
    label: "Collected archive",
    note: "Latest stored observations",
    Icon: Database,
  },
  demo: {
    label: "Demonstration",
    note: "Bundled sample readings",
    Icon: FlaskConical,
  },
} as const;

async function getErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error?.message?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function withCurrentFreshness(
  feature: ReadingFeature,
  now: number,
): ReadingFeature {
  const freshness = classifyFreshness(feature.properties.observedAt, now);
  return freshness === feature.properties.freshness
    ? feature
    : {
        ...feature,
        properties: { ...feature.properties, freshness },
      };
}

function isAdaptiveDetailSheet(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(ADAPTIVE_SHEET_MEDIA).matches
  );
}

function explorerFallbackFocusTarget(): HTMLElement | null {
  const selectedTab = document.querySelector<HTMLElement>(
    '[role="tab"][aria-selected="true"]',
  );
  return selectedTab?.id === "map-view-tab"
    ? (document.querySelector<HTMLElement>("#map-view-panel canvas") ??
        selectedTab)
    : selectedTab;
}

export function AirQualityExplorer() {
  const [readings, setReadings] =
    useState<ReadingsFeatureCollection | null>(null);
  const [readingsStatus, setReadingsStatus] =
    useState<ReadingsStatus>("loading");
  const [readingsError, setReadingsError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [adaptiveSheet, setAdaptiveSheet] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("aqi");
  const [view, setView] = useState<ExplorerView>("map");
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null,
  );
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [history, setHistory] = useState<StationHistoryResponse | null>(null);
  const [historyStatus, setHistoryStatus] =
    useState<HistoryStatus>("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRequestVersion, setHistoryRequestVersion] = useState(0);
  const readingsRef = useRef<ReadingsFeatureCollection | null>(null);
  const detailRailRef = useRef<HTMLDivElement | null>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const detailWasActiveRef = useRef(false);
  const detailRailActiveRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadReadings() {
      const hadReadings = readingsRef.current !== null;
      if (hadReadings) {
        setIsRefreshing(true);
        setRefreshError(null);
      } else {
        setReadingsStatus("loading");
        setReadingsError(null);
      }

      try {
        const response = await fetch("/api/v1/readings", {
          headers: { Accept: "application/geo+json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            await getErrorMessage(
              response,
              "Current air-quality readings are temporarily unavailable.",
            ),
          );
        }

        const payload = (await response.json()) as ReadingsFeatureCollection;
        if (
          payload.type !== "FeatureCollection" ||
          !Array.isArray(payload.features)
        ) {
          throw new Error("The readings service returned an unexpected response.");
        }

        readingsRef.current = payload;
        setReadings(payload);
        setReadingsStatus("success");
        setReadingsError(null);
        setRefreshError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Current air-quality readings are temporarily unavailable.";

        if (hadReadings) {
          setRefreshError(message);
        } else {
          readingsRef.current = null;
          setReadings(null);
          setReadingsStatus("error");
          setReadingsError(message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false);
        }
      }
    }

    void loadReadings();
    return () => controller.abort();
  }, [requestVersion]);

  useEffect(() => {
    let refreshTimer: number | null = null;
    let clockTimer: number | null = null;

    const stopTimers = () => {
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (clockTimer !== null) {
        window.clearInterval(clockTimer);
        clockTimer = null;
      }
    };

    const startVisibleTimers = () => {
      stopTimers();
      if (document.visibilityState !== "visible") {
        return;
      }

      clockTimer = window.setInterval(
        () => setClockNow(Date.now()),
        CLOCK_INTERVAL_MS,
      );
      refreshTimer = window.setInterval(
        () => setRequestVersion((version) => version + 1),
        REFRESH_INTERVAL_MS,
      );
    };

    const handleVisibilityChange = () => {
      stopTimers();
      if (document.visibilityState === "visible") {
        setClockNow(Date.now());
        setRequestVersion((version) => version + 1);
        startVisibleTimers();
      }
    };

    startVisibleTimers();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopTimers();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(ADAPTIVE_SHEET_MEDIA);
    const updateLayoutMode = () => setAdaptiveSheet(mediaQuery.matches);

    updateLayoutMode();
    mediaQuery.addEventListener("change", updateLayoutMode);
    return () => mediaQuery.removeEventListener("change", updateLayoutMode);
  }, []);

  const selectedReading = useMemo(
    () => {
      const feature = readings?.features.find(
        (feature) => feature.properties.stationId === selectedStationId,
      );
      return feature ? withCurrentFreshness(feature, clockNow) : null;
    },
    [clockNow, readings, selectedStationId],
  );

  const detailRailActive = methodologyOpen || selectedReading !== null;
  const isSheetModal = adaptiveSheet && detailRailActive;
  detailRailActiveRef.current = detailRailActive;

  const listReadings = useMemo(() => {
    const features = readings?.features ?? [];
    return view === "list"
      ? features.map((feature) => withCurrentFreshness(feature, clockNow))
      : features;
  }, [clockNow, readings, view]);

  useEffect(() => {
    if (
      readingsStatus === "success" &&
      selectedStationId &&
      !selectedReading
    ) {
      setSelectedStationId(null);
    }
  }, [readingsStatus, selectedReading, selectedStationId]);

  useEffect(() => {
    if (!selectedStationId) {
      setHistory(null);
      setHistoryStatus("idle");
      setHistoryError(null);
      return;
    }

    const controller = new AbortController();
    const stationId = selectedStationId;

    async function loadHistory() {
      setHistory(null);
      setHistoryStatus("loading");
      setHistoryError(null);

      try {
        const response = await fetch(
          `/api/v1/stations/${encodeURIComponent(stationId)}/history?hours=24`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            await getErrorMessage(
              response,
              "The 24-hour record for this monitor is temporarily unavailable.",
            ),
          );
        }

        setHistory((await response.json()) as StationHistoryResponse);
        setHistoryStatus("success");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setHistoryStatus("error");
        setHistoryError(
          error instanceof Error
            ? error.message
            : "The 24-hour record for this monitor is temporarily unavailable.",
        );
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [historyRequestVersion, selectedStationId]);

  const rememberDetailOpener = useCallback((explicitOpener?: HTMLElement) => {
    if (!isAdaptiveDetailSheet() || detailRailActiveRef.current) {
      return;
    }

    const activeElement =
      explicitOpener ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const opener =
      activeElement && activeElement !== document.body
        ? activeElement
        : explorerFallbackFocusTarget();

    if (opener && !detailRailRef.current?.contains(opener)) {
      detailOpenerRef.current = opener;
    }
  }, []);

  const selectStation = useCallback(
    (stationId: string) => {
      rememberDetailOpener();
      setMethodologyOpen(false);
      setSelectedStationId(stationId);
    },
    [rememberDetailOpener],
  );

  const selectReading = useCallback(
    (reading: ReadingFeature) => {
      selectStation(reading.properties.stationId);
    },
    [selectStation],
  );

  const toggleMethodology = useCallback(
    (opener: HTMLElement) => {
      if (!methodologyOpen) {
        rememberDetailOpener(opener);
      }
      setMethodologyOpen((open) => !open);
    },
    [methodologyOpen, rememberDetailOpener],
  );

  const closeMethodology = useCallback(() => setMethodologyOpen(false), []);
  const closeStation = useCallback(() => setSelectedStationId(null), []);
  const retryHistory = useCallback(
    () => setHistoryRequestVersion((version) => version + 1),
    [],
  );

  const handleDetailKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isAdaptiveDetailSheet() || !detailRailActiveRef.current) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (methodologyOpen) {
          setMethodologyOpen(false);
        } else {
          setSelectedStationId(null);
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const rail = detailRailRef.current;
      if (!rail) {
        return;
      }
      const focusable = Array.from(
        rail.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        rail.focus({ preventScroll: true });
      } else if (
        event.shiftKey &&
        (activeElement === first || !rail.contains(activeElement))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey &&
        (activeElement === last || !rail.contains(activeElement))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    },
    [methodologyOpen],
  );

  useEffect(() => {
    if (!isSheetModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSheetModal]);

  useEffect(() => {
    const wasActive = detailWasActiveRef.current;
    detailWasActiveRef.current = detailRailActive;
    let focusFrame: number | null = null;

    if (!detailRailActive) {
      if (wasActive) {
        const opener = detailOpenerRef.current;
        detailOpenerRef.current = null;
        const restoreTarget =
          opener?.isConnected === true
            ? opener
            : explorerFallbackFocusTarget();

        if (restoreTarget) {
          focusFrame = window.requestAnimationFrame(() => {
            restoreTarget.focus({ preventScroll: true });
          });
        }
      }

      return () => {
        if (focusFrame !== null) {
          window.cancelAnimationFrame(focusFrame);
        }
      };
    }

    const mediaQuery = window.matchMedia(ADAPTIVE_SHEET_MEDIA);
    const focusSheet = () => {
      if (!mediaQuery.matches) {
        return;
      }

      if (focusFrame !== null) {
        window.cancelAnimationFrame(focusFrame);
      }
      focusFrame = window.requestAnimationFrame(() => {
        const rail = detailRailRef.current;
        const closeButton = rail?.querySelector<HTMLElement>(
          'button[aria-label^="Close"]',
        );
        const heading = rail?.querySelector<HTMLElement>("h2");
        const focusTarget = closeButton ?? heading;

        if (focusTarget) {
          if (!closeButton) {
            focusTarget.tabIndex = -1;
          }
          focusTarget.focus({ preventScroll: true });
        }
      });
    };
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        focusSheet();
      }
    };

    focusSheet();
    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
      if (focusFrame !== null) {
        window.cancelAnimationFrame(focusFrame);
      }
    };
  }, [detailRailActive, methodologyOpen, selectedStationId]);

  const switchViewFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const currentIndex = VIEW_ORDER.indexOf(view);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % VIEW_ORDER.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + VIEW_ORDER.length) % VIEW_ORDER.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = VIEW_ORDER.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextView = VIEW_ORDER[nextIndex];
    setView(nextView);
    document.getElementById(`${nextView}-view-tab`)?.focus();
  };

  const retryReadings = () => setRequestVersion((version) => version + 1);
  const dataMode = readings?.meta.dataMode ?? null;
  const dataModeDetails = dataMode ? DATA_MODE_DETAILS[dataMode] : null;
  const DataModeIcon = dataModeDetails?.Icon;
  const newestObservedAt = readings?.meta.newestObservedAt ?? null;
  const showTruncatedState =
    readingsStatus === "success" && readings?.meta.truncated === true;

  return (
    <div
      className={styles.explorer}
      data-sheet-modal={isSheetModal || undefined}
    >
      <header
        className={styles.masthead}
        inert={isSheetModal ? true : undefined}
      >
        <div className={styles.identity}>
          <div className={styles.wordmark} aria-hidden="true">
            <span>AE</span>
          </div>
          <div>
            <p className={styles.kicker}>PM₂.₅ field map · North America</p>
            <h1 className={styles.title}>Air Equivalent</h1>
          </div>
        </div>

        <div className={styles.tools} aria-label="Map controls">
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel} id="label-mode-label">
              Marker label
            </span>
            <div
              className={styles.segmentedControl}
              role="group"
              aria-labelledby="label-mode-label"
            >
              <button
                className={styles.segmentButton}
                type="button"
                aria-pressed={displayMode === "aqi"}
                onClick={() => setDisplayMode("aqi")}
              >
                AQI
              </button>
              <button
                className={styles.segmentButton}
                type="button"
                aria-pressed={displayMode === "cigarettes"}
                onClick={() => setDisplayMode("cigarettes")}
              >
                Cigarette equivalent
              </button>
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Explore as</span>
            <div
              className={styles.segmentedControl}
              role="tablist"
              aria-label="Explorer view"
            >
              <button
                id="map-view-tab"
                className={styles.iconSegmentButton}
                type="button"
                role="tab"
                aria-selected={view === "map"}
                aria-controls="map-view-panel"
                tabIndex={view === "map" ? 0 : -1}
                onClick={() => setView("map")}
                onKeyDown={switchViewFromKeyboard}
              >
                <MapIcon aria-hidden="true" size={17} strokeWidth={1.8} />
                Map
              </button>
              <button
                id="list-view-tab"
                className={styles.iconSegmentButton}
                type="button"
                role="tab"
                aria-selected={view === "list"}
                aria-controls="list-view-panel"
                tabIndex={view === "list" ? 0 : -1}
                onClick={() => setView("list")}
                onKeyDown={switchViewFromKeyboard}
              >
                <List aria-hidden="true" size={17} strokeWidth={1.8} />
                List
              </button>
            </div>
          </div>

          <button
            className={styles.methodButton}
            type="button"
            aria-expanded={methodologyOpen}
            aria-controls="methodology-panel"
            onClick={(event) => toggleMethodology(event.currentTarget)}
          >
            <BookOpen aria-hidden="true" size={18} strokeWidth={1.8} />
            Methodology
          </button>
        </div>
      </header>

      <div
        className={styles.observationStrip}
        inert={isSheetModal ? true : undefined}
      >
        <div className={styles.sourceStatus} aria-live="polite">
          {readingsStatus === "loading" ? (
            <>
              <span className={styles.loadingMark} aria-hidden="true" />
              <span>Gathering current monitor readings…</span>
            </>
          ) : readingsStatus === "error" ? (
            <>
              <span className={styles.errorMark} aria-hidden="true">!</span>
              <span>Current readings unavailable</span>
            </>
          ) : dataModeDetails && DataModeIcon ? (
            <>
              <DataModeIcon aria-hidden="true" size={16} strokeWidth={1.8} />
              <strong>{dataModeDetails.label}</strong>
              <span className={styles.statusDivider} aria-hidden="true" />
              <span>{dataModeDetails.note}</span>
            </>
          ) : null}
          {isRefreshing && readings ? (
            <>
              <span className={styles.statusDivider} aria-hidden="true" />
              <span className={styles.refreshIndicator}>
                <span className={styles.loadingMark} aria-hidden="true" />
                Checking for updates…
              </span>
            </>
          ) : null}
        </div>

        {readingsStatus === "success" && readings ? (
          <div className={styles.observationMeta}>
            <span>
              Monitors <strong>{readings.meta.featureCount.toLocaleString()}</strong>
            </span>
            {newestObservedAt ? (
              <span>
                Latest observation{" "}
                <time dateTime={newestObservedAt}>
                  {formatObservationTime(newestObservedAt)}
                </time>
              </span>
            ) : null}
          </div>
        ) : null}

        {displayMode === "cigarettes" ? (
          <p className={styles.analogyNote} role="note">
            Rough projected rate if the latest outdoor PM₂.₅ level persisted
            for 24 hours — not personal exposure or actual smoking.
          </p>
        ) : null}
      </div>

      {readingsStatus === "error" ? (
        <section
          className={styles.notice}
          data-tone="error"
          role="alert"
          inert={isSheetModal ? true : undefined}
        >
          <div>
            <strong>We couldn’t reach the readings service.</strong>
            <p>{readingsError}</p>
          </div>
          <button type="button" onClick={retryReadings}>
            <RefreshCw aria-hidden="true" size={17} />
            Try current readings again
          </button>
        </section>
      ) : null}

      {refreshError && readings ? (
        <section
          className={styles.notice}
          data-tone="refresh"
          role="status"
          inert={isSheetModal ? true : undefined}
        >
          <div>
            <strong>The latest update check did not finish.</strong>
            <p>
              Showing the previous readings with their original observation
              times. {refreshError}
            </p>
          </div>
          <button type="button" onClick={retryReadings}>
            <RefreshCw aria-hidden="true" size={17} />
            Try the update again
          </button>
        </section>
      ) : null}

      {dataMode === "demo" ? (
        <section
          className={styles.notice}
          data-tone="demo"
          role="status"
          inert={isSheetModal ? true : undefined}
        >
          <div>
            <strong>These are demonstration readings.</strong>
            <p>
              The live provider could not be reached. Explore the interface, but
              do not use this sample to make outdoor plans.
            </p>
          </div>
        </section>
      ) : null}

      {showTruncatedState ? (
        <section
          className={styles.notice}
          data-tone="limited"
          role="status"
          inert={isSheetModal ? true : undefined}
        >
          <div>
            <strong>This view is limited.</strong>
            <p>
              Showing the first {readings?.meta.featureCount.toLocaleString()}{" "}
              monitor readings to keep the map responsive.
            </p>
          </div>
        </section>
      ) : null}

      <main id="main-content" className={styles.workspace}>
        <section
          className={styles.primaryPane}
          aria-label="Current readings"
          inert={isSheetModal ? true : undefined}
        >
          {view === "map" ? (
            <div
              id="map-view-panel"
              className={styles.viewPanel}
              role="tabpanel"
              aria-labelledby="map-view-tab"
              tabIndex={0}
            >
              <AirQualityMap
                readings={readings}
                selectedStationId={selectedStationId}
                displayMode={displayMode}
                onSelectStation={selectStation}
                error={readingsStatus === "error" ? readingsError : null}
                className={styles.map}
              />
            </div>
          ) : (
            <div
              id="list-view-panel"
              className={styles.viewPanel}
              role="tabpanel"
              aria-labelledby="list-view-tab"
              tabIndex={0}
            >
              <ReadingsList
                readings={listReadings}
                selectedStationId={selectedStationId}
                onSelect={selectReading}
                displayMode={displayMode}
                isLoading={readingsStatus === "loading"}
                errorMessage={readingsStatus === "error" ? readingsError : null}
              />
            </div>
          )}
        </section>

        <div
          ref={detailRailRef}
          className={styles.detailRail}
          data-active={detailRailActive}
          role={isSheetModal ? "dialog" : undefined}
          aria-modal={isSheetModal ? true : undefined}
          aria-labelledby={
            isSheetModal
              ? methodologyOpen
                ? "methodology-panel-title"
                : "station-panel-title"
              : undefined
          }
          tabIndex={isSheetModal ? -1 : undefined}
          onKeyDown={handleDetailKeyDown}
        >
          <div className={styles.sheetHandle} aria-hidden="true" />
          {methodologyOpen ? (
            <MethodologyPanel
              id="methodology-panel"
              onClose={closeMethodology}
              compact
            />
          ) : (
            <StationPanel
              reading={selectedReading}
              history={history}
              historyStatus={historyStatus}
              historyError={historyError}
              onRetryHistory={retryHistory}
              onClose={selectedReading ? closeStation : undefined}
            />
          )}
        </div>
      </main>
    </div>
  );
}
