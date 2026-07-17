"use client";

import maplibregl, {
  type ErrorEvent as MapErrorEvent,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { AQI_CATEGORIES } from "@/lib/domain/aqi";
import type {
  DisplayMode,
  ReadingsFeatureCollection,
} from "@/lib/ui/types";

import styles from "./air-quality-map.module.css";

const SOURCE_ID = "current-pm25-readings";
const CLUSTER_LAYER_ID = "reading-clusters";
const CLUSTER_COUNT_LAYER_ID = "reading-cluster-counts";
const SELECTION_LAYER_ID = "selected-reading-ring";
const READING_LAYER_ID = "individual-readings";
const READING_LABEL_LAYER_ID = "individual-reading-labels";

const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

const NORTH_AMERICA_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-168, 15],
  [-52, 72],
];

const CATEGORY_COLOR_EXPRESSION: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "aqiCategory"],
  "good",
  "#00e400",
  "moderate",
  "#ffff00",
  "unhealthy-for-sensitive-groups",
  "#ff7e00",
  "unhealthy",
  "#ff0000",
  "very-unhealthy",
  "#8f3f97",
  "hazardous",
  "#7e0023",
  "#7a8178",
];

const CLUSTER_COLOR_EXPRESSION: maplibregl.ExpressionSpecification = [
  "step",
  ["get", "maxAqi"],
  "#7a8178",
  0,
  "#00e400",
  51,
  "#ffff00",
  101,
  "#ff7e00",
  151,
  "#ff0000",
  201,
  "#8f3f97",
  301,
  "#7e0023",
];

const DARK_LABEL_EXPRESSION: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "aqiCategory"],
  "very-unhealthy",
  "#fffaf0",
  "hazardous",
  "#fffaf0",
  "#07110b",
];

interface MapReadingProperties {
  [key: string]: unknown;
  markerLabel: string;
  pm25Aqi: number | null;
  stationId: string;
}

interface MapFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: MapReadingProperties;
  }>;
}

export interface AirQualityMapProps {
  readings: ReadingsFeatureCollection | null;
  selectedStationId: string | null;
  displayMode: DisplayMode;
  onSelectStation: (stationId: string) => void;
  error?: string | null;
  className?: string;
}

function markerLabel(
  mode: DisplayMode,
  aqi: number | null,
  cigaretteEquivalent: number | null,
): string {
  if (mode === "aqi") {
    return aqi == null || !Number.isFinite(aqi) ? "—" : String(Math.round(aqi));
  }

  if (cigaretteEquivalent == null || !Number.isFinite(cigaretteEquivalent)) {
    return "—";
  }

  if (cigaretteEquivalent > 0 && cigaretteEquivalent < 0.1) {
    return "<0.1 cig";
  }

  const rounded =
    cigaretteEquivalent < 10
      ? cigaretteEquivalent.toFixed(1).replace(/\.0$/, "")
      : String(Math.round(cigaretteEquivalent));

  return `${rounded} cig`;
}

function categoryRange(min: number, max: number): string {
  return Number.isFinite(max) ? `${min}–${max}` : `${min}+`;
}

function AqiLegendItems() {
  return (
    <ul className={styles.legendGrid}>
      {AQI_CATEGORIES.map((category) => (
        <li className={styles.legendItem} key={category.id}>
          <span
            className={styles.legendSwatch}
            style={{ backgroundColor: category.color }}
            aria-hidden="true"
          />
          <span className={styles.legendLabel}>{category.shortLabel}</span>
          <span className={styles.legendRange}>
            {categoryRange(category.min, category.max)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function toMapData(
  readings: ReadingsFeatureCollection | null,
  mode: DisplayMode,
): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      readings?.features.map((feature) => ({
        type: feature.type,
        id: feature.id,
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          markerLabel: markerLabel(
            mode,
            feature.properties.pm25Aqi,
            feature.properties.projectedCigaretteEquivalentsPerDay,
          ),
        },
      })) ?? [],
  };
}

function selectedFilter(stationId: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "stationId"], stationId ?? ""];
}

function focusSelectedReading(
  map: MapLibreMap,
  data: MapFeatureCollection,
  stationId: string | null,
): void {
  if (!stationId) {
    return;
  }

  const selected = data.features.find(
    (feature) => feature.properties.stationId === stationId,
  );
  if (!selected) {
    return;
  }

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const { clientHeight, clientWidth } = map.getContainer();
  const offset: [number, number] =
    window.innerWidth < 768
      ? [0, -Math.min(clientHeight * 0.32, 240)]
      : window.innerWidth < 960
        ? [-Math.min(clientWidth * 0.27, 208), 0]
        : [0, 0];

  map.easeTo({
    center: selected.geometry.coordinates,
    zoom: Math.max(map.getZoom(), 11),
    offset,
    duration: reduceMotion ? 0 : 480,
  });
}

function addReadingLayers(
  map: MapLibreMap,
  data: MapFeatureCollection,
  selectedStationId: string | null,
  displayMode: DisplayMode,
): void {
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 50,
    clusterProperties: {
      maxAqi: ["max", ["coalesce", ["get", "pm25Aqi"], -1]],
    },
  });

  map.addLayer({
    id: CLUSTER_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": CLUSTER_COLOR_EXPRESSION,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        22,
        20,
        26,
        100,
        31,
        500,
        36,
      ],
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.94,
    },
  });

  map.addLayer({
    id: CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": [
        "concat",
        ["to-string", ["get", "point_count_abbreviated"]],
        "\n",
        [
          "case",
          ["<", ["get", "maxAqi"], 0],
          "AQI —",
          ["concat", "max ", ["to-string", ["round", ["get", "maxAqi"]]]],
        ],
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-line-height": 1.05,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": [
        "step",
        ["get", "maxAqi"],
        "#07110b",
        0,
        "#07110b",
        201,
        "#fffaf0",
      ],
      "text-halo-color": "rgba(7, 17, 11, 0.55)",
      "text-halo-width": 0.5,
    },
  });

  map.addLayer({
    id: SELECTION_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: selectedFilter(selectedStationId),
    paint: {
      "circle-color": "rgba(255, 250, 240, 0.86)",
      "circle-radius": displayMode === "cigarettes" ? 32 : 30,
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 3,
    },
  });

  map.addLayer({
    id: READING_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": CATEGORY_COLOR_EXPRESSION,
      "circle-radius": displayMode === "cigarettes" ? 24 : 22,
      "circle-stroke-color": "#17231b",
      "circle-stroke-width": 1.4,
      "circle-opacity": [
        "match",
        ["get", "freshness"],
        "expired",
        0.56,
        "stale",
        0.78,
        0.96,
      ],
    },
  });

  map.addLayer({
    id: READING_LABEL_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "markerLabel"],
      "text-font": ["Noto Sans Regular"],
      "text-size": displayMode === "cigarettes" ? 10 : 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-letter-spacing": displayMode === "cigarettes" ? 0 : 0.02,
    },
    paint: {
      "text-color": DARK_LABEL_EXPRESSION,
      "text-halo-color": "rgba(7, 17, 11, 0.55)",
      "text-halo-width": 0.35,
    },
  });
}

function errorDescription(error: MapErrorEvent): string {
  const message = error.error?.message?.toLowerCase() ?? "";
  if (message.includes("webgl")) {
    return "This browser could not start the interactive map. The monitor list still contains the same readings.";
  }
  return "The map background could not be loaded. The monitor list still contains the same readings.";
}

export function AirQualityMap({
  readings,
  selectedStationId,
  displayMode,
  onSelectStation,
  error,
  className,
}: AirQualityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dataRef = useRef<MapFeatureCollection>(toMapData(readings, displayMode));
  const selectedStationIdRef = useRef(selectedStationId);
  const displayModeRef = useRef(displayMode);
  const onSelectStationRef = useRef(onSelectStation);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const mapData = useMemo(
    () => toMapData(readings, displayMode),
    [readings, displayMode],
  );

  useEffect(() => {
    dataRef.current = mapData;
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(mapData);
  }, [mapData]);

  useEffect(() => {
    onSelectStationRef.current = onSelectStation;
  }, [onSelectStation]);

  useEffect(() => {
    selectedStationIdRef.current = selectedStationId;
    const map = mapRef.current;
    if (map?.getLayer(SELECTION_LAYER_ID)) {
      map.setFilter(SELECTION_LAYER_ID, selectedFilter(selectedStationId));
      focusSelectedReading(map, dataRef.current, selectedStationId);
    }
  }, [selectedStationId]);

  useEffect(() => {
    displayModeRef.current = displayMode;
    const map = mapRef.current;
    if (!map?.getLayer(READING_LABEL_LAYER_ID)) {
      return;
    }

    map.setLayoutProperty(
      READING_LABEL_LAYER_ID,
      "text-size",
      displayMode === "cigarettes" ? 10 : 12,
    );
    map.setLayoutProperty(
      READING_LABEL_LAYER_ID,
      "text-letter-spacing",
      displayMode === "cigarettes" ? 0 : 0.02,
    );
    map.setPaintProperty(
      READING_LAYER_ID,
      "circle-radius",
      displayMode === "cigarettes" ? 24 : 22,
    );
    map.setPaintProperty(
      SELECTION_LAYER_ID,
      "circle-radius",
      displayMode === "cigarettes" ? 32 : 30,
    );
  }, [displayMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE,
        bounds: NORTH_AMERICA_BOUNDS,
        fitBoundsOptions: { padding: 28, maxZoom: 4.2 },
        attributionControl: false,
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
      });
    } catch {
      setMapError(
        "This browser could not start the interactive map. The monitor list still contains the same readings.",
      );
      return;
    }

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: false },
        showAccuracyCircle: true,
        showUserLocation: true,
        trackUserLocation: false,
      }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          'Air readings: <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer">AirNow</a>',
      }),
      "bottom-right",
    );

    const onLoad = () => {
      addReadingLayers(
        map,
        dataRef.current,
        selectedStationIdRef.current,
        displayModeRef.current,
      );
      focusSelectedReading(
        map,
        dataRef.current,
        selectedStationIdRef.current,
      );
      const canvas = map.getCanvas();
      canvas.setAttribute(
        "aria-label",
        "Interactive map of current North American PM2.5 monitor readings. Use the synchronized monitor list for a non-map view.",
      );
      setMapError(null);
      setIsMapReady(true);
    };

    const onError = (event: MapErrorEvent) => {
      if (!map.isStyleLoaded()) {
        setMapError(errorDescription(event));
      }
    };

    const onClusterClick = async (event: MapLayerMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER_ID],
      })[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      if (!feature || !Number.isFinite(clusterId) || feature.geometry.type !== "Point") {
        return;
      }

      const source = map.getSource(SOURCE_ID) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map.easeTo({
        center: feature.geometry.coordinates as [number, number],
        zoom,
        duration: reduceMotion ? 0 : 420,
      });
    };

    const onReadingClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const stationId = feature?.properties?.stationId;
      if (typeof stationId === "string" && stationId.length > 0) {
        onSelectStationRef.current(stationId);
      }
    };

    const setPointerCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointerCursor = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("load", onLoad);
    map.on("error", onError);
    map.on("click", CLUSTER_LAYER_ID, onClusterClick);
    map.on("click", READING_LAYER_ID, onReadingClick);
    map.on("mouseenter", CLUSTER_LAYER_ID, setPointerCursor);
    map.on("mouseleave", CLUSTER_LAYER_ID, clearPointerCursor);
    map.on("mouseenter", READING_LAYER_ID, setPointerCursor);
    map.on("mouseleave", READING_LAYER_ID, clearPointerCursor);

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const stateMessage = error
    ? {
        title: "Current readings unavailable",
        detail: `${error} Try refreshing this page.`,
        tone: "error" as const,
      }
    : mapError
      ? { title: "Map unavailable", detail: mapError, tone: "error" as const }
      : readings === null || !isMapReady
        ? {
            title: "Plotting current monitors",
            detail: "Loading the latest available PM2.5 observations.",
            tone: "loading" as const,
          }
        : readings.features.length === 0
          ? {
              title: "No current monitors to plot",
              detail:
                "Coverage can be sparse. An empty view does not mean the air is clean.",
              tone: "empty" as const,
            }
          : null;

  return (
    <section
      className={[styles.root, className].filter(Boolean).join(" ")}
      aria-label="Current air quality map"
      aria-busy={readings === null}
    >
      <div ref={containerRef} className={styles.map} />

      {stateMessage ? (
        <div className={styles.stateLayer} aria-live="polite">
          <div
            className={`${styles.stateNote} ${
              stateMessage.tone === "error" ? styles.stateError : ""
            }`}
          >
            <span className={styles.stateTitle}>{stateMessage.title}</span>
            <span className={styles.stateDetail}>{stateMessage.detail}</span>
          </div>
        </div>
      ) : null}

      <aside className={styles.desktopLegend} aria-label="AQI category key">
        <span className={styles.legendHeading}>AQI field key</span>
        <AqiLegendItems />
      </aside>

      <details className={styles.mobileLegend}>
        <summary>AQI field key</summary>
        <AqiLegendItems />
      </details>

      <div className={styles.scaleNote} aria-hidden="true">
        <span className={styles.scaleRule} />
        <span>North America · current monitors</span>
      </div>
    </section>
  );
}
